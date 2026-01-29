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
    const { data: order } = await supabase.from('translations').select('*').eq('id', orderId).single();

    if (!order) throw new Error('Order not found');

    // 1. CREATE PDF DOCUMENT
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    // --- PAGE 1: OFFICIAL CERTIFYING LETTER ---
    const coverPage = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = coverPage.getSize();
    const margin = 60;

    // Header / Branding
    coverPage.drawText('ACCUCERT', { x: margin, y: height - 60, size: 24, font: boldFont, color: rgb(0, 0, 0) });
    coverPage.drawText('Official Translation & Legalisation Services', { x: margin, y: height - 80, size: 10, font: italicFont });
    coverPage.drawLine({ start: { x: margin, y: height - 95 }, end: { x: width - margin, y: height - 95 }, thickness: 1 });

    // Date and Subject
    coverPage.drawText(`Date: ${new Date().toLocaleDateString()}`, { x: margin, y: height - 130, size: 10, font });
    coverPage.drawText('CERTIFICATE OF TRANSLATION ACCURACY', { x: margin, y: height - 170, size: 16, font: boldFont });

    // Standard Wording (Automated)
    const bodyText = [
      `To Whom It May Concern,`,
      ``,
      `Accucert Translation Services hereby certifies that the attached document is a true, complete, and`,
      `accurate translation of the original text provided to us for processing.`,
      ``,
      `Order Details:`,
      `• Client Name: ${order.full_name}`,
      `• Document Type: ${order.document_type || 'Official Document'}`,
      `• Language Pair: ${order.language_from} to ${order.language_to}`,
      `• Reference Number: ${orderId}`,
      ``,
      `I further certify that I am competent in both languages and that this translation has been`,
      `verified by our internal quality control team to meet international certification standards.`,
      ``,
      `This certification is valid for legal, academic, and governmental submissions.`,
    ];

    let currentY = height - 210;
    bodyText.forEach(line => {
      coverPage.drawText(line, { x: margin, y: currentY, size: 11, font, lineHeight: 16 });
      currentY -= 16;
    });

    // Signature Area (Automated Stamp/Placeholders)
    coverPage.drawText('Authorized Signature:', { x: margin, y: 150, size: 10, font: boldFont });
    coverPage.drawLine({ start: { x: margin, y: 110 }, end: { x: margin + 150, y: 110 }, thickness: 1 });
    coverPage.drawText('Director of Certification', { x: margin, y: 95, size: 9, font });

    // --- PAGE 2: THE TRANSLATION ---
    const transPage = pdfDoc.addPage([595.28, 841.89]);
    transPage.drawText('TRANSLATED DOCUMENT', { x: margin, y: height - 60, size: 14, font: boldFont });
    
    // Process the text from Codia / Editor
    const cleanText = (order.extracted_text || "").replace(/<[^>]*>/g, ' '); // Clean HTML
    transPage.drawText(cleanText, {
      x: margin,
      y: height - 100,
      size: 10,
      font,
      maxWidth: width - (margin * 2),
      lineHeight: 14,
    });

    // 2. SAVE & ATTACH
    const pdfBytes = await pdfDoc.save();

    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>', 
      to: order.user_email,
      subject: 'Your Official Certified Translation is Attached',
      html: `
        <p>Hello ${order.full_name},</p>
        <p>Your official certified translation for the <b>${order.document_type}</b> is now ready.</p>
        <p>Please find the certified PDF file attached to this email. You can download and print this for your records.</p>
        <br/>
        <p>Thank you for choosing Accucert.</p>
      `,
      attachments: [{
        filename: `Accucert_Certified_${order.full_name.replace(/\s+/g, '_')}.pdf`,
        content: Buffer.from(pdfBytes), // Attaches as a downloadable file
      }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('API Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}