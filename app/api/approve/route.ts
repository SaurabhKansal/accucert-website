export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // 1. Fetch Order
    const { data: order } = await supabase.from('translations').select('*').eq('id', orderId).single();
    if (!order) throw new Error('Order not found');

    // 2. Create PDF with pdf-lib (No Chromium needed!)
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]); // Standard A4-ish size
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Draw Header
    page.drawText('CERTIFIED TRANSLATION', { x: 50, y: 750, size: 20, font: boldFont });
    page.drawText(`Order ID: ${orderId}`, { x: 50, y: 730, size: 10, font, color: rgb(0.5, 0.5, 0.5) });

    // Draw Content (The text you edited in Admin)
    const text = order.extracted_text || "No content provided.";
    page.drawText(text, {
      x: 50,
      y: 700,
      size: 12,
      font,
      maxWidth: 500,
      lineHeight: 15,
    });

    // Draw Footer
    page.drawText(`Certified by Accucert for ${order.full_name}`, {
      x: 50,
      y: 50,
      size: 10,
      font: boldFont,
      color: rgb(0, 0, 0),
    });

    const pdfBytes = await pdfDoc.save();

    // 3. Send Email via Resend
    const { data, error } = await resend.emails.send({
      from: 'Accucert <translations@accucert.com>',
      to: order.user_email,
      subject: 'Your Certified Translation is Ready!',
      text: 'Please find your certified translation attached.',
      attachments: [
        {
          filename: `Certified_Translation_${orderId}.pdf`,
          content: Buffer.from(pdfBytes),
        },
      ],
    });

    if (error) throw error;

    // 4. Update Status
    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('API Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}