import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

type GeneratePdfInput = {
  layoutHtml: string; // Changed from extractedText
  fullName: string;
  orderId: string;
};

export async function generateCertifiedPdf({
  layoutHtml,
  fullName,
  orderId
}: GeneratePdfInput): Promise<Buffer> {
  
  const browser = await puppeteer.launch({
    args: [
      ...chromium.args,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--font-render-hinting=none',
    ],
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  try {
    const page = await browser.newPage();
    // A4 dimensions in pixels at 96 DPI
    await page.setViewport({ width: 794, height: 1123 });

    // Inject the refined layout from Codia AI
    // We wrap it in a basic shell to ensure the Tailwind/CSS renders correctly
    const finalHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @page { margin: 0; }
            body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; }
          </style>
        </head>
        <body>
          ${layoutHtml}
          <div style="position: absolute; bottom: 50px; right: 50px; font-size: 10px; color: gray;">
            Certified by Accucert for ${fullName} | Order: ${orderId}
          </div>
        </body>
      </html>
    `;

    await page.setContent(finalHtml, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0px', bottom: '0px', left: '0px', right: '0px' }
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}