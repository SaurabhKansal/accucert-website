export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import CloudConvert from 'cloudconvert';

const cloudConvert = new CloudConvert(process.env.CLOUDCONVERT_API_KEY!);

// FORCE VERCEL BUILD TRIGGER: v2.1.6-Webhook-Architecture
const VAULT_ENGINE_VERSION = "2.1.6";

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

    // --- STEP 1: CONVERSION (PDF/Docx to JPG) ---
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
      
      if (!exportTask?.result?.files) {
        throw new Error("CloudConvert conversion failed.");
      }
      
      sourcePages = exportTask.result.files.map((f: any) => f.url);
    } 
    // --- STEP 2: IMAGE HANDLING ---
    else {
      const { data: signedData } = await supabase.storage.from('documents').createSignedUrl(originalPath!, 900);
      sourcePages = [signedData?.signedUrl || ""];
    }

    // --- STEP 3: WEBHOOK SETUP ---
    // This dynamically detects your Vercel URL (e.g., https://accucert.vercel.app)
    const host = req.headers.get('host');
    const protocol = host?.includes('localhost') ? 'http' : 'https';
    const webhookUrl = `${protocol}://${host}/api/webhook-wavespeed?orderId=${currentOrderId}`;

    // --- STEP 4: SUBMIT TO WAVESPEED ---
    for (const pageUrl of sourcePages) {
      console.log(`🚀 Sending Page to WaveSpeed with Webhook: ${webhookUrl}`);
      
      const waveRes = await fetch("https://api.wavespeed.ai/api/v3/wavespeed-ai/image-translator", {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}`, 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ 
          image: pageUrl, 
          target_language: "english", 
          output_format: "jpeg",
          webhook: webhookUrl // Critical fix: Tells WaveSpeed where to send results
        })
      });

      const waveData = await waveRes.json();
      if (!waveRes.ok) {
        throw new Error(`WaveSpeed Rejection: ${JSON.stringify(waveData)}`);
      }
    }

    return NextResponse.json({ 
      success: true, 
      engine_version: VAULT_ENGINE_VERSION,
      webhook_active: webhookUrl 
    });

  } catch (err: any) {
    console.error(`🛑 ENGINE_CRASH [${VAULT_ENGINE_VERSION}]:`, err.message);
    if (currentOrderId) {
      await supabase.from('translations').update({ processing_status: 'failed' }).eq('id', currentOrderId);
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 }); 
  }
}