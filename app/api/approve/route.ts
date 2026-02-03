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

    // 2. FETCH ORDER DATA
    const { data: order, error: dbError } = await supabase
      .from('translations')
      .select('*')
      .eq('id', orderId)
      .single();

    if (dbError || !order) throw new Error('Order not found in database.');

    // 3. GENERATE SIGNED URL FOR WAVESPEED ACCESS
    const filePath = order.image_url.split('/documents/')[1]; 
    const { data: signedData, error: signedError } = await supabase
      .storage
      .from('documents')
      .createSignedUrl(filePath, 300); // 5 minute window

    if (signedError || !signedData?.signedUrl) {
      throw new Error(`Accessibility Error: ${signedError?.message || "Could not sign URL"}`);
    }

    // 4. SUBMIT TASK TO WAVESPEED V3
    // Endpoint is model-specific as per documentation
    const submitRes = await fetch("https://api.wavespeed.ai/api/v3/wavespeed-ai/image-translator", {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}`,
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        image: signedData.signedUrl,
        target_language: "english",
        output_format: "jpeg",
        enable_sync_mode: false,
        enable_base64_output: false
      })
    });

    const submitData = await submitRes.json();
    if (!submitRes.ok || !submitData.id) {
      throw new Error(`WaveSpeed Submission Failed: ${submitData.message || "Unknown error"}`);
    }

    const taskId = submitData.id;

    // 5. POLLING LOOP (Check Status)
    let finalDownloadUrl = "";
    const maxAttempts = 20; 
    
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 5000)); // Wait 5 seconds

      // Check Status Endpoint
      const statusRes = await fetch(`https://api.wavespeed.ai/api/v3/predictions/${taskId}`, {
        headers: { 'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}` }
      });

      const statusData = await statusRes.json();
      const currentStatus = statusData.status;

      if (currentStatus === "completed") {
        // Fetch Result Endpoint (New requirement in V3)
        const resultRes = await fetch(`https://api.wavespeed.ai/api/v3/predictions/${taskId}/result`, {
          headers: { 'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}` }
        });
        const resultData = await resultRes.json();
        
        // Output is returned as an array in the result schema
        finalDownloadUrl = resultData.outputs?.[0];
        break;
      }

      if (currentStatus === "failed") {
        throw new Error(`WaveSpeed Processing Failed: ${statusData.error || "Internal AI error"}`);
      }
    }

    if (!finalDownloadUrl) throw new Error("Translation timed out during polling.");

    // 6. DOWNLOAD TRANSLATED FILE
    const fileBuffer = await fetch(finalDownloadUrl).then(res => res.arrayBuffer());

    // 7. DISPATCH VIA RESEND
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email,
      subject: `Certified Translation Delivery: ${order.full_name}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #003461;">Certified Document Delivery</h2>
          <p>Hi ${order.full_name},</p>
          <p>Your document has been professionally reconstructed and translated into English using our high-fidelity AI engine.</p>
        </div>
      `,
      attachments: [{
        filename: `Accucert_Translation_${orderId}.jpg`,
        content: Buffer.from(fileBuffer),
      }],
    });

    // 8. UPDATE DATABASE
    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("WAVESPEED_V3_CRITICAL_FAILURE:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}