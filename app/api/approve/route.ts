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

    const auth = {
      apiKey: process.env.AITRANSLATE_API_KEY,
      apiSecret: process.env.AITRANSLATE_API_SECRET
    };

    // 1. INITIATE ASYNC TRANSLATION (/translate/file)
    // This is the "magic" step that reconstructs the image.
    const startJob = await fetch("https://aitranslate.in/api/translate/file", {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authentication: auth,
        body: {
          fileUrl: order.image_url,
          targetLang: "en", // English
          convertToPdf: false,
          skipLogoAndSeals: true // Keeps your gold border and signatures untouched
        }
      })
    });

    const jobResult = await startJob.json();
    if (!jobResult.success) throw new Error(`Job Initiation Failed: ${jobResult.message}`);

    const jobId = jobResult.body.jobId;

    // 2. POLL FOR STATUS (/translate/status)
    // We check every 5 seconds until the AI finishes the reconstruction.
    let finalDownloadUrl = "";
    for (let i = 0; i < 12; i++) { // Wait up to 60 seconds
      await new Promise(r => setTimeout(r, 5000));

      const statusRes = await fetch("https://aitranslate.in/api/translate/status", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authentication: auth, body: { jobId } })
      });

      const statusData = await statusRes.json();
      if (statusData.success && statusData.body.status === "completed") {
        finalDownloadUrl = statusData.body.downloadUrl;
        break;
      }
      if (statusData.body.status === "error") throw new Error("AITranslate internal processing error.");
    }

    if (!finalDownloadUrl) throw new Error("Translation timed out. The document is too complex.");

    // 3. DOWNLOAD & SEND VIA RESEND
    const imageBuffer = await fetch(finalDownloadUrl).then(res => res.arrayBuffer());

    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email,
      subject: `Official Certified Translation: ${order.full_name}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2 style="color: #003461;">Accucert Document Delivery</h2>
          <p>Hi ${order.full_name}, your document has been reconstructed in English.</p>
        </div>
      `,
      attachments: [{
        filename: `Accucert_Translation.jpg`,
        content: Buffer.from(imageBuffer)
      }]
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);

    return NextResponse.json({ success: true, url: finalDownloadUrl });

  } catch (err: any) {
    console.error("AITRANSLATE_FINAL_ERROR:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}