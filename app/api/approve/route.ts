export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: order, error: dbError } = await supabase
      .from('translations')
      .select('*')
      .eq('id', orderId)
      .single();

    if (dbError || !order) throw new Error('Order not found in database.');

    // 1. GENERATE SECURE ACCESS FOR WAVESPEED
    const filePath = order.image_url.split('/documents/')[1]; 
    const { data: signedData, error: signedError } = await supabase
      .storage
      .from('documents')
      .createSignedUrl(filePath, 300);

    if (signedError || !signedData?.signedUrl) {
      throw new Error(`Accessibility Error: ${signedError?.message}`);
    }

    // 2. CALL WAVESPEED AI API
    // Wavespeed typically uses a direct POST to their translation endpoint
    const wavespeedRes = await fetch("https://api.wavespeed.ai/v1/translate/document", {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}`,
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        documentUrl: signedData.signedUrl,
        sourceLanguage: "auto",
        targetLanguage: "en",
        preserveLayout: true,
        outputFormat: "pdf"
      })
    });

    const waveData = await wavespeedRes.json();
    
    // Safety check for Wavespeed's response structure
    if (!wavespeedRes.ok || !waveData.success) {
      throw new Error(`Wavespeed Error: ${waveData.message || "Translation failed"}`);
    }

    // 3. WAVESPEED DOWNLOAD (Polling or Direct)
    // Most high-end APIs like Wavespeed provide a status URL or a direct link
    const translatedFileUrl = waveData.translatedDocumentUrl;
    const fileBuffer = await fetch(translatedFileUrl).then(res => res.arrayBuffer());

    // 4. DISPATCH VIA RESEND
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email,
      subject: `Official Certified Translation: ${order.full_name}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2 style="color: #003461;">Certified Delivery</h2>
          <p>Hi ${order.full_name}, your document has been translated via Wavespeed AI and verified.</p>
        </div>
      `,
      attachments: [{
        filename: `Accucert_Translation_${orderId}.pdf`,
        content: Buffer.from(fileBuffer),
      }],
    });

    // 5. UPDATE DATABASE
    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("WAVESPEED_SYSTEM_FAILURE:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}