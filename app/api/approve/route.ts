export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();
    
    // 1. Setup Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 2. Fetch order data
    const { data: order, error: dbError } = await supabase
      .from('translations')
      .select('*')
      .eq('id', orderId)
      .single();

    if (dbError || !order) throw new Error('Order not found in database.');

    // 3. Setup AITranslate Authentication
    const auth = { 
      apiKey: process.env.AITRANSLATE_API_KEY, 
      apiSecret: process.env.AITRANSLATE_API_SECRET 
    };

    const fileUrl = order.image_url.toLowerCase();
    const isDocx = fileUrl.endsWith('.docx') || fileUrl.endsWith('.doc');

    // 4. INITIATE THE TRANSLATION JOB
    const startJob = await fetch("https://aitranslate.in/api/translate/file", {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authentication: auth,
        body: {
          fileUrl: order.image_url,
          targetLang: "en",
          // Force PDF for DOCX and high-stakes certificates for maximum clarity
          convertToPdf: isDocx ? true : false, 
          skipLogoAndSeals: true,
          // 'high_quality' mode matches paper color/grain much better
          mode: "high_quality" 
        }
      })
    });

    const jobData = await startJob.json();
    
    // Safety check for API response
    if (!jobData.success) {
      throw new Error(`AITranslate Job Initiation Failed: ${jobData.message}`);
    }

    const jobId = jobData.body.jobId;

    // 5. POLLING FOR COMPLETION (Wait for reconstruction)
    let finalDownloadUrl = "";
    const maxAttempts = 20; // Up to 100 seconds for complex documents
    
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 5000)); // Wait 5 seconds between checks
      
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
        throw new Error(`AI Processing Error: ${statusData.message || 'Unknown Error'}`);
      }
    }

    if (!finalDownloadUrl) throw new Error("Translation timed out. Try again.");

    // 6. DOWNLOAD THE RECONSTRUCTED DOCUMENT
    const fileBuffer = await fetch(finalDownloadUrl).then(res => res.arrayBuffer());
    
    // Determine file extension for attachment
    const fileExt = finalDownloadUrl.split('.').pop() || (isDocx ? 'pdf' : 'jpg');
    const fileName = `Accucert_Translation_${order.full_name.replace(/\s+/g, '_')}.${fileExt}`;

    // 7. DISPATCH VIA RESEND
    const emailResult = await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email,
      subject: `Official Certified Translation: ${order.full_name}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
          <h2 style="color: #003461;">Certified Document Delivery</h2>
          <p>Hi ${order.full_name},</p>
          <p>Your official English translation and document reconstruction is complete.</p>
          <p>Please find the certified document attached to this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 12px; color: #666;">This is an automated delivery from Accucert.</p>
        </div>
      `,
      attachments: [{
        filename: fileName,
        content: Buffer.from(fileBuffer),
      }],
    });

    if (emailResult.error) throw new Error(`Email failed: ${emailResult.error.message}`);

    // 8. UPDATE DATABASE STATUS
    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);

    return NextResponse.json({ success: true, url: finalDownloadUrl });

  } catch (err: any) {
    console.error("ACCUCERT_FINAL_SYSTEM_ERROR:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}