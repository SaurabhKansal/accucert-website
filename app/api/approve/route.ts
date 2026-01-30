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

    // 1. CLOUDINARY "ALL-IN-ONE" TRANSFORMATION
    // This replaces the Spanish with English while preserving the original design.
    const uploadResult = await cloudinary.uploader.upload(order.image_url, {
      public_id: `accucert_${orderId}`,
      ocr: "google_document_ai:translate_to_en", // The magic parameter
      tags: ["translation", "accucert"],
    });

    // Cloudinary returns the URL of the processed image
    const translatedImageUrl = uploadResult.secure_url;

    // 2. DOWNLOAD THE FINAL IMAGE
    const imageBuffer = await fetch(translatedImageUrl).then((res) => res.arrayBuffer());

    // 3. DISPATCH VIA RESEND
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email.toString(),
      subject: `Official Certified Translation: ${order.full_name}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>Official Translation Complete</h2>
          <p>Hi ${order.full_name}, your document has been professionally translated and reconstructed.</p>
          <p>The certified document is attached to this email.</p>
        </div>
      `,
      attachments: [{
        filename: `Accucert_Translation.jpg`,
        content: Buffer.from(imageBuffer),
      }],
    });

    // 4. UPDATE DATABASE
    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);

    return NextResponse.json({ success: true, url: translatedImageUrl });

  } catch (err: any) {
    console.error("CLOUDINARY_DISPATCH_ERROR:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}