export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import CloudConvert from 'cloudconvert';

const cloudConvert = new CloudConvert(process.env.CLOUDCONVERT_API_KEY!);

// Triggering a fresh build for Vercel
const VAULT_VERSION = "v2.1.2-type-safe-export";

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

    // --- CASE 1: PDF or Word (Multi-page support) ---
    if (['pdf', 'docx', 'doc'].includes(fileExt || "")) {
      const { data: fileBlob } = await supabase.storage.from('documents').download(originalPath!);
      const fileBuffer = Buffer.from(await fileBlob!.arrayBuffer());

      const job = await cloudConvert.jobs.create({
        tasks: {
          'import-it': { operation: 'import/base64', file: fileBuffer.toString('base64'), filename: `input.${fileExt}` },
          'convert-it': { operation: 'convert', input: 'import-it', output_format: 'jpg', width: 2000 },
          'export-it': { operation: 'export/url', input: 'convert-it' }
        }
      });

      const finishedJob = await cloudConvert.jobs.wait(job.id);
      
      // FIX: Guard against undefined exportTask
      const exportTask = finishedJob.tasks.find((t: any) => t.name === 'export-it' && t.status === 'finished');
      
      if (!exportTask || !exportTask.result || !exportTask.result.files) {
        throw new Error("CloudConvert conversion task failed or returned no files.");
      }
      
      sourcePages = exportTask.result.files.map((f: any) => f.url);
    } 
    // --- CASE 2: Single Image ---
    else {
      const { data: signedData } = await supabase.storage.from('documents').createSignedUrl(originalPath!, 900);
      sourcePages = [signedData?.signedUrl || ""];
    }

    processPagesInOrder(sourcePages, currentOrderId, supabase);

    return NextResponse.json({ success: true, version: VAULT_VERSION });

  } catch (err: any) {
    console.error(`🛑 ENGINE_CRASH [${VAULT_VERSION}]:`, err.message);
    if (currentOrderId) {
      await supabase.from('translations').update({ processing_status: 'failed' }).eq('id', currentOrderId);
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 }); 
  }
}

async function processPagesInOrder(urls: string[], orderId: string, supabase: any) {
  const completedUrls: string[] = [];

  for (const [index, pageUrl] of urls.entries()) {
    try {
      const submitRes = await fetch("https://api.wavespeed.ai/api/v3/wavespeed-ai/image-translator", {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}`, 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ image: pageUrl, target_language: "english", output_format: "jpeg" })
      });

      const submitJson = await submitRes.json();
      const taskId = submitJson.data?.id;

      if (taskId) {
        const translatedPage = await pollSinglePage(taskId);
        if (translatedPage) {
          completedUrls.push(translatedPage);
          
          await supabase.from('translations').update({ 
            translated_url: completedUrls.join(','),
            processing_status: index === urls.length - 1 ? 'ready' : 'processing'
          }).eq('id', orderId);
        }
      }
    } catch (e) {
      console.error(`Page ${index} failed:`, e);
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
      if (json.data?.status === "completed" && json.data?.outputs?.[0]) {
        return json.data.outputs[0];
      }
      if (json.data?.status === "failed") return null;
    } catch (e) { /* retry */ }
  }
  return null;
}