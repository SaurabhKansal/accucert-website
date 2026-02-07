import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { PDFDocument, StandardFonts } from 'pdf-lib'; // npm install pdf-lib
import { Document, Packer, Paragraph, TextRun } from 'docx'; // npm install docx

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { 
      orderId, 
      htmlContent, 
      translatedUrls, 
      userEmail, 
      fullName,
      originalFormat 
    } = await req.json();
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, 
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Save manual edits to DB
    await supabase.from('translations').update({ manual_edits: htmlContent }).eq('id', orderId);

    const urlArray = translatedUrls.split(',').filter((url: string) => url.trim() !== "");
    let attachments: any[] = [];
    const cleanText = htmlContent.replace(/<[^>]*>?/gm, '\n').trim();

    // 2. GENERATE OUTPUT BASED ON ORIGINAL FORMAT
    if (originalFormat === 'pdf') {
      // Create a high-quality PDF containing the manual edits
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([600, 800]);
      const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
      
      page.drawText("CERTIFIED ENGLISH TRANSLATION", { x: 50, y: 750, size: 16, font });
      page.drawText(cleanText, { x: 50, y: 700, size: 11, font, lineHeight: 14 });
      
      const pdfBytes = await pdfDoc.save();
      attachments.push({
        filename: `Accucert_Translation_${fullName}.pdf`,
        content: Buffer.from(pdfBytes),
      });
    } 
    else if (originalFormat === 'docx' || originalFormat === 'doc') {
      // Create a Word Document with the edits
      const doc = new Document({
        sections: [{
          children: [
            new Paragraph({ children: [new TextRun({ text: "CERTIFIED TRANSLATION", bold: true, size: 28 })] }),
            new Paragraph({ children: [new TextRun({ text: cleanText, size: 24 })] }),
          ],
        }],
      });
      const docBuffer = await Packer.toBuffer(doc);
      attachments.push({
        filename: `Accucert_Translation_${fullName}.docx`,
        content: docBuffer,
      });
    } 
    else {
      // DEFAULT: Send high-res reconstructed JPGs
      const imageAttachments = await Promise.all(urlArray.map(async (url: string, i: number) => {
        const res = await fetch(url.trim());
        const buffer = await res.arrayBuffer();
        return {
          filename: `Accucert_Translation_Page_${i + 1}.jpg`,
          content: Buffer.from(buffer),
        };
      }));
      attachments = imageAttachments;
    }

    // 3. SEND EMAIL
    const { error: emailError } = await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: userEmail,
      subject: `Official Certified Translation: ${fullName}`,
      html: `
        <div style="font-family: 'Times New Roman', serif; padding: 40px; color: #1a1a1a;">
          <h2 style="border-bottom: 2px solid #333;">Translation Complete</h2>
          <p>Dear ${fullName},</p>
          <p>Your certified translation has been finalized. Please find the document attached in its original requested format (<strong>${originalFormat.toUpperCase()}</strong>).</p>
          <p>Thank you for choosing Accucert Global.</p>
        </div>
      `,
      attachments: attachments,
    });

    if (emailError) throw new Error(emailError.message);

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("DISPATCH_ERROR:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}