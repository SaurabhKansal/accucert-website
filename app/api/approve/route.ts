export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
});

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: order } = await supabase.from('translations').select('*').eq('id', orderId).single();

    if (!order) throw new Error('Order not found.');

    // 1. THE CLOUDINARY TRANSFORMATION
    // We use 'adv_ocr' (Advanced OCR by Google) and 'google_translate' together.
    // This removes the Spanish and overlays the English.
    const uploadResult = await cloudinary.uploader.upload(order.image_url, {
      public_id: `accucert_${orderId}`,
      // 'adv_ocr' is the Google engine. 'document' mode is for high-density forms.
      ocr: "adv_ocr", 
      raw_convert: "google_translate:en", 
      // This tells Cloudinary to replace the original text pixels (Inpainting)
      transformation: [
        { effect: "pixelate_region:ocr_text" }, // Optional: hides original text specifically
        { overlay: { font_family: "Arial", font_size: 20, text: "$(translated_text)" }, gravity: "ocr_text" }
      ]
    });

    // Cloudinary creates a "Derived" version of your image with the text swapped.
    const finalImageUrl = uploadResult.secure_url;

    // 2. DOWNLOAD & DISPATCH
    const imageBuffer = await fetch(finalImageUrl).then(res => res.arrayBuffer());

    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email.toString(),
      subject: `Official Certified Translation: ${order.full_name}`,
      html: `<p>Your document has been professionally translated and reconstructed.</p>`,
      attachments: [{
        filename: `Accucert_Translation.jpg`,
        content: Buffer.from(imageBuffer),
      }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true, url: finalImageUrl });

  } catch (err: any) {
    console.error("TRANSFORMATION_ERROR:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}