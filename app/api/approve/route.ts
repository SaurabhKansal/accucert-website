export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import CloudConvert from 'cloudconvert';

const cloudConvert = new CloudConvert(process.env.CLOUDCONVERT_API_KEY!);
const VAULT_VERSION = "v2.1.3-linear-handshake";

export async function POST(req: Request) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
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

    // 1. CONVERSION (We await this fully)
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
      if (!exportTask?.result?.files) throw new Error("Conversion failed to produce files");
      sourcePages = exportTask.result.files.map((f: any) => f.url);
    } else {
      const { data: signedData } = await supabase.storage.from('documents').createSignedUrl(originalPath!, 900);
      sourcePages = [signedData?.signedUrl || ""];
    }

    // 2. LINEAR HANDSHAKE (Fix for Vercel)
    // We process the FIRST page synchronously to ensure WaveSpeed gets it before the server disconnects.
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

    if (!firstTaskId) {
      console.error("WaveSpeed Rejected First Page:", submitJson);
      throw new Error("WaveSpeed failed to initialize the first page.");
    }

    // 3. BACKGROUND THE REST
    // Now that the handshake is done, we can safely background the polling and other pages.
    processRemainingPages(firstTaskId, sourcePages, currentOrderId, supabase);

    return NextResponse.json({ success: true, taskId: firstTaskId });

  } catch (err: any) {
    console.error(`🛑 ENGINE_CRASH [${VAULT_VERSION}]:`, err.message);
    if (currentOrderId) {
      await supabase.from('translations').update({ processing_status: 'failed' }).eq('id', currentOrderId);
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 }); 
  }
}

async function processRemainingPages(firstTaskId: string, allSourceUrls: string[], orderId: string, supabase: any) {
  const translatedUrls: string[] = [];

  // 1. Poll the first page we already submitted
  const firstTranslated = await pollSinglePage(firstTaskId);
  if (firstTranslated) {
    translatedUrls.push(firstTranslated);
    await supabase.from('translations').update({ 
      translated_url: translatedUrls.join(','),
      processing_status: allSourceUrls.length === 1 ? 'ready' : 'processing'
    }).eq('id', orderId);
  }

  // 2. Process subsequent pages (if any)
  if (allSourceUrls.length > 1) {
    for (let i = 1; i < allSourceUrls.length; i++) {
      try {
        const res = await fetch("https://api.wavespeed.ai/api/v3/wavespeed-ai/image-translator", {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: allSourceUrls[i], target_language: "english", output_format: "jpeg" })
        });
        const json = await res.json();
        const tid = json.data?.id;
        if (tid) {
          const translated = await pollSinglePage(tid);
          if (translated) {
            translatedUrls.push(translated);
            await supabase.from('translations').update({ 
              translated_url: translatedUrls.join(','),
              processing_status: i === allSourceUrls.length - 1 ? 'ready' : 'processing'
            }).eq('id', orderId);
          }
        }
      } catch (e) { console.error("Page error:", e); }
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
    } catch (e) { }
  }
  return null;
}