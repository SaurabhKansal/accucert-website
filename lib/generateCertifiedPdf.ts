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
  
  // 1. FIXED LAUNCH LOGIC
  // Removed 'chromium.defaultViewport' and 'chromium.headless' to fix TS errors.
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true, // Manually set to true for serverless stability
  });

  const page = await browser.newPage();
  
  // Set A4 dimensions (72 DPI) manually here instead of in launch options
  await page.setViewport({ width: 794, height: 1123 });

  // 2. BUILD THE "MIRROR" HTML TEMPLATE
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;700&display=swap');
          body { 
            font-family: 'Noto Sans', sans-serif; 
            padding: 0; 
            margin: 0;
            color: #18222b; 
          }
          .cert-container { 
            border: 12px double #18222b; 
            margin: 20px;
            padding: 40px; 
            min-height: 1040px; 
            position: relative;
            box-sizing: border-box;
            background: #fff;
          }
          .cert-header { 
            text-align: center; 
            border-bottom: 2px solid #18222b; 
            margin-bottom: 30px; 
            padding-bottom: 10px; 
          }
          .translation-body { 
            font-size: 13px; 
            line-height: 1.5; 
          }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          table, th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
          
          .cert-footer { 
            position: absolute; 
            bottom: 40px; 
            left: 40px; 
            right: 40px; 
            display: flex; 
            justify-content: space-between; 
            align-items: flex-end; 
          }
        </style>
      </head>
      <body>
        <div class="cert-container">
          <div class="cert-header">
            <h1 style="margin: 0; font-size: 24px; letter-spacing: 1px;">CERTIFICATE OF TRANSLATION ACCURACY</h1>
            <p style="margin: 5px 0 0; font-size: 10px; font-weight: bold;">ORDER ID: ${orderId.slice(-8).toUpperCase()}</p>
          </div>

          <p style="font-size: 12px; margin-bottom: 20px;">
            This document certifies that the translation of <strong>${originalFilename}</strong> 
            provided by <strong>${fullName}</strong> has been reviewed and certified by Accucert.
          </p>

          <div class="translation-body">
            ${extractedText}
          </div>

          <div class="cert-footer">
            <div>
              <p style="margin-bottom: 40px;">Certified by Authorized Reviewer:</p>
              <p style="border-top: 1px solid #000; display: inline-block; padding-top: 5px; width: 250px;">
                <strong>Accucert Professional Services</strong>
              </p>
            </div>
            <div style="text-align: right; color: #ccc; font-size: 10px; border: 1px dashed #ccc; padding: 15px;">
              [ OFFICIAL SEAL ]
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

  // 3. GENERATE THE PDF
  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
  });

  await browser.close();
  return Buffer.from(pdfBuffer);
}