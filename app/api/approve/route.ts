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

    const { data: order } = await supabase.from('translations').select('*').eq('id', currentOrderId).single();
    if (!order) throw new Error('Order not found.');

    // 1. Mark as processing
    await supabase.from('translations').update({ processing_status: 'processing' }).eq('id', currentOrderId);

    const originalPath = order.image_url.split('/documents/')[1] || order.image_url.split('/').pop(); 
    const fileExt = originalPath?.split('.').pop()?.toLowerCase();
    let sourcePages: string[] = [];
    let dashboardPreview: string = "";

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
      
      if (!exportTask?.result?.files) throw new Error("CloudConvert conversion failed.");
      
      sourcePages = exportTask.result.files.map((f: any) => f.url);
      
      // FIX FOR BROKEN PREVIEW: Save the first page JPG as a visible preview for the dashboard
      dashboardPreview = sourcePages[0];
      await supabase.from('translations').update({ preview_url: dashboardPreview }).eq('id', currentOrderId);

    } 
    // --- STEP 2: IMAGE HANDLING ---
    else {
      const { data: signedData } = await supabase.storage.from('documents').createSignedUrl(originalPath!, 900);
      dashboardPreview = signedData?.signedUrl || "";
      sourcePages = [dashboardPreview];
    }

    // --- STEP 3: WEBHOOK SETUP ---
    const host = req.headers.get('host');
    const webhookUrl = encodeURIComponent(`https://${host}/api/webhook-wavespeed?orderId=${currentOrderId}`);

    // --- STEP 4: SUBMIT TO WAVESPEED ---
    for (const pageUrl of sourcePages) {
      const apiUrl = `https://api.wavespeed.ai/api/v3/wavespeed-ai/image-translator?webhook=${webhookUrl}`;
      
      await fetch(apiUrl, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}`, 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ 
          image: pageUrl, 
          target_language: "english", 
          output_format: "jpeg"
        })
      });
    }

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("APPROVE_FAILURE:", err.message);
    if (currentOrderId) await supabase.from('translations').update({ processing_status: 'failed' }).eq('id', currentOrderId);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 }); 
  }
}