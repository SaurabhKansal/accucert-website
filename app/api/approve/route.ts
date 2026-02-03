export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import CloudConvert from 'cloudconvert';

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

    if (!currentOrderId) throw new Error("Order ID is missing");

    const { data: order } = await supabase.from('translations').select('*').eq('id', currentOrderId).single();
    if (!order) throw new Error('Order not found.');

    // 1. Initial Status Update (Triggers the Dashboard pulse)
    await supabase.from('translations').update({ processing_status: 'processing' }).eq('id', currentOrderId);

    const originalPath = order.image_url.includes('/documents/') ? order.image_url.split('/documents/')[1] : order.image_url.split('/').pop(); 
    const fileExt = originalPath?.split('.').pop()?.toLowerCase();
    
    let finalProcessUrl = "";

    // --- CASE 1: PDF or Word Doc (Convert to JPG first) ---
    if (['pdf', 'docx', 'doc'].includes(fileExt || "")) {
      const { data: fileBlob } = await supabase.storage.from('documents').download(originalPath!);
      const fileBuffer = Buffer.from(await fileBlob!.arrayBuffer());

      const job = await cloudConvert.jobs.create({
        tasks: {
          'import-file': { operation: 'import/base64', file: fileBuffer.toString('base64'), filename: originalPath },
          'convert-file': { operation: 'convert', input: 'import-file', output_format: 'jpg', width: 2000 },
          'export-url': { operation: 'export/url', input: 'convert-file' }
        }
      });

      const finishedJob = await cloudConvert.jobs.wait(job.id);
      const fileTask = finishedJob.tasks.find(t => t.name === 'export-url' && t.status === 'finished');
      finalProcessUrl = (fileTask?.result as any).files[0].url;
    } 
    // --- CASE 2: Standard Image ---
    else {
      const { data: signedData } = await supabase.storage.from('documents').createSignedUrl(originalPath!, 900);
      finalProcessUrl = signedData?.signedUrl || "";
    }

    // --- SUBMIT TO WAVESPEED ---
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
      // Start polling (background)
      pollWaveSpeedV3(taskId, currentOrderId, supabase);
    }

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("VAULT_ENGINE_ERROR:", err.message);
    if (currentOrderId) {
      await supabase.from('translations').update({ processing_status: 'failed' }).eq('id', currentOrderId);
    }
    return NextResponse.json({ success: true }); 
  }
}

/**
 * Polling Logic (Lives in the same file to fix 'not found' error)
 */
async function pollWaveSpeedV3(taskId: string, orderId: string, supabase: any) {
  for (let i = 0; i < 50; i++) {
    await new Promise(r => setTimeout(r, 8000)); 

    try {
      const res = await fetch(`https://api.wavespeed.ai/api/v3/predictions/${taskId}`, {
        headers: { 'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}` }
      });
      
      const responseJson = await res.json();
      const status = responseJson.data?.status;
      const outputs = responseJson.data?.outputs;

      if (status === "completed" && outputs && outputs.length > 0) {
        // Trigger the automatic preview in Admin Dashboard
        await supabase.from('translations').update({ 
          translated_url: outputs[0], 
          processing_status: 'ready' 
        }).eq('id', orderId);
        return; 
      }

      if (status === "failed") {
        await supabase.from('translations').update({ processing_status: 'failed' }).eq('id', orderId);
        return;
      }
    } catch (e) {
      console.error("POLL_BLIP:", e);
    }
  }
}