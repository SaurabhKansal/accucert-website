import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

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
}: GeneratePdfInput): Promise<Buffer> {
  
  // 1. STABILITY LAUNCH
  // These specific args help bypass missing Linux libraries like libnss3
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

  const page = await browser.newPage();
  await page.setViewport({ width: 794, height: 1123 });

  // 2. THE UNIVERSAL MIRROR TEMPLATE
  const htmlContent = `
    <html>
      <head>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;700&display=swap');
          body { font-family: 'Noto Sans', sans-serif; padding: 40px; margin: 0; }
          .document-sheet { 
            background: white; 
            border: 12px double #18222b; 
            padding: 20mm; 
            min-height: 250mm;
          }
          .content-area { font-size: 12pt; line-height: 1.6; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; border: 1.5pt solid black; }
          th, td { border: 1pt solid black; padding: 10px; text-align: left; }
        </style>
      </head>
      <body>
        <div class="document-sheet">
          <div class="content-area">${extractedText}</div>
        </div>
      </body>
    </html>
  `;

  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
  });

  await browser.close();
  // Ensure we return a Buffer
  return Buffer.from(pdfBuffer);
}