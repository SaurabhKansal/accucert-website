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
    const margin = 50;
    const pageWidth = 595.28;
    const pageHeight = 841.89;

    // --- PAGE 1: THE CERTIFYING LETTER (Automated Branding) ---
    const page1 = pdfDoc.addPage([pageWidth, pageHeight]);
    
    // Header Branding Block
    page1.drawRectangle({ x: 0, y: pageHeight - 100, width: pageWidth, height: 100, color: rgb(0.05, 0.1, 0.2) });
    page1.drawText('ACCUCERT', { x: margin, y: pageHeight - 65, size: 28, font: boldFont, color: rgb(1, 1, 1) });
    page1.drawText('Official Certification of Translation Accuracy', { x: margin, y: pageHeight - 85, size: 10, font, color: rgb(0.8, 0.8, 0.8) });

    // Certificate Content
    page1.drawText(`Date: ${new Date().toLocaleDateString()}`, { x: margin, y: pageHeight - 150, size: 10, font });
    page1.drawText('To Whom It May Concern,', { x: margin, y: pageHeight - 190, size: 12, font: boldFont });
    
    const certText = `This is to certify that the document titled "${order.document_type}" has been translated from ${order.language_from} to ${order.language_to} by a professional linguist qualified by Accucert. We further certify that, to the best of our knowledge and belief, the attached translation is a true, complete, and accurate rendering of the original source.`;

    page1.drawText(certText, { x: margin, y: pageHeight - 220, size: 11, font, maxWidth: pageWidth - (margin * 2), lineHeight: 16 });

    // Client Details Table
    page1.drawRectangle({ x: margin, y: 400, width: pageWidth - 100, height: 100, color: rgb(0.95, 0.95, 0.95) });
    page1.drawText('CERTIFICATION DETAILS', { x: margin + 10, y: 485, size: 9, font: boldFont, color: rgb(0.4, 0.4, 0.4) });
    page1.drawText(`Client Name: ${order.full_name}`, { x: margin + 10, y: 460, size: 11, font });
    page1.drawText(`Reference ID: ${orderId}`, { x: margin + 10, y: 440, size: 11, font });
    page1.drawText(`Document: ${order.document_type}`, { x: margin + 10, y: 420, size: 11, font });

    // Stamp & Signature Area
    page1.drawText('DIRECTOR OF CERTIFICATION', { x: margin, y: 150, size: 10, font: boldFont });
    page1.drawLine({ start: { x: margin, y: 110 }, end: { x: margin + 200, y: 110 }, thickness: 1 });
    page1.drawText('Accucert Official Seal', { x: margin, y: 95, size: 8, font, color: rgb(0.6, 0.6, 0.6) });

    // --- PAGE 2: THE TRANSLATED CONTENT ---
    const page2 = pdfDoc.addPage([pageWidth, pageHeight]);
    page2.drawText('TRANSLATED TEXT', { x: margin, y: pageHeight - 60, size: 14, font: boldFont });
    
    const cleanText = (order.extracted_text || "").replace(/<[^>]*>/g, ' '); 
    page2.drawText(cleanText, { x: margin, y: pageHeight - 100, size: 11, font, maxWidth: pageWidth - (margin * 2), lineHeight: 15 });

    const pdfBytes = await pdfDoc.save();

    // 3. SEND EMAIL WITH PDF ATTACHMENT
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email,
      subject: `Official Certified Translation: ${order.full_name}`,
      html: `<p>Hello ${order.full_name}, your official certified translation is attached as a PDF.</p>`,
      attachments: [{
        filename: `Accucert_Certified_Translation.pdf`,
        content: Buffer.from(pdfBytes),
      }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}