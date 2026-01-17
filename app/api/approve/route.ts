export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const resend = new Resend(process.env.RESEND_API_KEY);

// Helper to clean HTML entities and strip tags
function cleanHtml(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, '\n') 
    .replace(/<\/p>/gi, '\n')      
    .replace(/&nbsp;/g, ' ')      
    .replace(/&lt;/g, '<')        
    .replace(/&gt;/g, '>')
    .replace(/<[^>]*>/g, '');     
}

function wrapText(text: string, maxWidth: number, font: any, fontSize: number) {
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  paragraphs.forEach((paragraph) => {
    const trimmed = paragraph.trim();
    if (!trimmed) {
      lines.push(''); 
      return;
    }

    const words = trimmed.split(/\s+/);
    let currentLine = '';

    words.forEach((word) => {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, fontSize);
      if (width < maxWidth) {
        currentLine = testLine;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    });
    lines.push(currentLine);
  });

  return lines;
}

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

    const { width, height } = page.getSize();
    const margin = 50;
    const maxWidth = width - (margin * 2);

    // 1. Draw Header
    page.drawText('OFFICIAL CERTIFIED TRANSLATION', { x: margin, y: height - 50, size: 18, font: boldFont });
    page.drawText(`Date: ${new Date().toLocaleDateString()}`, { x: margin, y: height - 75, size: 10, font });
    page.drawText(`Order ID: ${orderId}`, { x: margin, y: height - 90, size: 10, font });
    
    // 2. Process and Draw Body Text
    const cleanedText = cleanHtml(order.extracted_text || "");
    const wrappedLines = wrapText(cleanedText, maxWidth, font, 11);

    let currentY = height - 130;
    const lineHeight = 16;

    wrappedLines.forEach((line) => {
      if (currentY < margin + 60) return; 
      if (line.trim() !== '') {
        page.drawText(line, { x: margin, y: currentY, size: 11, font });
      }
      currentY -= lineHeight;
    });

    // 3. Draw Footer
    const footerY = 80;
    page.drawLine({
      start: { x: margin, y: footerY + 15 },
      end: { x: width - margin, y: footerY + 15 },
      thickness: 1,
      color: rgb(0, 0, 0),
    });
    page.drawText('CERTIFICATION STATEMENT:', { x: margin, y: footerY, size: 10, font: boldFont });
    page.drawText(`This document is an official certified translation issued to ${order.full_name}.`, { x: margin, y: footerY - 15, size: 9, font });

    const pdfBytes = await pdfDoc.save();

    // 4. Send Email (Fixed Type Error by adding 'text')
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>', 
      to: order.user_email,
      subject: 'Your Certified Translation is Ready',
      text: `Hello ${order.full_name}, please find your official certified translation attached.`,
      attachments: [{
        filename: `Certified_Translation_${orderId}.pdf`,
        content: Buffer.from(pdfBytes), // Correctly typed for Resend SDK
      }],
    });

    // 5. Update Status
    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('API Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}