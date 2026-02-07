import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { Document, Packer, Paragraph, TextRun } from 'docx';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { orderId, htmlContent, translatedUrls, userEmail, fullName, originalFormat } = await req.json();
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, 
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. CLEAN TEXT (The fix for "&nbsp;" and "No text detected")
    const cleanText = htmlContent
      .replace(/<[^>]*>?/gm, '\n') 
      .replace(/&nbsp;/g, ' ')      
      .replace(/\s\s+/g, ' ')       
      .trim();

    await supabase.from('translations').update({ manual_edits: htmlContent }).eq('id', orderId);

    const urlArray = translatedUrls.split(',').filter((url: string) => url.trim() !== "");
    let attachments: any[] = [];

    // 2. GENERATE OUTPUT
    if (originalFormat === 'pdf') {
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
      let page = pdfDoc.addPage([600, 800]);
      
      page.drawText("CERTIFIED ENGLISH TRANSLATION", { x: 50, y: 750, size: 16, font });
      
      const words = cleanText.split(' ');
      let currentLine = "";
      let y = 700;

      // Type safety added to 'word'
      for (const word of words) {
        currentLine += word + " ";
        if (currentLine.length > 80) { 
          page.drawText(currentLine, { x: 50, y, size: 11, font });
          currentLine = "";
          y -= 15;
          if (y < 50) { 
            page = pdfDoc.addPage([600, 800]);
            y = 750;
          }
        }
      }
      page.drawText(currentLine, { x: 50, y, size: 11, font });

      const pdfBytes = await pdfDoc.save();
      attachments.push({
        filename: `Accucert_Certified_${fullName}.pdf`,
        content: Buffer.from(pdfBytes),
      });
    } 
    else if (originalFormat === 'docx' || originalFormat === 'doc') {
      const doc = new Document({
        sections: [{
          children: [
            new Paragraph({ children: [new TextRun({ text: "CERTIFIED TRANSLATION", bold: true, size: 32 })] }),
            // Added : string type here to fix your specific error
            ...cleanText.split('\n').map((line: string) => new Paragraph({
              children: [new TextRun({ text: line, size: 24 })]
            }))
          ],
        }],
      });
      const docBuffer = await Packer.toBuffer(doc);
      attachments.push({
        filename: `Accucert_Certified_${fullName}.docx`,
        content: docBuffer,
      });
    } 
    else {
      // JPG Logic - Type safety added to 'url' and 'i'
      const imageAttachments = await Promise.all(urlArray.map(async (url: string, i: number) => {
        const res = await fetch(url.trim());
        const buffer = await res.arrayBuffer();
        return {
          filename: `Accucert_Page_${i + 1}.jpg`,
          content: Buffer.from(buffer),
        };
      }));
      attachments = imageAttachments;
    }

    // 3. DISPATCH
    const { error: emailError } = await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: userEmail,
      subject: `Official Certified Translation: ${fullName}`,
      html: `<div style="font-family: serif;"><h2>Translation Finalized</h2><p>Dear ${fullName}, your document is attached.</p></div>`,
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