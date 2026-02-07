export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import CloudConvert from 'cloudconvert';

const cloudConvert = new CloudConvert(process.env.CLOUDCONVERT_API_KEY!);

// FORCE VERCEL BUILD TRIGGER: v2.1.5-Handshake-Stability
const VAULT_ENGINE_VERSION = "2.1.5";

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

    // 1. UI Update: Start the pulse immediately
    await supabase.from('translations').update({ 
      processing_status: 'processing' 
    }).eq('id', currentOrderId);

    const originalPath = order.image_url.split('/documents/')[1] || order.image_url.split('/').pop(); 
    const fileExt = originalPath?.split('.').pop()?.toLowerCase();
    
    let sourcePages: string[] = [];

    // --- CASE 1: PDF or Word (Multi-page support) ---
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
      
      // FIX: Type Safety Guards for exportTask
      const exportTask = finishedJob.tasks.find((t: any) => t.name === 'export-it' && t.status === 'finished');
      
      if (!exportTask?.result?.files) {
        throw new Error("CloudConvert conversion task failed or result is undefined.");
      }
      
      sourcePages = exportTask.result.files.map((f: any) => f.url);
    } 
    // --- CASE 2: Single Image ---
    else {
      const { data: signedData } = await supabase.storage.from('documents').createSignedUrl(originalPath!, 900);
      sourcePages = [signedData?.signedUrl || ""];
    }

    // --- CASE 3: WAVE SPEED HANDSHAKE ---
    // We submit the first page synchronously to prevent Vercel from killing the process too early
    const firstPageUrl = sourcePages[0];
    const submitRes = await fetch("https://api.wavespeed.ai/api/v3/wavespeed-ai/image-translator", {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ image: firstPageUrl, target_language: "english", output_format: "jpeg" })
    });

    const submitJson = await submitRes.json();
    const firstTaskId = submitJson.data?.id;

    if (firstTaskId) {
      // Background the rest (polling and extra pages)
      processRemainingPages(firstTaskId, sourcePages, currentOrderId, supabase);
    } else {
      throw new Error(`WaveSpeed rejected submission: ${JSON.stringify(submitJson)}`);
    }

    return NextResponse.json({ success: true, engine_version: VAULT_ENGINE_VERSION });

  } catch (err: any) {
    console.error(`🛑 ENGINE_CRASH [${VAULT_ENGINE_VERSION}]:`, err.message);
    if (currentOrderId) {
      await supabase.from('translations').update({ processing_status: 'failed' }).eq('id', currentOrderId);
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 }); 
  }
}

// Background poller for the remaining pages
async function processRemainingPages(firstTaskId: string, allUrls: string[], orderId: string, supabase: any) {
  const completedUrls: string[] = [];
  
  // 1. Handle the first page already submitted
  const firstUrl = await pollSinglePage(firstTaskId);
  if (firstUrl) {
    completedUrls.push(firstUrl);
    await supabase.from('translations').update({ 
      translated_url: completedUrls.join(','),
      processing_status: allUrls.length === 1 ? 'ready' : 'processing'
    }).eq('id', orderId);
  }

  // 2. Handle pages 2+ if they exist
  if (allUrls.length > 1) {
    for (let i = 1; i < allUrls.length; i++) {
      try {
        const res = await fetch("https://api.wavespeed.ai/api/v3/wavespeed-ai/image-translator", {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: allUrls[i], target_language: "english", output_format: "jpeg" })
        });
        const json = await res.json();
        const tid = json.data?.id;
        if (tid) {
          const translated = await pollSinglePage(tid);
          if (translated) {
            completedUrls.push(translated);
            await supabase.from('translations').update({ 
              translated_url: completedUrls.join(','),
              processing_status: i === allUrls.length - 1 ? 'ready' : 'processing'
            }).eq('id', orderId);
          }
        }
      } catch (e) { console.error(`Page ${i} failed`, e); }
    }
  }
}

async function pollSinglePage(taskId: string): Promise<string | null> {
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 8000));
    try {
      const res = await fetch(`https://api.wavespeed.ai/api/v3/predictions/${taskId}`, {
        headers: { 'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}` }
      });
      const json = await res.json();
      if (json.data?.status === "completed" && json.data?.outputs?.[0]) return json.data.outputs[0];
      if (json.data?.status === "failed") return null;
    } catch (e) { /* retry */ }
  }
  return null;
}