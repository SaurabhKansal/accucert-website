export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import CloudConvert from 'cloudconvert';

const cloudConvert = new CloudConvert(process.env.CLOUDCONVERT_API_KEY!);
const VAULT_VERSION = "v2.2.1-iterator-fix";

export async function POST(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, 
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  let currentOrderId: string = "";

  try {
    const body = await req.json();
    currentOrderId = body.orderId;
    if (!currentOrderId) throw new Error("Missing Order ID");

    const { data: order } = await supabase.from('translations').select('*').eq('id', currentOrderId).single();
    if (!order) throw new Error('Order not found.');

    await supabase.from('translations').update({ processing_status: 'processing' }).eq('id', currentOrderId);

    const originalPath = order.image_url.split('/documents/')[1] || order.image_url.split('/').pop(); 
    const fileExt = originalPath?.split('.').pop()?.toLowerCase();
    
    let sourcePages: string[] = [];

    // --- CONVERSION LOGIC ---
    if (['pdf', 'docx', 'doc'].includes(fileExt || "")) {
      const { data: fileBlob } = await supabase.storage.from('documents').download(originalPath!);
      const fileBuffer = Buffer.from(await fileBlob!.arrayBuffer());

      const job = await cloudConvert.jobs.create({
        tasks: {
          'import-it': { operation: 'import/base64', file: fileBuffer.toString('base64'), filename: `input.${fileExt}` },
          'convert-it': { operation: 'convert', input: 'import-it', output_format: 'jpg', width: 2200 },
          'export-it': { operation: 'export/url', input: 'convert-it' }
        }
      });

      const finishedJob = await cloudConvert.jobs.wait(job.id);
      const exportTask = finishedJob.tasks.find((t: any) => t.name === 'export-it' && t.status === 'finished');
      if (!exportTask?.result?.files) throw new Error("CloudConvert failed");
      sourcePages = exportTask.result.files.map((f: any) => f.url);
    } else {
      const { data: signedData } = await supabase.storage.from('documents').createSignedUrl(originalPath!, 900);
      sourcePages = [signedData?.signedUrl || ""];
    }

    // 1. Handshake for Page 1
    const submitRes = await fetch("https://api.wavespeed.ai/api/v3/wavespeed-ai/image-translator", {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: sourcePages[0], target_language: "english", output_format: "jpeg" })
    });

    const submitJson = await submitRes.json();
    const firstTaskId = submitJson.data?.id;

    if (!firstTaskId) throw new Error("WaveSpeed submission failed.");

    // 2. Background Multi-Page Processing
    processPagesInOrder(firstTaskId, sourcePages, currentOrderId, supabase);

    return NextResponse.json({ success: true, taskId: firstTaskId });

  } catch (err: any) {
    console.error(`🛑 ENGINE_CRASH [${VAULT_VERSION}]:`, err.message);
    if (currentOrderId) await supabase.from('translations').update({ processing_status: 'failed' }).eq('id', currentOrderId);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 }); 
  }
}

async function processPagesInOrder(firstTaskId: string, urls: string[], orderId: string, supabase: any) {
  const completedImages: string[] = [];
  const completedTexts: string[] = [];

  // FIX: Use urls.length instead of iterator.length
  for (let i = 0; i < urls.length; i++) {
    let activeTaskId = (i === 0) ? firstTaskId : null;

    if (i > 0) {
      const res = await fetch("https://api.wavespeed.ai/api/v3/wavespeed-ai/image-translator", {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: urls[i], target_language: "english", output_format: "jpeg" })
      });
      const json = await res.json();
      activeTaskId = json.data?.id;
    }

    if (activeTaskId) {
      const result = await pollSinglePage(activeTaskId);
      if (result) {
        completedImages.push(result.imageUrl);
        if (result.text) completedTexts.push(result.text);

        await supabase.from('translations').update({ 
          translated_url: completedImages.join(','),
          extracted_text: completedTexts.join('\n\n---\n\n'), 
          processing_status: i === urls.length - 1 ? 'ready' : 'processing'
        }).eq('id', orderId);
      }
    }
  }
}

async function pollSinglePage(taskId: string): Promise<{imageUrl: string, text: string} | null> {
  // CORRECT V3 POLL PATH: /result
  const pollUrl = `https://api.wavespeed.ai/api/v3/predictions/${taskId}/result`;
  
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 7000));
    try {
      const res = await fetch(pollUrl, {
        headers: { 'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}` }
      });
      const json = await res.json();
      const status = json.data?.status;

      if (status === "completed" && json.data?.outputs?.[0]) {
        return {
          imageUrl: json.data.outputs[0],
          text: json.data.full_text || "" 
        };
      }
      if (status === "failed") return null;
    } catch (e) { /* retry silent */ }
  }
  return null;
}