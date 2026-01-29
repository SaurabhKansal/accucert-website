export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, 
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: order } = await supabase.from('translations').select('*').eq('id', orderId).single();
    if (!order) throw new Error('Order not found');

    // 1. SAFETY: Ensure no undefined values
    const safeName = (order.full_name || 'Valued Client').toString();
    const safeDoc = (order.document_type || 'Official Document').toString();
    const safeLangFrom = (order.language_from || 'Source Language').toString();
    const safeLangTo = (order.language_to || 'Target Language').toString();
    const safeId = (orderId || '').toString();

    // 2. GET DESIGN FROM CODIA
    const codiaRes = await fetch('https://api.codia.ai/v1/open/image_to_design', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${process.env.CODIA_API_KEY}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ 
        image_url: order.image_url, 
        platform: 'web', 
        framework: 'html' 
      })
    });
    
    const codiaData = await codiaRes.json();
    // Fallback to extracted_text if Codia fails to return HTML
    const translationHtml = codiaData.data?.html || codiaData.code?.html || order.extracted_text || '';

    // 3. CONSTRUCT THE HTML (Preserves Design + Cert Letter)
    const fullHtmlDocument = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: 'Helvetica', Arial, sans-serif; margin: 0; padding: 0; }
            .letterhead { padding: 60px; min-height: 1000px; page-break-after: always; position: relative; border: 1px solid #eee; }
            .design-content { width: 100%; margin-top: 20px; }
            .line { border-bottom: 2px solid #000; margin: 20px 0; }
            .cert-box { background: #f9f9f9; padding: 25px; border-radius: 8px; margin: 30px 0; border: 1px solid #ddd; }
            h1 { font-size: 32px; letter-spacing: 1px; margin: 0; }
          </style>
        </head>
        <body>
          <div class="letterhead">
            <h1>ACCUCERT</h1>
            <p style="font-style: italic; color: #666; margin-top: 5px;">Official Translation & Legalisation Services</p>
            <div class="line"></div>
            <p style="text-align: right;">Date: ${new Date().toLocaleDateString()}</p>
            
            <h2 style="margin-top: 40px;">CERTIFICATE OF TRANSLATION ACCURACY</h2>
            <p>To Whom It May Concern,</p>
            <p>Accucert Translation Services hereby certifies that the following document is a true, complete, and accurate translation of the original source provided.</p>
            
            <div class="cert-box">
              <strong>Client:</strong> ${safeName}<br>
              <strong>Document Type:</strong> ${safeDoc}<br>
              <strong>Languages:</strong> ${safeLangFrom} to ${safeLangTo}<br>
              <strong>Order Reference:</strong> ${safeId}
            </div>

            <p>I further certify that I am competent in both languages and that this document has been verified for accuracy.</p>
            
            <div style="margin-top: 80px;">
              <div style="border-top: 1px solid #000; width: 220px; padding-top: 10px;">
                <strong>Director of Certification</strong><br>
                Accucert Legal Department
              </div>
            </div>
          </div>

          <div class="design-content">
            ${translationHtml}
          </div>
        </body>
      </html>
    `;

    // 4. CALL API2PDF TO GENERATE FILE
    const api2pdfRes = await fetch('https://v2.api2pdf.com/chrome/html', {
      method: 'POST',
      headers: { 
        'Authorization': process.env.API2PDF_KEY!, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ 
        html: fullHtmlDocument, 
        inline: false, 
        fileName: `Accucert_${safeId.slice(0,8)}.pdf` 
      })
    });

    const pdfData = await api2pdfRes.json();
    if (!pdfData.FileUrl) throw new Error(pdfData.message || 'PDF Generation Failed');

    // Fetch the PDF from the temporary URL provided by Api2Pdf
    const pdfResponse = await fetch(pdfData.FileUrl);
    const pdfBuffer = await pdfResponse.arrayBuffer();

    // 5. DISPATCH EMAIL
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email,
      subject: `Accucert: Your Certified Translation (${safeDoc})`,
      html: `<p>Hello ${safeName},</p><p>Please find your official certified translation attached as a PDF.</p>`,
      attachments: [{
        filename: `Accucert_Certified_Translation.pdf`,
        content: Buffer.from(pdfBuffer),
      }],
    });

    // 6. UPDATE DATABASE
    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('DISPATCH_ERROR:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}