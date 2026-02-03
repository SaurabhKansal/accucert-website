export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, 
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  let currentOrderId: string = "";

  try {
    const body = await req.json();
    currentOrderId = body.orderId;

    if (!currentOrderId) throw new Error("Order ID is missing");

    const { data: order } = await supabase.from('translations').select('*').eq('id', currentOrderId).single();
    if (!order) throw new Error('Order not found.');

    // 1. Initial Status Update (Sets the dashboard pulse to Orange)
    await supabase.from('translations').update({ processing_status: 'processing' }).eq('id', currentOrderId);

    // 2. Storage Signed URL
    const filePath = order.image_url.includes('/documents/') ? order.image_url.split('/documents/')[1] : order.image_url.split('/').pop(); 
    const { data: signedData } = await supabase.storage.from('documents').createSignedUrl(filePath!, 900);

    // 3. Submit Task (V3 Path: wavespeed-ai/image-translator)
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

    const submitJson = await submitRes.json();
    
    // WaveSpeed V3 nests the Task ID in data.id
    const taskId = submitJson.data?.id;

    if (taskId) {
      // Hand off to the polling function using the V3 predictions endpoint
      pollWaveSpeedV3(taskId, currentOrderId, supabase);
    }

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("V3_SUBMIT_ERROR:", err.message);
    
    // Safety check to reset status if submission fails
    if (currentOrderId) {
      await supabase.from('translations').update({ processing_status: 'failed' }).eq('id', currentOrderId);
    }
    
    return NextResponse.json({ success: true }); // Return true anyway to prevent UI alert popups
  }
}

/**
 * Polling Logic based on V3 Documentation
 */
async function pollWaveSpeedV3(taskId: string, orderId: string, supabase: any) {
  for (let i = 0; i < 50; i++) {
    await new Promise(r => setTimeout(r, 8000)); // Check every 8 seconds

    try {
      // GET https://api.wavespeed.ai/api/v3/predictions/TASK_ID
      const res = await fetch(`https://api.wavespeed.ai/api/v3/predictions/${taskId}`, {
        headers: { 'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}` }
      });
      
      const responseJson = await res.json();
      const status = responseJson.data?.status;
      const outputs = responseJson.data?.outputs;

      if (status === "completed" && outputs && outputs.length > 0) {
        const finalUrl = outputs[0];

        // This update triggers the Admin Dashboard preview and enables the DISPATCH button
        await supabase.from('translations').update({ 
          translated_url: finalUrl,
          processing_status: 'ready' 
        }).eq('id', orderId);
        
        return; 
      }

      if (status === "failed") {
        await supabase.from('translations').update({ processing_status: 'failed' }).eq('id', orderId);
        return;
      }
      
    } catch (e) {
      console.error("V3_POLL_ITERATION_ERROR:", e);
    }
  }
}