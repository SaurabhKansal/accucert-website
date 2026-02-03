export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  let currentOrderId: string = "";

  try {
    const body = await req.json();
    currentOrderId = body.orderId;

    const { data: order } = await supabase.from('translations').select('*').eq('id', currentOrderId).single();
    if (!order) throw new Error('Order not found.');

    // 1. Mark status as processing (No percentage needed)
    await supabase.from('translations').update({ processing_status: 'processing' }).eq('id', currentOrderId);

    // 2. Storage & WaveSpeed Submission
    const filePath = order.image_url.includes('/documents/') ? order.image_url.split('/documents/')[1] : order.image_url.split('/').pop(); 
    const { data: signedData } = await supabase.storage.from('documents').createSignedUrl(filePath!, 900);

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

    const rawText = await submitRes.text();
    
    // 3. SILENT SUCCESS: We extract the ID only to start the poller.
    // If extraction fails but the request was 200, we don't crash.
    const taskIdMatch = rawText.match(/"id"\s*:\s*"([^"]+)"/);
    const taskId = taskIdMatch ? taskIdMatch[1] : null;

    if (taskId) {
      pollForImage(taskId, currentOrderId, supabase);
    }

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("SILENT_START_ERROR:", err.message);
    return NextResponse.json({ success: true }); // We return success anyway so the UI stays open
  }
}

async function pollForImage(taskId: string, orderId: string, supabase: any) {
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 8000)); // Check every 8 seconds

    try {
      const res = await fetch(`https://api.wavespeed.ai/api/v3/predictions/${taskId}/result`, {
        headers: { 'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}` }
      });
      const data = await res.json();
      
      const status = data.status || data.data?.status;
      const url = data.outputs?.[0] || data.data?.outputs?.[0];

      if (status === "completed" && url) {
        // THIS IS THE MOMENT: We save the URL and the dashboard will show it!
        await supabase.from('translations').update({ 
          translated_url: url,
          processing_status: 'ready' 
        }).eq('id', orderId);
        return;
      }
    } catch (e) { /* keep trying */ }
  }
}