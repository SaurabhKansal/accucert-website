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

    // 1. SECURE FILE ACCESS
    const filePath = order.image_url.split('/documents/')[1]; 
    const { data: signedData } = await supabase.storage.from('documents').createSignedUrl(filePath, 600);
    if (!signedData?.signedUrl) throw new Error("Supabase bucket access denied.");

    // 2. SUBMIT TO WAVESPEED V3
    // Note: We use the exact model path in the URL to avoid 'Product Not Found'
    const submitRes = await fetch("https://api.wavespeed.ai/api/v3/google/gemini-1.5-pro", {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}`,
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        input: {
          image: signedData.signedUrl,
          prompt: "Translate all Spanish text in this image to English. Keep the original background and layout exactly the same. Output only the translated image.",
          target_lang: "English"
        }
      })
    });

    // --- ROBUST PARSER (Fixes Position 4 Error) ---
    const rawText = await submitRes.text();
    let submitData;
    try {
      // This Regex finds the first valid {...} block and ignores "data: " or other noise
      const jsonMatch = rawText.match(/\{[\s\S]*?\}/);
      if (!jsonMatch) throw new Error("No valid JSON found in response.");
      submitData = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error("RAW_WAVESPEED_RESPONSE:", rawText);
      throw new Error("Failed to parse WaveSpeed response. See Vercel logs.");
    }
    // ----------------------------------------------

    if (!submitData.success) throw new Error(`WaveSpeed Rejection: ${submitData.message}`);
    const taskId = submitData.data.task_id || submitData.data.id;

    // 3. POLLING FOR COMPLETION
    let finalUrl = "";
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 6000));
      const statusRes = await fetch(`https://api.wavespeed.ai/api/v3/tasks/result/${taskId}`, {
        headers: { 'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}` }
      });

      const statusData = await statusRes.json();
      if (statusData.data?.status === "completed") {
        // WaveSpeed often puts the final link in 'outputs' array or 'output_url'
        finalUrl = statusData.data.output_url || statusData.data.outputs?.[0];
        break;
      }
      if (statusData.data?.status === "failed") throw new Error("WaveSpeed processing failed.");
    }

    if (!finalUrl) throw new Error("Translation timed out.");

    // 4. DOWNLOAD & DISPATCH
    const fileBuffer = await fetch(finalUrl).then(res => res.arrayBuffer());
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email,
      subject: `Official Certified Translation: ${order.full_name}`,
      html: `<p>Your reconstructed document is ready.</p>`,
      attachments: [{
        filename: `Accucert_Translation.pdf`,
        content: Buffer.from(fileBuffer),
      }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("WAVESPEED_V3_FAILURE:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}