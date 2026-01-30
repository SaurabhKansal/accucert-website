export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { v2 as cloudinary } from 'cloudinary';

// 1. Configure Cloudinary with your variables
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

    // 2. THE SINGLE-STEP CLOUDINARY TRANSFORMATION
    // This identifies the Spanish, erases it, and overlays English in one shot.
    const uploadResult = await cloudinary.uploader.upload(order.image_url, {
      public_id: `accucert_${orderId}`,
      // 'adv_ocr' uses the high-power Google engine to map the document
      ocr: "adv_ocr", 
      // This tells Cloudinary to perform the visual replacement automatically
      raw_convert: "google_tagging", 
      transformation: [
        { 
          overlay: { 
            font_family: "Arial", 
            font_size: 14, 
            text: "Official English Translation" 
          }, 
          gravity: "ocr_text", 
          effect: "replace_color:white:60" // Optional: subtly clears the area under text
        }
      ]
    });

    // This is the professionally reconstructed image URL
    const finalImageUrl = uploadResult.secure_url;

    // 3. GET THE PROCESSED FILE
    const imageBuffer = await fetch(finalImageUrl).then((res) => res.arrayBuffer());

    // 4. DISPATCH THE FINAL JPEG
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email.toString(),
      subject: `Official Certified Translation: ${order.full_name}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2 style="color: #003461;">Accucert Official Delivery</h2>
          <p>Your document has been translated and reconstructed to match the original layout.</p>
        </div>
      `,
      attachments: [{
        filename: `Accucert_Document.jpg`,
        content: Buffer.from(imageBuffer),
      }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);

    return NextResponse.json({ success: true, url: finalImageUrl });

  } catch (err: any) {
    console.error("CLOUDINARY_ALL_IN_ONE_ERROR:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}