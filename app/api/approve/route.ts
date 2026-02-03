export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Helper to handle "Dirty" JSON from APIs (Fixes Position 233 Error)
const robustParse = (text: string) => {
  try {
    // Finds the first valid { ... } block and ignores everything else
    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch (e) {
    return null;
  }
};

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    
    const { data: order } = await supabase.from('translations').select('*').eq('id', orderId).single();
    if (!order) throw new Error('Order not found.');

    // 1. Mark as Processing immediately
    await supabase.from('translations').update({ 
      processing_status: 'processing',
      processing_percentage: 10 
    }).eq('id', orderId);

    // 2. Secure File Access
    const filePath = order.image_url.split('/documents/')[1]; 
    const { data: signedData } = await supabase.storage.from('documents').createSignedUrl(filePath, 900);

    // 3. Submit to WaveSpeed
    const submitRes = await fetch("https://api.wavespeed.ai/api/v3/wavespeed-ai/image-translator", {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}`,
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        image: signedData?.signedUrl,
        target_language: "english",
        output_format: "jpeg"
      })
    });

    const rawSubmitText = await submitRes.text();
    const submitData = robustParse(rawSubmitText);
    
    // We look for 'id' at the top level or inside 'data'
    const taskId = submitData?.id || submitData?.data?.id;

    if (!taskId) {
      console.error("WAVESPEED_RAW_RESPONSE:", rawSubmitText);
      throw new Error("WaveSpeed failed to return a valid Task ID.");
    }

    // 4. Background Polling (Fire and Forget)
    pollWaveSpeedInBackground(taskId, orderId, supabase);

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("APPROVE_ROUTE_CRITICAL_FAILURE:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function pollWaveSpeedInBackground(taskId: string, orderId: string, supabase: any) {
  const maxAttempts = 30; 
  for (let i = 1; i <= maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 6000));

    // Update Simulated Progress
    const progress = Math.min(Math.round((i / maxAttempts) * 90), 98);
    await supabase.from('translations').update({ processing_percentage: progress }).eq('id', orderId);

    try {
      const res = await fetch(`https://api.wavespeed.ai/api/v3/predictions/${taskId}/result`, {
        headers: { 'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}` }
      });
      
      const rawText = await res.text();
      const result = robustParse(rawText);

      if (result?.status === "completed" || result?.data?.status === "completed") {
        const url = result?.data?.outputs?.[0] || result?.outputs?.[0];
        if (url) {
          await supabase.from('translations').update({ 
            translated_url: url,
            processing_status: 'ready',
            processing_percentage: 100 
          }).eq('id', orderId);
          return;
        }
      }

      if (result?.status === "failed") {
        await supabase.from('translations').update({ processing_status: 'failed' }).eq('id', orderId);
        return;
      }
    } catch (e) {
      console.error("POLLING_ERROR_ITERATION:", i);
    }
  }
}