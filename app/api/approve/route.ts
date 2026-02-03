export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();
    
    // 1. INITIALIZE SUPABASE
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 2. FETCH ORDER
    const { data: order, error: dbError } = await supabase
      .from('translations')
      .select('*')
      .eq('id', orderId)
      .single();

    if (dbError || !order) throw new Error('Order not found.');

    // 3. GENERATE SECURE ACCESS LINK
    const filePath = order.image_url.split('/documents/')[1]; 
    const { data: signedData } = await supabase.storage
      .from('documents')
      .createSignedUrl(filePath, 900); // 15 mins for heavy processing

    if (!signedData?.signedUrl) throw new Error("Could not generate secure file access.");

    // 4. MARK AS PROCESSING (Triggers Admin UI Spinner)
    await supabase.from('translations').update({ 
      processing_status: 'processing',
      processing_percentage: 5 
    }).eq('id', orderId);

    // 5. SUBMIT TASK TO WAVESPEED
    const submitRes = await fetch("https://api.wavespeed.ai/api/v3/wavespeed-ai/image-translator", {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}`,
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        image: signedData.signedUrl,
        target_language: "english",
        output_format: "jpeg",
        enable_sync_mode: false // Keep it async to prevent timeouts
      })
    });

    // Extract Task ID using robust parsing to avoid "Position 4" errors
    const rawSubmitText = await submitRes.text();
    const cleanSubmitJson = JSON.parse(rawSubmitText.match(/\{[\s\S]*?\}/)?.[0] || "{}");
    const taskId = cleanSubmitJson.id || cleanSubmitJson.data?.id;

    if (!taskId) throw new Error(`WaveSpeed did not provide a Task ID. Response: ${rawSubmitText}`);

    // 6. FIRE-AND-FORGET POLLING
    // We do NOT 'await' this. It runs in the background while the UI returns immediately.
    pollWaveSpeedInBackground(taskId, orderId, supabase);

    return NextResponse.json({ 
      success: true, 
      message: "AI Reconstruction started in background." 
    });

  } catch (err: any) {
    console.error("APPROVE_ROUTE_CRITICAL_FAILURE:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Background Worker: Polls WaveSpeed and Updates Percentage in Supabase
 */
async function pollWaveSpeedInBackground(taskId: string, orderId: string, supabase: any) {
  const maxAttempts = 25; // ~150 seconds total
  let finalUrl = "";

  for (let i = 1; i <= maxAttempts; i++) {
    // Wait 6 seconds between checks
    await new Promise(r => setTimeout(r, 6000));

    // Calculate simulated percentage (reaches ~90% before completion)
    const progressPercent = Math.min(Math.round((i / maxAttempts) * 90), 95);
    
    // Update DB with current progress for real-time UI
    await supabase.from('translations').update({ 
      processing_percentage: progressPercent 
    }).eq('id', orderId);

    try {
      const statusRes = await fetch(`https://api.wavespeed.ai/api/v3/predictions/${taskId}/result`, {
        headers: { 'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}` }
      });
      
      const rawStatusText = await statusRes.text();
      const statusData = JSON.parse(rawStatusText.match(/\{[\s\S]*?\}/)?.[0] || "{}");

      // Handle Success
      if (statusData.status === "completed" || statusData.data?.status === "completed") {
        finalUrl = statusData.data?.outputs?.[0] || statusData.outputs?.[0];
        
        if (finalUrl) {
          await supabase.from('translations').update({ 
            translated_url: finalUrl,
            processing_status: 'ready',
            processing_percentage: 100 
          }).eq('id', orderId);
          return; // Exit loop
        }
      }

      // Handle Failure
      if (statusData.status === "failed" || statusData.data?.status === "failed") {
        await supabase.from('translations').update({ 
          processing_status: 'failed',
          processing_percentage: 0 
        }).eq('id', orderId);
        return;
      }

    } catch (e) {
      console.error("POLLING_ITERATION_ERROR:", e);
    }
  }

  // If we reach here, it timed out
  await supabase.from('translations').update({ processing_status: 'timeout' }).eq(orderId);
}