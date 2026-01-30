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

    // 1. INITIATE HIGH-QUALITY TRANSLATION
    const startJob = await fetch("https://aitranslate.in/api/translate/file", {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authentication: auth,
        body: {
          fileUrl: order.image_url,
          targetLang: "en",
          convertToPdf: true, // We convert to PDF first because it renders text much clearer
          skipLogoAndSeals: true,
          // 'high_quality' mode improves background color matching
          mode: "high_quality" 
        }
      })
    });

    const jobData = await startJob.json();
    if (!jobData.success) throw new Error(`Job Start Failed: ${jobData.message}`);

    const jobId = jobData.body.jobId;

    // 2. POLLING (With extra time for high-quality rendering)
    let finalDownloadUrl = "";
    for (let i = 0; i < 15; i++) { 
      await new Promise(r => setTimeout(r, 4000));
      
      const checkStatus = await fetch("https://aitranslate.in/api/translate/status", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authentication: auth, body: { jobId } })
      });

      const statusData = await checkStatus.json();
      if (statusData.success && statusData.body.status === "completed") {
        finalDownloadUrl = statusData.body.downloadUrl;
        break;
      }
    }

    if (!finalDownloadUrl) throw new Error("Translation timed out. High-quality rendering takes longer.");

    // 3. FETCH THE FINAL CLEAR DOCUMENT
    const fileBuffer = await fetch(finalDownloadUrl).then(res => res.arrayBuffer());

    // 4. DISPATCH
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email.toString(),
      subject: `Official Certified Translation: ${order.full_name}`,
      html: `<p>Your official English translation is ready. We have used a high-definition reconstruction for maximum clarity.</p>`,
      attachments: [{
        filename: `Accucert_Translation.pdf`, // Sending as PDF for professional clarity
        content: Buffer.from(fileBuffer),
      }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true, url: finalDownloadUrl });

  } catch (err: any) {
    console.error("AITRANSLATE_QUALITY_ERROR:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}