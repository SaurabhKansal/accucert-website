import { PDFDocument, rgb } from "pdf-lib";
import fontkit from '@pdf-lib/fontkit';
import fs from 'fs';
import path from 'path';

type GeneratePdfInput = {
  originalFilename: string;
  extractedText: string;
  fullName: string;
  orderId: string;
};

export async function generateCertifiedPdf({
  originalFilename,
  extractedText,
  fullName,
  orderId
}: GeneratePdfInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  // --- ROBUST FONT PATH RESOLUTION ---
  const fontPath = path.join(process.cwd(), 'public', 'fonts', 'NotoSans-Regular.ttf');
  
  if (!fs.existsSync(fontPath)) {
    throw new Error(`Critical Error: Font file missing at ${fontPath}. Ensure it is in public/fonts/`);
  }

  const fontBytes = fs.readFileSync(fontPath);
  const font = await pdfDoc.embedFont(fontBytes);
  const fontBold = await pdfDoc.embedFont(fontBytes);

  // --- ASSET LOADING (Seal & Signature) ---
  const sealPath = path.join(process.cwd(), 'public', 'seal.png');
  const sigPath = path.join(process.cwd(), 'public', 'signature.png');

  /* ===============================
     PAGE 1 — CERTIFICATION LETTER
  =============================== */
  const cover = pdfDoc.addPage([595, 842]);
  const { height, width } = cover.getSize();

  cover.drawText("CERTIFICATE OF TRANSLATION ACCURACY", {
    x: 50, y: height - 80, size: 20, font: fontBold, color: rgb(0.09, 0.13, 0.17)
  });

  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  cover.drawText(`Certificate No: AC-${orderId.slice(-6).toUpperCase()}`, { x: 50, y: height - 110, size: 10, font });
  cover.drawText(`Date of Issue: ${date}`, { x: 50, y: height - 125, size: 10, font });

  const bodyText = `I, the undersigned authorized representative of Accucert, hereby certify that the attached document "${originalFilename}" has been translated from its original language into English by a qualified professional linguist.

I further certify that, to the best of my knowledge and belief, the translation is a true, accurate, and complete rendering of the original document provided by the client, ${fullName}.`;

  cover.drawText(bodyText, {
    x: 50, y: height - 180, size: 11, font, maxWidth: width - 100, lineHeight: 18
  });

  if (fs.existsSync(sigPath)) {
    const sigBytes = fs.readFileSync(sigPath);
    const sigImage = await pdfDoc.embedPng(sigBytes);
    cover.drawImage(sigImage, { x: 50, y: height - 420, width: 120, height: 50 });
  }

  cover.drawText("________________________", { x: 50, y: height - 430, size: 12, font });
  cover.drawText("Authorized Reviewer", { x: 50, y: height - 445, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
  cover.drawText("Accucert Professional Services", { x: 50, y: height - 458, size: 10, font, color: rgb(0.4, 0.4, 0.4) });

  if (fs.existsSync(sealPath)) {
    const sealBytes = fs.readFileSync(sealPath);
    const sealImage = await pdfDoc.embedPng(sealBytes);
    cover.drawImage(sealImage, { x: width - 180, y: height - 460, width: 130, height: 130, opacity: 0.8 });
  }

  /* ===============================
     PAGE 2+ — FORMATTED CONTENT
  =============================== */
  const cleanText = extractedText
    .replace(/<\/p>/g, '\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    // --- NEW: DECODE HTML ENTITIES ---
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split('\n')
    .filter(line => line.trim().length > 0);

  let page = pdfDoc.addPage([595, 842]);
  let y = page.getHeight() - 50;

  for (const line of cleanText) {
    const words = line.split(" ");
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const textWidth = font.widthOfTextAtSize(testLine, 11);

      if (textWidth > width - 100) {
        if (y < 60) {
          page = pdfDoc.addPage([595, 842]);
          y = page.getHeight() - 50;
        }
        page.drawText(currentLine, { x: 50, y, size: 11, font });
        y -= 16;
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      if (y < 60) {
        page = pdfDoc.addPage([595, 842]);
        y = page.getHeight() - 50;
      }
      page.drawText(currentLine, { x: 50, y, size: 11, font });
      y -= 16;
    }
  }

  return await pdfDoc.save();
}