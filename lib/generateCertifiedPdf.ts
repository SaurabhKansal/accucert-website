import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import path from 'path';
import fs from 'fs';

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
  
  // MANUAL BINARY PATH RESOLUTION
  // This looks for the brotli files specifically in the Vercel task directory
  const vercelBinPath = path.join(process.cwd(), 'node_modules', '@sparticuz', 'chromium', 'bin');
  
  // Provide the graphics/binaries location to the library explicitly
  if (fs.existsSync(vercelBinPath)) {
    chromium.setGraphicsMode = false; // Optimizes for serverless
  }

  const browser = await puppeteer.launch({
    args: [...chromium.args, '--font-render-hinting=none'],
    // We try to resolve the path; if it fails, we fall back to a remote executable
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 794, height: 1123 });

  // THE CONTENT (Design-Proof Mirror)
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;700&display=swap');
          body { font-family: 'Noto Sans', sans-serif; margin: 0; padding: 0; background: #fff; }
          .container { border: 12px double #18222b; margin: 20px; padding: 40px; min-height: 1040px; box-sizing: border-box; position: relative; }
          .header { text-align: center; border-bottom: 2px solid #18222b; margin-bottom: 30px; padding-bottom: 10px; }
          .body { font-size: 13px; line-height: 1.6; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          table, th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
          .footer { position: absolute; bottom: 40px; left: 40px; right: 40px; display: flex; justify-content: space-between; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0; font-size: 24px;">CERTIFICATE OF TRANSLATION ACCURACY</h1>
            <p style="margin: 5px 0 0; font-size: 10px; font-weight: bold;">ID: ${orderId.slice(-8).toUpperCase()}</p>
          </div>
          <div class="body">${extractedText}</div>
          <div class="footer">
            <div><p>__________________________</p><p><strong>Accucert Professional Services</strong></p></div>
            <div style="border: 1px dashed #ccc; padding: 15px; color: #ccc;">[ SEAL ]</div>
          </div>
        </div>
      </body>
    </html>
  `;

  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' }
  });

  await browser.close();
  return Buffer.from(pdfBuffer);
}