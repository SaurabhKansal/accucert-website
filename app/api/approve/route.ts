export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
});

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

    // 1. THE REFINED CLOUDINARY CALL
    // We use the Google Vision (adv_ocr) and Translation add-ons you just installed.
    const uploadResult = await cloudinary.uploader.upload(order.image_url, {
      public_id: `accucert_${orderId}`,
      // 'adv_ocr' is the technical name for the Google Document AI engine
      ocr: "adv_ocr", 
      // This automatically triggers the Google Translation add-on
      raw_convert: "google_translate:en", 
      // This is the correct syntax for 'Visual Translation'
      // It pixelates the old Spanish and overlays the new English automatically
      transformation: [
        { effect: "pixelate_region", gravity: "ocr_text" },
        { overlay: "text:arial_20:$(translated_text)", gravity: "ocr_text" }
      ]
    });

    // The result 'secure_url' will be the fully processed image
    const finalImageUrl = uploadResult.secure_url;

    // 2. DOWNLOAD THE RESULT
    const imageBuffer = await fetch(finalImageUrl).then((res) => res.arrayBuffer());

    // 3. DISPATCH VIA RESEND (Fixed TS error with 'html' and Buffer)
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email.toString(),
      subject: `Official Certified Translation: ${order.full_name}`,
      html: `<p>Hi ${order.full_name}, your document has been professionally translated and reconstructed.</p>`,
      attachments: [{
        filename: `Accucert_Translation.jpg`,
        content: Buffer.from(imageBuffer),
      }],
    });

    // 4. UPDATE DATABASE
    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);

    return NextResponse.json({ success: true, url: finalImageUrl });

  } catch (err: any) {
    console.error("PIXEL_RECON_ERROR:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}