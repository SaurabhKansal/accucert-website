export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const robustParse = (text: string) => {
  try {
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
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    const { data: order } = await supabase.from('translations').select('*').eq('id', orderId).single();
    if (!order) throw new Error('Order not found.');

    // 1. Mark as Processing (Step 1 of 100%)
    await supabase.from('translations').update({ 
      processing_status: 'processing',
      processing_percentage: 10 
    }).eq('id', orderId);

    // 2. Generate Signed URL
    const filePath = order.image_url.includes('/documents/') 
      ? order.image_url.split('/documents/')[1] 
      : order.image_url.split('/').pop(); 
      
    const { data: signedData } = await supabase.storage.from('documents').createSignedUrl(filePath!, 900);

    // 3. Submit to WaveSpeed V3
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
    const taskId = submitData?.id || submitData?.data?.id;

    if (!taskId) {
      console.error("WAVESPEED_REJECTION:", rawSubmitText);
      throw new Error("WaveSpeed failed to initialize task.");
    }

    // 4. Fire the Background Polling
    // We do NOT await this. It runs independently.
    pollWaveSpeedInBackground(taskId, orderId, supabase);

    // 5. RETURN IMMEDIATELY (Stops Frontend Timeouts)
    return NextResponse.json({ success: true, taskId });

  } catch (err: any) {
    console.error("APPROVE_ROUTE_FAILURE:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function pollWaveSpeedInBackground(taskId: string, orderId: string, supabase: any) {
  const maxAttempts = 30; 
  for (let i = 1; i <= maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 6000));

    // Update Simulated Progress in DB (reaches ~98% before completion)
    const progress = Math.min(Math.round((i / maxAttempts) * 90), 98);
    await supabase.from('translations').update({ processing_percentage: progress }).eq('id', orderId);

    try {
      // Use result endpoint directly as per WaveSpeed V3 docs
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

      if (result?.status === "failed" || result?.data?.status === "failed") {
        await supabase.from('translations').update({ 
          processing_status: 'failed',
          processing_percentage: 0 
        }).eq('id', orderId);
        return;
      }
    } catch (e) {
      console.error(`Polling Error (Attempt ${i}):`, e);
    }
  }
  
  // Final Timeout Fallback
  await supabase.from('translations').update({ processing_status: 'failed' }).eq('id', orderId);
}