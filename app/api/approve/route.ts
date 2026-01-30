export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();
    
    // 1. INITIALIZE SUPABASE
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 2. FETCH ORDER FROM DATABASE
    const { data: order, error: dbError } = await supabase
      .from('translations')
      .select('*')
      .eq('id', orderId)
      .single();

    if (dbError || !order) throw new Error('Order not found in database.');

    // 3. GENERATE SECURE SIGNED URL FOR AI ACCESS
    // This solves the "Check file accessibility" error by giving the AI a temporary key
    const filePath = order.image_url.split('/documents/')[1]; 
    const { data: signedData, error: signedError } = await supabase
      .storage
      .from('documents')
      .createSignedUrl(filePath, 300); // 5 minute window for processing

    if (signedError || !signedData?.signedUrl) {
      throw new Error(`Accessibility Error: ${signedError?.message || "Could not sign URL"}`);
    }

    // 4. PREPARE AUTH & JOB PARAMS
    const auth = { 
      apiKey: process.env.AITRANSLATE_API_KEY, 
      apiSecret: process.env.AITRANSLATE_API_SECRET 
    };

    const isDocx = order.image_url.toLowerCase().endsWith('.docx') || order.image_url.toLowerCase().endsWith('.doc');

    // 5. INITIATE TRANSLATION JOB
    const startJob = await fetch("https://aitranslate.in/api/translate/file", {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authentication: auth,
        body: {
          fileUrl: signedData.signedUrl,
          targetLang: "en",
          convertToPdf: true, // Output as PDF for professional look
          skipLogoAndSeals: true,
          mode: "high_quality" 
        }
      })
    });

    const jobData = await startJob.json();
    if (!jobData.success) {
      throw new Error(`AITranslate Entry Denied: ${jobData.message}`);
    }

    const jobId = jobData.body.jobId;

    // 6. POLLING FOR COMPLETION
    let finalDownloadUrl = "";
    const maxAttempts = 20; 
    
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 6000)); // Wait 6 seconds
      
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

      if (statusData.body?.status === "error") {
        throw new Error(`AI Reconstruction Failed: ${statusData.message || "Unknown processing error"}`);
      }
    }

    if (!finalDownloadUrl) throw new Error("Translation timed out. The file may be too large.");

    // 7. DOWNLOAD FINAL DOCUMENT
    const fileBuffer = await fetch(finalDownloadUrl).then(res => res.arrayBuffer());

    // 8. DISPATCH TO CLIENT VIA RESEND
    const emailSent = await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email,
      subject: `Certified Translation Delivery: ${order.full_name}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #003461;">Accucert Translation Delivery</h2>
          <p>Hi ${order.full_name},</p>
          <p>Your document has been professionally reconstructed and translated into English.</p>
          <p>Please find your certified PDF attached below.</p>
        </div>
      `,
      attachments: [{
        filename: `Accucert_Translation_${orderId}.pdf`,
        content: Buffer.from(fileBuffer),
      }],
    });

    if (emailSent.error) throw new Error(`Email Dispatch Failed: ${emailSent.error.message}`);

    // 9. UPDATE DATABASE
    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("ACCUCERT_CRITICAL_FAILURE:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}