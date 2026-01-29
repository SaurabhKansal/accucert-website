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

    // 1. SANITIZED GROK CALL
    const grokRes = await fetch("[https://api.x.ai/v1/chat/completions](https://api.x.ai/v1/chat/completions)", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.XAI_API_KEY?.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "grok-vision-beta",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: `Task: Professional Translation & Design Replication.
              CONTENT: "${order.extracted_text}"
              INSTRUCTIONS: Look at the image. Recreate it in English using HTML and Inline CSS.
              MIMIC: Font sizes, line breaks, colors, and layout positioning. 
              OUTPUT: Raw HTML <div> only. NO BACKTICKS (\`\`\`).` 
            },
            { type: "image_url", image_url: { url: order.image_url.trim() } }
          ]
        }]
      })
    });

    const grokData = await grokRes.json();
    let aiHtml = grokData.choices?.[0]?.message?.content || "";

    // 2. SCRUB MARKDOWN (Prevents Blank PDF)
    // If the AI accidentally includes ```html or ```, we strip it out.
    aiHtml = aiHtml.replace(/```html|```/g, "").trim();

    // 3. FULL PAGE WRAPPER
    const finalHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            @page { margin: 0; size: A4; }
            body { margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; font-family: 'Times New Roman', serif; }
            .a4-page { width: 210mm; height: 297mm; page-break-after: always; position: relative; overflow: hidden; }
          </style>
        </head>
        <body>
          <div class="a4-page" style="padding: 80px;">
            <h1 style="color: #003461; margin:0;">ACCUCERT</h1>
            <p>Official Translation Certification</p>
            <hr style="border: 2.5px solid #003461; margin: 30px 0;"/>
            <p style="text-align: right;">Date: ${new Date().toLocaleDateString()}</p>
            <h2>CERTIFICATE OF ACCURACY</h2>
            <p>Accucert certifies the translation for <b>${order.full_name}</b> is accurate.</p>
            <p style="margin-top: 150px;">__________________________<br/>Director of Certification</p>
          </div>
          <div class="a4-page" style="padding: 20mm;">
            ${aiHtml}
          </div>
        </body>
      </html>
    `;

    // 4. GENERATE PDF
    const apiRes = await fetch('[https://v2.api2pdf.com/chrome/pdf/html](https://v2.api2pdf.com/chrome/pdf/html)', {
      method: 'POST',
      headers: { 'Authorization': process.env.API2PDF_KEY!.trim(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        html: finalHtml, 
        inline: false, 
        options: { printBackground: true, waitForNetworkIdle: true } 
      })
    });
    
    const apiData = await apiRes.json();
    const pdfUrl = apiData.FileUrl || apiData.fileUrl;
    const pdfBuffer = await fetch(pdfUrl).then(res => res.arrayBuffer());

    // 5. EMAIL
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email,
      subject: `Official Translation: ${order.full_name}`,
      text: `Your translation for ${order.document_type} is attached.`,
      html: `<p>Hello ${order.full_name}, your official translation is attached.</p>`,
      attachments: [{ filename: `Accucert_Translation.pdf`, content: Buffer.from(pdfBuffer) }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("DISPATCH_ERROR:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}