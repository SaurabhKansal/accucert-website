export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    // 1. Get the Request Data
    const { orderId } = await req.json();
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, 
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 2. Fetch the Order (Fixes: Cannot find name 'order')
    const { data: order, error: dbErr } = await supabase
      .from('translations')
      .select('*')
      .eq('id', orderId)
      .single();

    if (dbErr || !order) throw new Error('Order not found in database.');

    // 3. Clean Translation (Fixes: tag implicitly has 'any' type)
    const cleanText = (order.extracted_text || "")
      .replace(/&nbsp;/g, ' ')
      .replace(/<[^>]*>/g, (tag: string) => (tag === '<br>' || tag === '</p>') ? '\n' : '')
      .trim();

    // 4. Fetch Dynamic Design from Codia (Fixes: Cannot find name 'codiaRes')
    const codiaRes = await fetch('https://api.codia.ai/v1/open/image_to_design', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${process.env.CODIA_API_KEY}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ 
        image_url: order.image_url, 
        platform: 'web', 
        framework: 'html',
        options: { 
          inline_css: true,      // Mimics font colors and sizes directly
          absolute_position: true // Replicates the original layout
        } 
      })
    });
    
    const codiaData = await codiaRes.json();
    const dynamicHtml = codiaData.data?.html || codiaData.code?.html || "";

    // 5. Build the Final Document
    const finalHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            @page { margin: 0; size: A4; }
            body { margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; }
            .letterhead { height: 297mm; padding: 80px; page-break-after: always; box-sizing: border-box; font-family: sans-serif; }
            .mimic-container { width: 210mm; height: 297mm; position: relative; overflow: hidden; }
          </style>
        </head>
        <body>
          <div class="letterhead">
            <h1 style="color: #003461; margin: 0;">ACCUCERT</h1>
            <p>Official Translation Certification</p>
            <hr style="border: 1.5px solid #003461; margin: 25px 0;"/>
            <p style="text-align: right;">Date: ${new Date().toLocaleDateString()}</p>
            <h2>CERTIFICATE OF ACCURACY</h2>
            <p>Certified translation for: <b>${order.full_name}</b></p>
            <p style="margin-top: 150px;">__________________________<br/>Director of Certification</p>
          </div>

          <div class="mimic-container">
            ${dynamicHtml}
            
            <div style="position: absolute; top: 20%; left: 10%; width: 80%; text-align: center; z-index: 99; font-family: inherit;">
               <div style="white-space: pre-wrap; font-size: 16px;">${cleanText}</div>
            </div>
          </div>
        </body>
      </html>
    `;

    // 6. Print to PDF
    const apiRes = await fetch('https://v2.api2pdf.com/chrome/pdf/html', {
      method: 'POST',
      headers: { 'Authorization': process.env.API2PDF_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: finalHtml, inline: false, options: { printBackground: true, waitForNetworkIdle: true } })
    });
    
    const apiData = await apiRes.json();
    const pdfUrl = apiData.FileUrl || apiData.fileUrl || apiData.pdf;

    if (!pdfUrl) throw new Error("PDF Generation Failed. Check Api2Pdf Credits.");

    const pdfBuffer = await fetch(pdfUrl).then(res => res.arrayBuffer());

    // 7. Dispatch Email
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email.toString(),
      subject: `Official Certified Translation: ${order.full_name}`,
      text: `Your translation for ${order.document_type} is attached.`, // Required field
      html: `<p>Hello ${order.full_name}, your official translation is attached.</p>`,
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