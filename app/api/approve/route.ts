// app/api/approve/route.ts

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

    // LOG: See what URL we are sending to the AI
    console.log("Sending to AITranslate:", order.image_url);

    const startJob = await fetch("https://aitranslate.in/api/translate/file", {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authentication: auth,
        body: {
          fileUrl: order.image_url,
          targetLang: "en",
          convertToPdf: true, // Force PDF for all Accucert outputs
          skipLogoAndSeals: true,
          mode: "high_quality" 
        }
      })
    });

    const jobData = await startJob.json();
    if (!jobData.success) throw new Error(`API Entry Denied: ${jobData.message}`);

    const jobId = jobData.body.jobId;

    let finalUrl = "";
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 5000));
      
      const statusRes = await fetch("https://aitranslate.in/api/translate/status", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authentication: auth, body: { jobId } })
      });

      const statusData = await statusRes.json();
      
      // LOG: See the raw response from the AI
      console.log(`Polling attempt ${i}:`, statusData.body?.status);

      if (statusData.success && statusData.body.status === "completed") {
        finalUrl = statusData.body.downloadUrl;
        break;
      }

      if (statusData.body?.status === "error") {
        // DETAILED LOGGING: This will show up in Vercel Logs
        console.error("AI_RECONSTRUCTION_FAILED:", statusData);
        throw new Error(`AI failed to reconstruct this specific file. Error: ${statusData.message || 'Check file accessibility'}`);
      }
    }

    if (!finalUrl) throw new Error("Processing timed out.");

    const fileBuffer = await fetch(finalUrl).then(res => res.arrayBuffer());

    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email,
      subject: `Official Certified Translation: ${order.full_name}`,
      html: `<p>Please find your certified document attached.</p>`,
      attachments: [{ filename: `Accucert_Translation.pdf`, content: Buffer.from(fileBuffer) }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("CRITICAL_DISPATCH_FAILURE:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}