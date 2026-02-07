import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { orderId, translatedUrls, userEmail, fullName } = await req.json();
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, 
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const urlArray = translatedUrls.split(',').filter((url: string) => url.trim() !== "");
    const pdfDoc = await PDFDocument.create();
    
    // --- 1. GENERATE THE OFFICIAL COVER PAGE ---
    const coverPage = pdfDoc.addPage([600, 800]); // Standard A4-ish size
    const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // Header & Branding
    coverPage.drawText("ACCUCERT GLOBAL", { x: 220, y: 720, size: 20, font: fontBold, color: rgb(0, 0, 0.5) });
    coverPage.drawLine({ start: { x: 50, y: 700 }, end: { x: 550, y: 700 }, thickness: 2, color: rgb(0, 0, 0) });

    // Document Title
    coverPage.drawText("CERTIFICATE OF TRANSLATION ACCURACY", { x: 130, y: 650, size: 14, font: fontBold });

    // Client Details
    coverPage.drawText(`Client Name: ${fullName}`, { x: 70, y: 580, size: 12, font: fontRegular });
    coverPage.drawText(`Order ID: ${orderId}`, { x: 70, y: 560, size: 12, font: fontRegular });
    coverPage.drawText(`Date of Issue: ${date}`, { x: 70, y: 540, size: 12, font: fontRegular });

    // Certification Statement (The Legal Part)
    const statement = `This is to certify that the attached document is a true, accurate, and complete translation of the original document provided. The translation was performed by Accucert Global's proprietary AI reconstruction engine and verified for visual and linguistic fidelity.`;
    
    coverPage.drawText("CERTIFICATION STATEMENT:", { x: 70, y: 480, size: 12, font: fontBold });
    
    // Simple wrapping for the statement
    coverPage.drawText(statement, { 
        x: 70, y: 460, size: 11, font: fontRegular, 
        maxWidth: 460, lineHeight: 15 
    });

    // Footer Stamp Placeholder
    coverPage.drawText("DIGITALLY SIGNED & VERIFIED BY ACCUCERT GLOBAL", { 
        x: 160, y: 150, size: 10, font: fontBold, color: rgb(0.5, 0.5, 0.5) 
    });
    coverPage.drawText("Verification Link: accucert.com/verify", { x: 230, y: 135, size: 8, font: fontRegular });

    // --- 2. APPEND THE AI-RECONSTRUCTED PAGES ---
    for (const url of urlArray) {
      const imgRes = await fetch(url.trim());
      const imgBytes = await imgRes.arrayBuffer();
      
      const image = await pdfDoc.embedJpg(imgBytes); 
      const { width, height } = image.scale(1);
      
      // Add each image as its own page following the cover
      const page = pdfDoc.addPage([width, height]);
      page.drawImage(image, { x: 0, y: 0, width, height });
    }

    const pdfBytes = await pdfDoc.save();

    // --- 3. DISPATCH VIA RESEND ---
    const { error: emailError } = await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: userEmail,
      subject: `Official Certified Translation: ${fullName}`,
      attachments: [{
        filename: `Accucert_Certified_${fullName}.pdf`,
        content: Buffer.from(pdfBytes),
      }],
      html: `
        <div style="font-family: serif; padding: 30px; border: 1px solid #eee;">
          <h2 style="color: #003366;">Translation Completed Successfully</h2>
          <p>Dear ${fullName},</p>
          <p>Your official certified translation has been generated. It includes a <strong>Certificate of Accuracy</strong> followed by the reconstructed pages of your original document.</p>
          <p>Please find the PDF attached to this email.</p>
          <br/>
          <p>Best regards,<br/><strong>Accucert Global Management</strong></p>
        </div>
      `,
    });

    if (emailError) throw new Error(emailError.message);

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("DISPATCH_ERROR:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}