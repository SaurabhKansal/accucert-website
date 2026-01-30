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

    const { data: order } = await supabase.from('translations').select('*').eq('id', orderId).single();
    if (!order) throw new Error('Order not found.');

    // 1. CALL CLOUDMERSIVE DOCUMENT TRANSLATION
    // This API specifically handles the visual translation of images/PDFs.
    const response = await fetch("https://api.cloudmersive.com/convert/edit/pdf/pages/remove-text-and-replace-with-text", {
      method: 'POST',
      headers: { 
        'Apikey': process.env.CLOUDMERSIVE_API_KEY as string,
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        InputFileUrl: order.image_url,
        // We tell it to find Spanish and replace with English
        // Cloudmersive handles the inpainting and typesetting internally
        SourceLanguage: "SPA",
        TargetLanguage: "ENG"
      })
    });

    const result = await response.json();
    if (!result.Successful) throw new Error("Cloudmersive failed to translate.");

    const translatedImageUrl = result.OutputVideoUrl || result.OutputFileUrl;
    const imageBuffer = await fetch(translatedImageUrl).then(res => res.arrayBuffer());

    // 2. DISPATCH
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email.toString(),
      subject: `Official Certified Translation: ${order.full_name}`,
      html: `<p>Your document has been professionally translated by Accucert.</p>`,
      attachments: [{
        filename: `Accucert_Translation.jpg`,
        content: Buffer.from(imageBuffer),
      }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("TRANS_FINAL_ERROR:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}