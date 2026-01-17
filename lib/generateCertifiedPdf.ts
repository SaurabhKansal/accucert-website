/**
 * This utility now prepares the HTML for the Browser's print engine.
 * We removed Puppeteer/Chromium to prevent Vercel deployment crashes.
 */

type GeneratePdfInput = {
  layoutHtml: string;
  fullName: string;
  orderId: string;
};

export function getPrintableHtml({
  layoutHtml,
  fullName,
  orderId
}: GeneratePdfInput): string {
  
  // We wrap the Codia HTML in a shell that forces A4 dimensions 
  // and includes the certification footer.
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Certified_Translation_${orderId}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;700&display=swap');
          
          @page { 
            size: A4; 
            margin: 0; 
          }
          
          body { 
            margin: 0; 
            padding: 0; 
            font-family: 'Noto Sans', sans-serif;
            -webkit-print-color-adjust: exact; 
          }

          .print-container {
            width: 210mm;
            min-height: 297mm;
            position: relative;
            margin: 0 auto;
            background: white;
          }

          .certification-footer {
            position: absolute;
            bottom: 20mm;
            right: 20mm;
            font-size: 10px;
            color: #64748b;
            border-top: 1px solid #e2e8f0;
            padding-top: 5px;
            text-align: right;
          }
        </style>
      </head>
      <body>
        <div class="print-container">
          ${layoutHtml}
          <div class="certification-footer">
            Official Certified Translation<br/>
            Issued to: ${fullName} | Order Reference: ${orderId}
          </div>
        </div>
      </body>
    </html>
  `;
}