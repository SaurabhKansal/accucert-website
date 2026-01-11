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
  
  // 1. Point to the remote pack if local fails - this kills the "bin does not exist" error
  const executablePath = await chromium.executablePath();

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: executablePath,
    headless: true, // Use boolean for this specific version combo
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 794, height: 1123 });

  // 2. THE CONTENT
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;700&display=swap');
          body { font-family: 'Noto Sans', sans-serif; padding: 0; margin: 0; }
          .container { border: 12px double #18222b; margin: 20px; padding: 40px; min-height: 1040px; box-sizing: border-box; position: relative; background: #fff; }
          .header { text-align: center; border-bottom: 2px solid #18222b; margin-bottom: 20px; padding-bottom: 10px; }
          .body { font-size: 13px; line-height: 1.5; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          table, th, td { border: 1px solid #ddd; padding: 8px; }
          .footer { position: absolute; bottom: 40px; left: 40px; right: 40px; display: flex; justify-content: space-between; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="font-size: 22px;">CERTIFICATE OF TRANSLATION ACCURACY</h1>
            <p style="font-size: 10px; font-weight: bold;">ID: ${orderId.slice(-8).toUpperCase()}</p>
          </div>
          <div class="body">${extractedText}</div>
          <div class="footer">
            <div><p>____________________</p><p>Authorized Reviewer</p></div>
            <div style="border: 1px dashed #ccc; padding: 10px; color: #ccc;">[ SEAL ]</div>
          </div>
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
  return Buffer.from(pdfBuffer);
}