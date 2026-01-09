import { PDFDocument, rgb } from "pdf-lib";
import fontkit from '@pdf-lib/fontkit';
import fs from 'fs';
import path from 'path';

type GeneratePdfInput = {
  originalFilename: string;
  extractedText: string; // This is now HTML from React-Quill
};

export async function generateCertifiedPdf({
  originalFilename,
  extractedText,
}: GeneratePdfInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  
  // 1. REGISTER FONTKIT & LOAD UNICODE FONT
  // This prevents the "WinAnsi cannot encode" error for Tibetan/Hindi/etc.
  pdfDoc.registerFontkit(fontkit);
  const fontPath = path.join(process.cwd(), 'public/fonts/NotoSans-Regular.ttf');
  const fontBytes = fs.readFileSync(fontPath);
  const font = await pdfDoc.embedFont(fontBytes);
  const fontBold = await pdfDoc.embedFont(fontBytes); // Using same font for consistency

  /* ===============================
     PAGE 1 — CERTIFICATION PAGE (Cover)
  =============================== */
  const cover = pdfDoc.addPage([595, 842]); // A4
  const { height, width } = cover.getSize();

  cover.drawText("Certified Translation", {
    x: 50,
    y: height - 80,
    size: 26,
    font: fontBold,
    color: rgb(0.09, 0.13, 0.17), // Accucert Blue #18222b
  });

  cover.drawText(
    `This document certifies that the translation of "${originalFilename}" is accurate and complete to the best of our professional ability.`,
    {
      x: 50,
      y: height - 140,
      size: 12,
      font,
      maxWidth: width - 100,
      lineHeight: 18,
    }
  );

  cover.drawText(
    "Note: This document has been professionally reviewed and certified by the Accucert team.",
    {
      x: 50,
      y: height - 185,
      size: 10,
      font,
      color: rgb(0.4, 0.4, 0.4),
    }
  );

  cover.drawText(`Date: ${new Date().toLocaleDateString()}`, {
    x: 50,
    y: height - 225,
    size: 11,
    font,
  });

  // Stamp-like branding at bottom
  cover.drawText("Accucert — Official Certified Document", {
    x: 50,
    y: 60,
    size: 10,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  /* ===============================
     PAGE 2+ — FORMATTED TRANSLATION
  =============================== */
  
  // 2. CLEAN HTML TAGS FROM RICH TEXT EDITOR
  // This converts the HTML from React-Quill into clean lines for the PDF
  const cleanText = extractedText
    .replace(/<\/p>/g, '\n')       // Paragraphs to new lines
    .replace(/<br\s*\/?>/g, '\n') // Line breaks to new lines
    .replace(/<[^>]+>/g, '')      // Remove all other HTML tags
    .split('\n')
    .filter(line => line.trim().length > 0);

  const fontSize = 11;
  const lineHeight = 16;
  const marginTop = 50;
  const marginBottom = 50;
  const maxWidth = width - 100;

  let page = pdfDoc.addPage([595, 842]);
  let y = page.getHeight() - marginTop;

  for (const line of cleanText) {
    const words = line.split(" ");
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const textWidth = font.widthOfTextAtSize(testLine, fontSize);

      if (textWidth > maxWidth) {
        if (y < marginBottom) {
          page = pdfDoc.addPage([595, 842]);
          y = page.getHeight() - marginTop;
        }
        page.drawText(currentLine, { x: 50, y, size: fontSize, font });
        y -= lineHeight;
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      if (y < marginBottom) {
        page = pdfDoc.addPage([595, 842]);
        y = page.getHeight() - marginTop;
      }
      page.drawText(currentLine, { x: 50, y, size: fontSize, font });
      y -= lineHeight;
    }
  }

  return await pdfDoc.save();
}