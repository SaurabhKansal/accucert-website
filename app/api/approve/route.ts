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

    // 1. SECURE ACCESS (Signed URL for the WaveSpeed bot)
    const filePath = order.image_url.split('/documents/')[1]; 
    const { data: signedData } = await supabase.storage.from('documents').createSignedUrl(filePath, 600);
    if (!signedData?.signedUrl) throw new Error("Supabase access blocked.");

    // 2. SUBMIT TO THE CORRECT ENDPOINT
    // The "Product Not Found" error was because the model belongs in the URL path.
    const submitRes = await fetch("https://api.wavespeed.ai/api/v3/wavespeed-ai/image-translator", {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}`,
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        image: signedData.signedUrl, // Wavespeed expects 'image' field for this model
        target_language: "english",  // Full name, not code
        output_format: "jpeg"
      })
    });

    const submitData = await submitRes.json();
    if (!submitRes.ok || submitData.code !== 200) {
      throw new Error(`WaveSpeed AI Rejection: ${submitData.message || "Invalid Model/Endpoint"}`);
    }

    const taskId = submitData.data.id;

    // 3. POLLING (Wait for the result)
    let finalDownloadUrl = "";
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 6000));
      
      const statusRes = await fetch(`https://api.wavespeed.ai/api/v3/tasks/result/${taskId}`, {
        headers: { 'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}` }
      });

      const statusData = await statusRes.json();
      
      if (statusData.data?.status === "completed") {
        finalDownloadUrl = statusData.data.outputs[0]; // Outputs is an array
        break;
      }
      if (statusData.data?.status === "failed") throw new Error("WaveSpeed processing failed.");
    }

    if (!finalDownloadUrl) throw new Error("Translation timed out.");

    // 4. DISPATCH
    const fileBuffer = await fetch(finalDownloadUrl).then(res => res.arrayBuffer());

    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email,
      subject: `Official Certified Translation: ${order.full_name}`,
      html: `<p>Your reconstructed English document is ready.</p>`,
      attachments: [{
        filename: `Accucert_Translation.jpg`,
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