export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: order } = await supabase.from('translations').select('*').eq('id', orderId).single();

    if (!order) throw new Error('Order not found.');

    // 1. Get Design from Codia
    const codiaRes = await fetch('https://api.codia.ai/v1/open/image_to_design', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.CODIA_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        image_url: order.image_url, 
        platform: 'web', 
        framework: 'html' 
      })
    });
    const codiaData = await codiaRes.json();
    const translationHtml = codiaData.data?.html || codiaData.code?.html || order.extracted_text;

    // 2. Build the Document HTML
    const finalHtml = `
      <html>
        <head><style>@page { margin: 0; } body { margin: 0; -webkit-print-color-adjust: exact; }</style></head>
        <body>
          <div style="padding: 60px; height: 1000px; page-break-after: always; border-bottom: 2px solid #003461; font-family: sans-serif;">
            <h1 style="color: #003461;">ACCUCERT</h1>
            <p>Date: ${new Date().toLocaleDateString()}</p>
            <hr/>
            <h2>CERTIFICATE OF ACCURACY</h2>
            <p>This is to certify that the translation for <b>${order.full_name}</b> is accurate.</p>
            <p style="margin-top: 150px;">__________________________<br/>Director of Certification</p>
          </div>
          <div style="width: 100%;">${translationHtml}</div>
        </body>
      </html>
    `;

    // 3. Print via Api2Pdf
    const apiRes = await fetch('https://v2.api2pdf.com/chrome/pdf/html', {
      method: 'POST',
      headers: { 'Authorization': process.env.API2PDF_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: finalHtml, inline: false, options: { printBackground: true } })
    });
    
    const apiData = await apiRes.json();
    const pdfUrl = apiData.FileUrl || apiData.fileUrl || apiData.pdf;

    // 4. Fetch the PDF bytes
    const pdfBuffer = await fetch(pdfUrl).then(res => res.arrayBuffer());

    // 5. DISPATCH (Fixed TypeScript Error)
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email.toString(), // Ensure 'to' is a string
      subject: `Official Certified Translation: ${order.full_name}`,
      text: `Hello ${order.full_name}, your official certified translation is attached.`, // REQUIRED FIELD
      html: `<p>Hello ${order.full_name},</p><p>Please find your official certified translation attached as a PDF.</p>`, // OPTIONAL BUT RECOMMENDED
      attachments: [{ 
        filename: `Accucert_Certified_Doc.pdf`, 
        content: Buffer.from(pdfBuffer) 
      }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}