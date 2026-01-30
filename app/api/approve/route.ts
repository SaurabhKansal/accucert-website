export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: order } = await supabase.from('translations').select('*').eq('id', orderId).single();

    if (!order) throw new Error('Order not found.');

    // 1. Detect File Type
    const isPdf = order.image_url.toLowerCase().endsWith('.pdf');
    const isDoc = order.image_url.toLowerCase().endsWith('.docx') || order.image_url.toLowerCase().endsWith('.doc');

    const auth = { 
      apiKey: process.env.AITRANSLATE_API_KEY, 
      apiSecret: process.env.AITRANSLATE_API_SECRET 
    };

    // 2. INITIATE TRANSLATION
    const startJob = await fetch("https://aitranslate.in/api/translate/file", {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authentication: auth,
        body: {
          fileUrl: order.image_url,
          targetLang: "en",
          // PRO TIP: Always convert to PDF for legal docs, even if the input was an image
          convertToPdf: (isPdf || isDoc) ? true : false, 
          skipLogoAndSeals: true 
        }
      })
    });

    const jobData = await startJob.json();
    if (!jobData.success) throw new Error(`Job Start Failed: ${jobData.message}`);

    const jobId = jobData.body.jobId;

    // 3. POLLING FOR COMPLETION
    let finalUrl = "";
    for (let i = 0; i < 20; i++) { // Docs/PDFs can take longer than images
      await new Promise(r => setTimeout(r, 5000));
      const statusRes = await fetch("https://aitranslate.in/api/translate/status", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authentication: auth, body: { jobId } })
      });

      const statusData = await statusRes.json();
      if (statusData.success && statusData.body.status === "completed") {
        finalUrl = statusData.body.downloadUrl;
        break;
      }
    }

    if (!finalUrl) throw new Error("Translation timed out. Large files need more time.");

    // 4. PREPARE THE ATTACHMENT
    const fileBuffer = await fetch(finalUrl).then(res => res.arrayBuffer());
    
    // Set dynamic filename based on output
    const fileExt = finalUrl.split('.').pop();
    const fileName = `Accucert_Translation.${fileExt}`;

    // 5. DISPATCH
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email,
      subject: `Official Certified Translation: ${order.full_name}`,
      html: `<p>Your official English document is attached.</p>`,
      attachments: [{ filename: fileName, content: Buffer.from(fileBuffer) }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true, url: finalUrl });

  } catch (err: any) {
    console.error("MULTIFORMAT_ERROR:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}