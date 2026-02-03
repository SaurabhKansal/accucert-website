export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use require to bypass the TypeScript module error you had earlier
const CloudConvert = require('cloudconvert');
const cloudConvert = new CloudConvert(process.env.CLOUDCONVERT_API_KEY!);

export async function POST(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, 
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  let currentOrderId: string = "";

  try {
    const body = await req.json();
    currentOrderId = body.orderId;

    const { data: order } = await supabase.from('translations').select('*').eq('id', currentOrderId).single();
    if (!order) throw new Error('Order not found.');

    // 1. Initial UI update
    await supabase.from('translations').update({ processing_status: 'processing' }).eq('id', currentOrderId);

    const originalPath = order.image_url.includes('/documents/') ? order.image_url.split('/documents/')[1] : order.image_url.split('/').pop(); 
    const fileExt = originalPath?.split('.').pop()?.toLowerCase();
    
    let finalProcessUrl = "";

    // --- CLOUDCONVERT LOGIC (PDF/DOCX) ---
    if (['pdf', 'docx', 'doc'].includes(fileExt || "")) {
      console.log(`📡 CloudConvert: Starting conversion for ${fileExt}`);
      
      const { data: fileBlob } = await supabase.storage.from('documents').download(originalPath!);
      const fileBuffer = Buffer.from(await fileBlob!.arrayBuffer());

      // Create a Job as per V2 Documentation
      const job = await cloudConvert.jobs.create({
        tasks: {
          'import-it': { 
            operation: 'import/base64', 
            file: fileBuffer.toString('base64'), 
            filename: `input.${fileExt}` 
          },
          'convert-it': { 
            operation: 'convert', 
            input: 'import-it', 
            output_format: 'jpg', 
            width: 2200 // High density for AI OCR
          },
          'export-it': { 
            operation: 'export/url', 
            input: 'convert-it' 
          }
        }
      });

      // Wait for completion
      const finishedJob = await cloudConvert.jobs.wait(job.id);
      
      // Look for the specific export task
      const exportTask = finishedJob.tasks.find((t: any) => t.name === 'export-it' && t.status === 'finished');
      
      if (!exportTask || !exportTask.result?.files?.[0]?.url) {
        throw new Error("CloudConvert failed to generate a public URL.");
      }

      finalProcessUrl = exportTask.result.files[0].url;
      console.log("✅ CloudConvert Success. JPG URL generated.");
    } 
    // --- DIRECT IMAGE PATH ---
    else {
      const { data: signedData } = await supabase.storage.from('documents').createSignedUrl(originalPath!, 900);
      finalProcessUrl = signedData?.signedUrl || "";
    }

    // --- WAVESPEED V3 SUBMISSION ---
    // documentation: POST https://api.wavespeed.ai/api/v3/wavespeed-ai/image-translator
    const submitRes = await fetch("https://api.wavespeed.ai/api/v3/wavespeed-ai/image-translator", {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ 
        image: finalProcessUrl, 
        target_language: "english", 
        output_format: "jpeg" 
      })
    });

    const submitJson = await submitRes.json();
    const taskId = submitJson.data?.id;

    if (taskId) {
      pollWaveSpeedV3(taskId, currentOrderId, supabase);
    } else {
      console.error("WaveSpeed Reject Raw:", JSON.stringify(submitJson));
      throw new Error("WaveSpeed rejected the converted image URL.");
    }

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("🛑 VAULT_ENGINE_CRASH:", err.message);
    if (currentOrderId) {
      await supabase.from('translations').update({ processing_status: 'failed' }).eq('id', currentOrderId);
    }
    return NextResponse.json({ success: true }); 
  }
}

/**
 * Polling Function (V3 Structure)
 */
async function pollWaveSpeedV3(taskId: string, orderId: string, supabase: any) {
  for (let i = 0; i < 60; i++) { // Increased to 60 (8 mins) for complex docs
    await new Promise(r => setTimeout(r, 8000)); 

    try {
      const res = await fetch(`https://api.wavespeed.ai/api/v3/predictions/${taskId}`, {
        headers: { 'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}` }
      });
      
      const responseJson = await res.json();
      const data = responseJson.data;

      if (data?.status === "completed" && data?.outputs?.[0]) {
        await supabase.from('translations').update({ 
          translated_url: data.outputs[0], 
          processing_status: 'ready' 
        }).eq('id', orderId);
        return; 
      }

      if (data?.status === "failed") {
        await supabase.from('translations').update({ processing_status: 'failed' }).eq('id', orderId);
        return;
      }
    } catch (e) {
      console.error("Poll cycle failed, retrying...");
    }
  }
}