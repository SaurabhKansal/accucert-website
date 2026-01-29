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
    if (!order) throw new Error('Order not found.');

    // 1. HARD-CLEAN THE STRINGS (Stops the "Failed to parse URL" error)
    const apiUrl = "https://api.x.ai/v1/chat/completions".trim();
    const xaiKey = (process.env.XAI_API_KEY || "").trim();
    const docImage = (order.image_url || "").trim();

    if (!xaiKey) throw new Error("XAI_API_KEY is missing in Vercel settings.");

    // 2. THE MULTIMODAL PAYLOAD
    const grokRes = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${xaiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "grok-vision-beta", // The model dictates that this is a vision task
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Recreate this document exactly in English HTML/Tailwind CSS. 
                Use this text: "${order.extracted_text}". 
                Match the font colors, sizes, and layout. 
                Return ONLY the <div> code. No markdown backticks.`
              },
              {
                type: "image_url",
                image_url: { url: docImage }
              }
            ]
          }
        ],
        temperature: 0.1
      })
    });

    if (!grokRes.ok) {
      const errorMsg = await grokRes.text();
      throw new Error(`Grok Error: ${grokRes.status} - ${errorMsg}`);
    }

    const grokData = await grokRes.json();
    let aiHtml = grokData.choices?.[0]?.message?.content || "";

    // SCRUB ANY MARKDOWN (Prevents blank PDF)
    aiHtml = aiHtml.replace(/```html|```/g, "").trim();

    // 3. GENERATE THE PDF
    const finalHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @page { margin: 0; size: A4; }
            body { margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; }
            .pdf-page { width: 210mm; height: 297mm; position: relative; overflow: hidden; page-break-after: always; }
          </style>
        </head>
        <body>
          <div class="pdf-page" style="padding: 80px; font-family: sans-serif;">
            <h1 style="color: #003461; margin: 0; font-size: 38px;">ACCUCERT</h1>
            <p style="color: #666; font-weight: bold;">Official Certification</p>
            <hr style="border: 2px solid #003461; margin: 30px 0;"/>
            <p style="text-align: right;">Date: ${new Date().toLocaleDateString()}</p>
            <h2>CERTIFICATE OF ACCURACY</h2>
            <p>Certified for: <b>${order.full_name}</b></p>
            <div style="margin-top: 200px; border-top: 1px solid #000; width: 200px;">Signature</div>
          </div>
          <div class="pdf-page" style="padding: 15mm;">
            ${aiHtml}
          </div>
        </body>
      </html>
    `;

    // 4. PRINT AND SEND
    const api2PdfUrl = "https://v2.api2pdf.com/chrome/pdf/html";
    const apiRes = await fetch(api2PdfUrl, {
      method: 'POST',
      headers: { 'Authorization': (process.env.API2PDF_KEY || "").trim(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: finalHtml, inline: false, options: { printBackground: true, waitForNetworkIdle: true } })
    });
    
    const apiData = await apiRes.json();
    const pdfUrl = apiData.FileUrl || apiData.fileUrl;
    const pdfBuffer = await fetch(pdfUrl).then(res => res.arrayBuffer());

    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email,
      subject: `Official Translation: ${order.full_name}`,
      text: `Your translation is attached.`,
      attachments: [{ filename: `Accucert_Translation.pdf`, content: Buffer.from(pdfBuffer) }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}