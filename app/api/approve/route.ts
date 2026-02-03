export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Robust Regex-based JSON parser to handle "dirty" API responses
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

    // 1. Initial Data Check
    const { data: order } = await supabase.from('translations').select('*').eq('id', orderId).single();
    if (!order) throw new Error('Order not found.');

    // 2. MARK AS PROCESSING IMMEDIATELY
    // This ensures the Admin UI starts the spinner/bar instantly
    await supabase.from('translations').update({ 
      processing_status: 'processing',
      processing_percentage: 5 
    }).eq('id', orderId);

    // 3. START ENTIRE WORKFLOW IN BACKGROUND
    // We do NOT 'await' this. We fire it and let it run on the server.
    startFullAiWorkflow(orderId, order.image_url, supabase);

    // 4. RETURN INSTANT SUCCESS
    // This stops the frontend from throwing "Failed to start AI task"
    return NextResponse.json({ success: true, message: "Workflow started." });

  } catch (err: any) {
    console.error("APPROVE_ROUTE_CRITICAL_FAILURE:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Background Orchestrator
 * Handles: Signed URL -> WaveSpeed Submit -> Polling
 */
async function startFullAiWorkflow(orderId: string, imageUrl: string, supabase: any) {
  try {
    // A. Generate Signed URL
    const filePath = imageUrl.includes('/documents/') 
      ? imageUrl.split('/documents/')[1] 
      : imageUrl.split('/').pop(); 
      
    const { data: signedData } = await supabase.storage.from('documents').createSignedUrl(filePath!, 900);
    if (!signedData?.signedUrl) throw new Error("Access Denied to Storage");

    // B. Submit to WaveSpeed
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

    if (!taskId) throw new Error(`WaveSpeed Submit Error: ${rawSubmitText}`);

    // C. Begin Polling Loop
    const maxAttempts = 30; 
    for (let i = 1; i <= maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 6000));

      // Update Simulated Progress in DB
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
            return; // Finished successfully
          }
        }

        if (result?.status === "failed" || result?.data?.status === "failed") {
          await supabase.from('translations').update({ processing_status: 'failed' }).eq('id', orderId);
          return;
        }
      } catch (pollErr) {
        console.error("POLLING_RETRY:", i);
      }
    }

    // If we reach here, the 3-minute limit was hit
    await supabase.from('translations').update({ processing_status: 'failed' }).eq('id', orderId);

  } catch (backgroundErr: any) {
    console.error("BACKGROUND_WORKFLOW_CRASH:", backgroundErr.message);
    await supabase.from('translations').update({ processing_status: 'failed' }).eq('id', orderId);
  }
}