export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const orderId = body.orderId || body.requestId;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, 
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: order } = await supabase.from('translations').select('*').eq('id', orderId).single();
    if (!order) throw new Error('Order not found');

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); 
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    const { width, height } = page.getSize();
    const margin = 50;
    const maxWidth = width - (margin * 2);

    // --- 1. WATERMARK ---
    page.drawText('ACCUCERT OFFICIAL COPY', {
      x: width / 2 - 150,
      y: height / 2,
      size: 40,
      font: boldFont,
      color: rgb(0.95, 0.95, 0.95), // Very light gray
      rotate: degrees(45),
      opacity: 0.5,
    });

    // --- 2. HEADER LOGO / TITLE ---
    page.drawRectangle({
      x: 0,
      y: height - 60,
      width: width,
      height: 60,
      color: rgb(0.07, 0.07, 0.07), // Black header bar
    });

    page.drawText('ACCUCERT CERTIFIED', {
      x: margin,
      y: height - 40,
      size: 20,
      font: boldFont,
      color: rgb(1, 1, 1),
    });

    // --- 3. METADATA SECTION ---
    let currentY = height - 90;
    page.drawText(`ORDER REF: ${orderId}`, { x: margin, y: currentY, size: 9, font: boldFont, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(`ISSUED TO: ${order.full_name}`, { x: margin, y: currentY - 12, size: 9, font });
    page.drawText(`DATE: ${new Date().toLocaleDateString()}`, { x: width - margin - 80, y: currentY, size: 9, font });

    // --- 4. CONTENT DRAWING (WITH BOLD DETECTION) ---
    currentY = height - 140;
    const fontSize = 11;
    const lineHeight = 16;

    const rawContent = (order.extracted_text || "")
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/&nbsp;/g, ' ');

    const paragraphs = rawContent.split('\n');

    for (const para of paragraphs) {
      if (currentY < margin + 120) break; // Check for signature space
      
      const words = para.split(' ');
      let currentX = margin;

      for (const word of words) {
        const isBold = word.includes('<strong>') || word.includes('<b>');
        const cleanWord = word.replace(/<[^>]*>/g, '');
        const activeFont = isBold ? boldFont : font;
        
        const wordWidth = activeFont.widthOfTextAtSize(cleanWord + " ", fontSize);

        if (currentX + wordWidth > margin + maxWidth) {
          currentY -= lineHeight;
          currentX = margin;
        }

        page.drawText(cleanWord, { x: currentX, y: currentY, size: fontSize, font: activeFont });
        currentX += wordWidth;
      }
      currentY -= lineHeight * 1.5;
    }

    // --- 5. DIGITAL SIGNATURE AREA ---
    const sigY = 100;
    page.drawLine({ start: { x: margin, y: sigY + 40 }, end: { x: margin + 150, y: sigY + 40 }, thickness: 1 });
    page.drawText('Authorized Signatory', { x: margin, y: sigY + 25, size: 8, font: italicFont });
    page.drawText('Accucert Translation Services', { x: margin, y: sigY + 15, size: 8, font });

    // --- 6. OFFICIAL FOOTER ---
    page.drawRectangle({ x: margin, y: 40, width: maxWidth, height: 30, color: rgb(0.98, 0.98, 0.98) });
    page.drawText('This translation is certified to be an accurate representation of the original document.', {
      x: margin + 10,
      y: 52,
      size: 8,
      font: italicFont,
      color: rgb(0.3, 0.3, 0.3),
    });

    const pdfBytes = await pdfDoc.save();

    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>', 
      to: order.user_email,
      subject: 'Your Certified Translation is Ready',
      text: `Hello ${order.full_name}, your official certified translation is attached.`,
      attachments: [{
        filename: `Accucert_Translation_${orderId}.pdf`,
        content: Buffer.from(pdfBytes),
      }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}