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

    // 1. GENERATE SECURE ACCESS FOR WAVESPEED
    const filePath = order.image_url.split('/documents/')[1]; 
    const { data: signedData } = await supabase.storage.from('documents').createSignedUrl(filePath, 600);
    if (!signedData?.signedUrl) throw new Error("Could not access file in Supabase.");

    // 2. SUBMIT TASK TO WAVESPEED V3
    // Note: Change 'google/gemini-1.5-pro' to your preferred vision/translation model from WaveSpeed library
    const submitRes = await fetch("https://api.wavespeed.ai/api/v3/tasks/submit", {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}`,
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        model: "google/gemini-1.5-pro", 
        input: {
          file_url: signedData.signedUrl,
          target_lang: "en",
          preserve_layout: true
        }
      })
    });

    // --- ROBUST JSON PARSER (Fixes "Position 4" Error) ---
    const rawText = await submitRes.text();
    let submitData;
    try {
      // Extracts the first valid JSON object {} even if followed by other characters
      const match = rawText.match(/\{[\s\S]*?\}/);
      if (!match) throw new Error("Invalid API Response Format");
      submitData = JSON.parse(match[0]);
    } catch (e) {
      throw new Error(`Wavespeed parsing failed. Raw response: ${rawText.substring(0, 50)}`);
    }

    if (!submitData.success) throw new Error(`WaveSpeed Rejection: ${submitData.message}`);
    const taskId = submitData.data.task_id;

    // 3. POLL FOR RESULT
    let finalDownloadUrl = "";
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 6000));
      
      const statusRes = await fetch(`https://api.wavespeed.ai/api/v3/tasks/result/${taskId}`, {
        headers: { 'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}` }
      });

      const statusData = await statusRes.json();
      if (statusData.data?.status === "completed") {
        finalDownloadUrl = statusData.data.output_url;
        break;
      }
      if (statusData.data?.status === "failed") throw new Error("WaveSpeed AI failed to process file.");
    }

    if (!finalDownloadUrl) throw new Error("Translation timed out.");

    // 4. DISPATCH VIA RESEND
    const fileBuffer = await fetch(finalDownloadUrl).then(res => res.arrayBuffer());

    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email,
      subject: `Official Certified Translation: ${order.full_name}`,
      html: `<p>Hi ${order.full_name}, your official English document is ready.</p>`,
      attachments: [{
        filename: `Accucert_Translation.pdf`,
        content: Buffer.from(fileBuffer),
      }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("WAVESPEED_DISPATCH_ERROR:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}