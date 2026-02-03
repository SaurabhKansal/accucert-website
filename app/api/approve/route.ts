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

    // 1. GENERATE SECURE LINK
    const filePath = order.image_url.split('/documents/')[1]; 
    const { data: signedData } = await supabase.storage.from('documents').createSignedUrl(filePath, 600);
    
    // 2. SUBMIT TO WAVESPEED V3
    const submitRes = await fetch("https://api.wavespeed.ai/api/v3/wavespeed-ai/image-translator", {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}`,
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        image: signedData?.signedUrl,
        target_language: "english",
        output_format: "jpeg"
      })
    });

    const submitData = await submitRes.json();
    const taskId = submitData.id || submitData.data?.id;

    if (!taskId) throw new Error("WaveSpeed did not provide a Task ID.");

    // 3. POLLING FOR COMPLETION
    let finalDownloadUrl = "";
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 6000));
      
      const statusRes = await fetch(`https://api.wavespeed.ai/api/v3/predictions/${taskId}`, {
        headers: { 'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}` }
      });

      const statusData = await statusRes.json();
      
      if (statusData.status === "completed") {
        // Fetch result specifically to get the outputs array
        const resultRes = await fetch(`https://api.wavespeed.ai/api/v3/predictions/${taskId}/result`, {
          headers: { 'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}` }
        });
        const resultData = await resultRes.json();
        
        // --- CRITICAL FIX: Extraction ---
        finalDownloadUrl = resultData.data?.outputs?.[0] || resultData.outputs?.[0];
        console.log("FINAL URL FOUND:", finalDownloadUrl);
        break;
      }
      if (statusData.status === "failed") throw new Error("WaveSpeed AI failed processing.");
    }

    if (!finalDownloadUrl) throw new Error("Translation URL extraction failed.");

    // 4. DOWNLOAD THE FILE (with error catch)
    const fileRes = await fetch(finalDownloadUrl);
    if (!fileRes.ok) throw new Error("Failed to download result from WaveSpeed CDN.");
    const fileBuffer = await fileRes.arrayBuffer();

    // 5. DISPATCH VIA RESEND
    const emailResult = await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email,
      subject: `Official Certified Translation: ${order.full_name}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 12px;">
          <h2 style="color: #003461;">Certified Document Delivery</h2>
          <p>Hi ${order.full_name}, your reconstructed translation is attached.</p>
        </div>
      `,
      attachments: [{
        filename: `Accucert_Translation_${orderId}.jpg`,
        content: Buffer.from(fileBuffer),
      }],
    });

    if (emailResult.error) throw new Error(`Resend Error: ${emailResult.error.message}`);

    await supabase.from('translations').update({ status: 'completed' }).eq( 'id', orderId);
    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("ACCUCERT_FINAL_ERROR:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}