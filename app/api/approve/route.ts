export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import CloudConvert from 'cloudconvert';

const cloudConvert = new CloudConvert(process.env.CLOUDCONVERT_API_KEY!);

export async function POST(req: Request) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  let currentOrderId: string = "";

  try {
    const body = await req.json();
    currentOrderId = body.orderId;

    const { data: order } = await supabase.from('translations').select('*').eq('id', currentOrderId).single();
    if (!order) throw new Error('Order not found.');

    await supabase.from('translations').update({ processing_status: 'processing' }).eq('id', currentOrderId);

    const originalPath = order.image_url.split('/documents/')[1] || order.image_url.split('/').pop(); 
    const fileExt = originalPath?.split('.').pop()?.toLowerCase();
    let sourcePages: string[] = [];

    // --- CLOUDCONVERT LOGIC ---
    if (['pdf', 'docx', 'doc'].includes(fileExt || "")) {
      const { data: fileBlob } = await supabase.storage.from('documents').download(originalPath!);
      const job = await cloudConvert.jobs.create({
        tasks: {
          'import': { operation: 'import/base64', file: Buffer.from(await fileBlob!.arrayBuffer()).toString('base64'), filename: `in.${fileExt}` },
          'convert': { operation: 'convert', input: 'import', output_format: 'jpg', width: 2200 },
          'export': { operation: 'export/url', input: 'convert' }
        }
      });
      const finishedJob = await cloudConvert.jobs.wait(job.id);
      const exportTask = finishedJob.tasks.find((t: any) => t.name === 'export' && t.status === 'finished');
      sourcePages = exportTask?.result?.files?.map((f: any) => f.url) || [];
    } else {
      const { data: signed } = await supabase.storage.from('documents').createSignedUrl(originalPath!, 900);
      sourcePages = [signed?.signedUrl || ""];
    }

    // --- THE CRITICAL WEBHOOK FIX ---
    const host = req.headers.get('host');
    // Note: We use encodeURIComponent to ensure the URL is safe for the query string
    const webhookUrl = encodeURIComponent(`https://${host}/api/webhook-wavespeed?orderId=${currentOrderId}`);

    for (const pageUrl of sourcePages) {
      // THE DOCS REQUIRE: POST https://api.../image-translator?webhook=YOUR_URL
      const apiUrl = `https://api.wavespeed.ai/api/v3/wavespeed-ai/image-translator?webhook=${webhookUrl}`;
      
      console.log(`📡 DISPATCHING TO: ${apiUrl}`);

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
    return NextResponse.json({ success: false, error: err.message }, { status: 500 }); 
  }
}