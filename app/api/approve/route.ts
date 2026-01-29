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
      body: JSON.stringify({ image_url: order.image_url, platform: 'web', framework: 'html' })
    });
    const codiaData = await codiaRes.json();
    const translationDesign = codiaData.data?.html || codiaData.code?.html || order.extracted_text;

    // 2. Build the PDF Document HTML
    const fullHtml = `
      <html>
        <head><style>@page { margin: 0; } body { font-family: sans-serif; margin: 0; padding: 0; }</style></head>
        <body>
          <div style="padding: 70px; height: 1000px; page-break-after: always; border-bottom: 2px solid #003461;">
            <h1 style="color: #003461;">ACCUCERT</h1>
            <p>Date: ${new Date().toLocaleDateString()}</p>
            <hr/>
            <h2>CERTIFICATE OF ACCURACY</h2>
            <p>Accucert hereby certifies the translation for <b>${order.full_name}</b> is accurate.</p>
            <p style="margin-top: 100px;">__________________________<br/>Director of Certification</p>
          </div>
          <div style="width: 100%;">${translationDesign}</div>
        </body>
      </html>
    `;

    // 3. Print via Api2Pdf (Using the most stable v2 endpoint)
    const apiRes = await fetch('https://v2.api2pdf.com/chrome/pdf/html', {
      method: 'POST',
      headers: { 
        'Authorization': process.env.API2PDF_KEY!, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ 
        html: fullHtml, 
        inline: false, 
        fileName: `Accucert_${orderId.slice(0,5)}.pdf` 
      })
    });
    
    const apiData = await apiRes.json();

    // --- CRITICAL FIX: The PDF Link can be in 3 different places ---
    const finalFileUrl = apiData.FileUrl || apiData.fileUrl || apiData.pdf || apiData.url;

    if (!finalFileUrl) {
      console.error("API2PDF FULL RESPONSE:", apiData);
      throw new Error(`Api2Pdf didn't return a link. Message: ${apiData.message || 'No message'}`);
    }

    // 4. Fetch the PDF and Dispatch
    const pdfBuffer = await fetch(finalFileUrl).then(res => res.arrayBuffer());

    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email,
      subject: `Official Certified Translation: ${order.full_name}`,
      html: `<p>Hello ${order.full_name}, please find your official certified translation attached.</p>`,
      attachments: [{ 
        filename: `Accucert_Certified_Doc.pdf`, 
        content: Buffer.from(pdfBuffer) 
      }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("DEBUG_DISPATCH_ERROR:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}