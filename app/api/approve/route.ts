export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // Handles both variable names we've used in the Admin dashboard
    const orderId = body.orderId || body.requestId;

    if (!orderId) throw new Error('Order ID is missing in request body');

    // Initialize Supabase with Service Role (Bypasses RLS for status updates)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, 
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Fetch the translation record from Supabase
    const { data: order, error: fetchError } = await supabase
      .from('translations')
      .select('*')
      .eq('id', orderId)
      .single();

    if (fetchError || !order) throw new Error('Translation order not found in database');

    // 2. Generate a clean, official PDF using pdf-lib
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // PDF Header
    page.drawText('OFFICIAL CERTIFIED TRANSLATION', { x: 50, y: 750, size: 18, font: boldFont });
    page.drawText(`Date: ${new Date().toLocaleDateString()}`, { x: 50, y: 730, size: 10, font });
    page.drawText(`Order ID: ${orderId}`, { x: 50, y: 715, size: 10, font });
    page.drawLine({
      start: { x: 50, y: 700 },
      end: { x: 550, y: 700 },
      thickness: 1,
      color: rgb(0, 0, 0),
    });

    // Translated Content
    const textContent = order.extracted_text || "No translated content found.";
    page.drawText(textContent, {
      x: 50,
      y: 670,
      size: 11,
      font,
      maxWidth: 500,
      lineHeight: 15,
    });

    // Official Footer
    page.drawText('CERTIFICATION STATEMENT:', { x: 50, y: 100, size: 10, font: boldFont });
    page.drawText(`This document is an official certified translation issued to ${order.full_name}.`, {
      x: 50,
      y: 85,
      size: 9,
      font,
    });

    const pdfBytes = await pdfDoc.save();

    // 3. Dispatch Email with Attachment via Resend
    // NOTE: Using onboarding@resend.dev until your domain is verified
    const { error: emailError } = await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>', 
      to: order.user_email,
      subject: 'Your Certified Translation is Ready',
      text: `Hello ${order.full_name},\n\nPlease find your official certified translation attached to this email.\n\nThank you for choosing Accucert.`,
      attachments: [
        {
          filename: `Accucert_Translation_${orderId}.pdf`,
          content: Buffer.from(pdfBytes),
        },
      ],
    });

    if (emailError) throw new Error(`Email failed: ${emailError.message}`);

    // 4. Update order status to 'completed'
    await supabase
      .from('translations')
      .update({ status: 'completed' })
      .eq('id', orderId);

    return NextResponse.json({ success: true, message: 'PDF generated and emailed successfully' });

  } catch (error: any) {
    console.error('CRITICAL_DISPATCH_ERROR:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}