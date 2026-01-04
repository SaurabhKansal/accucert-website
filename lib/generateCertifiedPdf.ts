import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type GeneratePdfInput = {
  originalFilename: string;
  extractedText: string;
};

export async function generateCertifiedPdf({
  originalFilename,
  extractedText,
}: GeneratePdfInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  /* ===============================
     PAGE 1 — CERTIFICATION PAGE
  =============================== */
  const cover = pdfDoc.addPage([595, 842]); // A4
  const { height, width } = cover.getSize();

  cover.drawText("Certified Translation", {
    x: 50,
    y: height - 80,
    size: 26,
    font,
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

  cover.drawText(`Date: ${new Date().toLocaleDateString()}`, {
    x: 50,
    y: height - 210,
    size: 11,
    font,
  });

  cover.drawText("Accucert — Official Certified Translations", {
    x: 50,
    y: 60,
    size: 10,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  /* ===============================
     PAGE 2+ — EXTRACTED TEXT
  =============================== */

  const cleanText = extractedText
    .replace(/\r/g, "")
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0);

  const fontSize = 11;
  const lineHeight = 16;
  const marginTop = 50;
  const marginBottom = 50;
  const maxWidth = width - 100;

  let page = pdfDoc.addPage([595, 842]);
  let y = page.getHeight() - marginTop;

  for (const line of cleanText) {
    // Wrap long lines safely
    const words = line.split(" ");
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine
        ? `${currentLine} ${word}`
        : word;

      const textWidth = font.widthOfTextAtSize(testLine, fontSize);

      if (textWidth > maxWidth) {
        // Draw current line
        if (y < marginBottom) {
          page = pdfDoc.addPage([595, 842]);
          y = page.getHeight() - marginTop;
        }

        page.drawText(currentLine, {
          x: 50,
          y,
          size: fontSize,
          font,
        });

        y -= lineHeight;
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    // Draw remaining line
    if (currentLine) {
      if (y < marginBottom) {
        page = pdfDoc.addPage([595, 842]);
        y = page.getHeight() - marginTop;
      }

      page.drawText(currentLine, {
        x: 50,
        y,
        size: fontSize,
        font,
      });

      y -= lineHeight;
    }
  }

  return await pdfDoc.save();
}
