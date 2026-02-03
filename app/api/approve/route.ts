export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Robust Regex-based JSON parser
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
  // Initialize Supabase inside the handler
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let currentOrderId: string | null = null;

  try {
    const body = await req.json();
    currentOrderId = body.orderId;

    if (!currentOrderId) throw new Error("Missing Order ID");

    // 1. Fetch Order Data
    const { data: order } = await supabase
      .from('translations')
      .select('*')
      .eq('id', currentOrderId)
      .single();

    if (!order) throw new Error('Order not found.');

    // 2. Mark as Processing (10%)
    await supabase.from('translations').update({ 
      processing_status: 'processing',
      processing_percentage: 10 
    }).eq('id', currentOrderId);

    // 3. Generate Secure Signed URL
    const filePath = order.image_url.includes('/documents/') 
      ? order.image_url.split('/documents/')[1] 
      : order.image_url.split('/').pop(); 
      
    const { data: signedData } = await supabase.storage
      .from('documents')
      .createSignedUrl(filePath!, 900);

    if (!signedData?.signedUrl) throw new Error("Storage Access Failed");

    // 4. Submit to WaveSpeed (Linear Execution to ensure History update)
    const submitRes = await fetch("https://api.wavespeed.ai/api/v3/wavespeed-ai/image-translator", {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}`,
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        image: signedData.signedUrl,
        target_language: "english",
        output_format: "jpeg"
      })
    });

    const rawSubmitText = await submitRes.text();
    const submitData = robustParse(rawSubmitText);
    const taskId = submitData?.id || submitData?.data?.id;

    if (!taskId) {
      console.error("WAVESPEED_ERROR:", rawSubmitText);
      throw new Error("WaveSpeed did not return a valid Task ID.");
    }

    // 5. Trigger Background Polling
    // We update to 20% to show movement before handing off
    await supabase.from('translations').update({ 
      processing_percentage: 20 
    }).eq('id', currentOrderId);
    
    pollInBack(taskId, currentOrderId, supabase);

    return NextResponse.json({ success: true, taskId });

  } catch (err: any) {
    console.error("APPROVE_CRITICAL_FAILURE:", err.message);
    
    // Fixed: Use the locally scoped currentOrderId instead of req.body
    if (currentOrderId) {
      await supabase.from('translations').update({ 
        processing_status: 'failed', 
        processing_percentage: 0 
      }).eq('id', currentOrderId);
    }

    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function pollInBack(taskId: string, orderId: string, supabase: any) {
  const maxAttempts = 30; 
  for (let i = 1; i <= maxAttempts; i++) {
    // Wait 7 seconds between checks
    await new Promise(r => setTimeout(r, 7000));

    // Simulated progress logic (20% -> 98%)
    const progress = Math.min(20 + Math.round((i / maxAttempts) * 75), 98);
    
    await supabase.from('translations').update({ 
      processing_percentage: progress 
    }).eq('id', orderId);

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
        await supabase.from('translations').update({ 
          processing_status: 'failed' 
        }).eq('id', orderId);
        return;
      }
    } catch (e) {
      console.error("Poll Iteration Failed:", i);
    }
  }
}