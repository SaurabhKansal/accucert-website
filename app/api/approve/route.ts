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

    const { data: order, error: dbErr } = await supabase
      .from('translations')
      .select('*')
      .eq('id', orderId)
      .single();

    if (dbErr || !order) throw new Error('Order not found.');

    // 1. CLEAN THE TRANSLATION
    const cleanTranslation = (order.extracted_text || "")
      .replace(/&nbsp;/g, ' ')
      .replace(/<[^>]*>/g, (tag: string) => (tag === '<br>' || tag === '</p>') ? '\n' : '')
      .trim();

    // 2. BUILD THE DYNAMIC TEMPLATE
    // We use 'order.document_type' in the gold border to make it feel "custom"
    const finalHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            @page { margin: 0; size: A4; }
            body { margin: 0; padding: 0; font-family: 'Times New Roman', serif; -webkit-print-color-adjust: exact; }
            
            .page { height: 297mm; width: 210mm; page-break-after: always; box-sizing: border-box; }
            
            /* PAGE 1: OFFICIAL COVER LETTER */
            .letterhead { padding: 80px; background: white; height: 100%; font-family: sans-serif; }
            .blue-line { border-bottom: 3px solid #003461; margin: 25px 0; }
            
            /* PAGE 2: THE DESIGNED TRANSLATION */
            .certificate-page { 
              height: 297mm; width: 210mm; 
              background: #fdfaf5; /* Parchment Color */
              display: flex; justify-content: center; align-items: center;
              box-sizing: border-box; padding: 30px;
            }
            .gold-border {
              width: 100%; height: 100%;
              border: 15px solid #8b6b32;
              outline: 2px solid #8b6b32; outline-offset: -25px;
              padding: 50px; box-sizing: border-box;
              text-align: center; color: #4a3721;
              position: relative;
              display: flex; flex-direction: column;
            }
            .header-text { font-size: 28px; font-weight: bold; text-transform: uppercase; color: #8b6b32; margin-bottom: 5px; }
            .content-area { 
              margin-top: 20px; line-height: 1.6; font-size: 14px; 
              white-space: pre-wrap; text-align: center; 
              flex-grow: 1; overflow: hidden; /* Prevents border breaking */
            }
            .seal { margin-top: 20px; align-self: flex-end; width: 110px; height: 110px; border: 4px double #8b6b32; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: bold; opacity: 0.6; }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="letterhead">
              <h1 style="color: #003461; margin: 0; font-size: 34px;">ACCUCERT</h1>
              <p style="color: #666; margin-top: 5px;">Official Translation Certification</p>
              <div class="blue-line"></div>
              <p style="text-align: right;">Date: ${new Date().toLocaleDateString()}</p>
              <h2 style="margin-top: 50px;">CERTIFICATE OF ACCURACY</h2>
              <p>Accucert hereby certifies that the document titled <b>${order.document_type || 'Official Record'}</b> is a true and accurate translation for <b>${order.full_name}</b>.</p>
              <p style="margin-top: 150px;">__________________________<br/>Director of Certification</p>
            </div>
          </div>

          <div class="page">
            <div class="certificate-page">
              <div class="gold-border">
                <div style="font-size: 18px; letter-spacing: 2px;">ACCUCERT GLOBAL</div>
                <div class="header-text">${(order.document_type || 'Translation').toUpperCase()}</div>
                <div style="font-style: italic; margin-bottom: 20px; border-bottom: 1px solid #d4c4a8; padding-bottom: 10px;">Official English Record</div>
                
                <div class="content-area">${cleanTranslation}</div>
                
                <div class="seal">OFFICIAL<br/>ACCUCERT<br/>SEAL</div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    // 3. PRINT TO PDF
    const apiRes = await fetch('https://v2.api2pdf.com/chrome/pdf/html', {
      method: 'POST',
      headers: { 'Authorization': process.env.API2PDF_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: finalHtml, inline: false, options: { printBackground: true } })
    });
    
    const apiData = await apiRes.json();
    const pdfUrl = apiData.FileUrl || apiData.fileUrl || apiData.pdf;
    if (!pdfUrl) throw new Error("Check Api2Pdf Balance");

    const pdfBuffer = await fetch(pdfUrl).then(res => res.arrayBuffer());

    // 4. DISPATCH
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email.toString(),
      subject: `Official Certified Translation: ${order.full_name}`,
      text: `Hello ${order.full_name}, your official translation is attached.`,
      html: `<p>Hello ${order.full_name}, your official translation is attached as a PDF.</p>`,
      attachments: [{ 
        filename: `Accucert_Certified_Doc.pdf`, 
        content: Buffer.from(pdfBuffer) 
      }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("DISPATCH_ERROR:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}