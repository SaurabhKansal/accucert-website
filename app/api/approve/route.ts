export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();
    
    // 1. SANITIZE SUPABASE & ORDER DATA
    const supabase = createClient(
      (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim(), 
      (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
    );

    const { data: order, error: dbErr } = await supabase
      .from('translations')
      .select('*')
      .eq('id', orderId)
      .single();

    if (dbErr || !order) throw new Error('Order not found in database.');

    // --- DEFENSIVE VARIABLE CLEANING ---
    const xaiKey = (process.env.XAI_API_KEY || "").trim();
    const api2PdfKey = (process.env.API2PDF_KEY || "").trim();
    const imageUrl = (order.image_url || "").trim();

    // 2. CALL GROK-2-VISION-1212 FOR PIXEL-PERFECT MAPPING
    const grokRes = await fetch("https://api.x.ai/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${xaiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "grok-2-vision-1212", 
        messages: [{
          role: "user",
          content: [
            {
              type: "text",
              text: `You are a document replication expert. Analyze the uploaded image.
              - INPUT TEXT: "${order.extracted_text}"
              - TASK: Map each sentence of the Input Text to the coordinates (x,y in %) of the corresponding Spanish text.
              - STYLE: Identify the background color (hex) and font color (hex).
              - OUTPUT: Return ONLY a JSON object:
                { 
                  "bgColor": "#hex", 
                  "elements": [{"text": "English text", "x": 15.5, "y": 20.1, "size": "14px", "color": "#hex", "bold": true}] 
                }`
            },
            { type: "image_url", image_url: { url: imageUrl } }
          ]
        }],
        temperature: 0.1
      })
    });

    if (!grokRes.ok) throw new Error(`Grok API Error: ${grokRes.status}`);

    const grokData = await grokRes.json();
    let aiJson = grokData.choices?.[0]?.message?.content || "";
    aiJson = aiJson.replace(/```json|```/g, "").trim();
    const blueprint = JSON.parse(aiJson);

    // 3. CONSTRUCT THE "PATCHED" PDF HTML
    const finalHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            @page { margin: 0; size: A4; }
            body { margin: 0; padding: 0; background: white; }
            .a4-page { width: 210mm; height: 297mm; position: relative; overflow: hidden; page-break-after: always; }
            .canvas { 
              width: 100%; height: 100%; 
              background-image: url('${imageUrl}');
              background-size: cover; background-position: center;
              position: relative;
            }
            /* This 'mask' hides the original Spanish text by using the doc's background color */
            .mask { 
              position: absolute; 
              background: ${blueprint.bgColor || '#ffffff'}; 
              padding: 2px 4px;
              display: inline-block;
              white-space: nowrap;
              line-height: 1.1;
              transform: translate(-2%, -2%);
            }
          </style>
        </head>
        <body>
          <div class="a4-page" style="padding: 80px; font-family: sans-serif;">
            <h1 style="color: #003461; margin: 0; font-size: 42px;">ACCUCERT</h1>
            <hr style="border: 2px solid #003461; margin: 30px 0;"/>
            <h2>CERTIFICATE OF ACCURACY</h2>
            <p>Certified for: <b>${order.full_name}</b></p>
            <p style="margin-top: 200px;">Authorized Signature: __________________</p>
          </div>

          <div class="a4-page">
            <div class="canvas">
              ${blueprint.elements.map((el: any) => `
                <div class="mask" style="
                  left: ${el.x}%; 
                  top: ${el.y}%; 
                  font-size: ${el.size}; 
                  color: ${el.color}; 
                  font-weight: ${el.bold ? 'bold' : 'normal'};
                  font-family: 'Times New Roman', serif;
                ">
                  ${el.text}
                </div>
              `).join('')}
            </div>
          </div>
        </body>
      </html>
    `;

    // 4. PRINT TO PDF VIA API2PDF
    const apiRes = await fetch("https://v2.api2pdf.com/chrome/pdf/html", {
      method: 'POST',
      headers: { 'Authorization': api2PdfKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        html: finalHtml, 
        inline: false, 
        options: { printBackground: true, waitForNetworkIdle: true } 
      })
    });
    
    const apiData = await apiRes.json();
    const pdfUrl = apiData.FileUrl || apiData.fileUrl;
    if (!pdfUrl) throw new Error("PDF URL failed to generate.");

    const pdfBuffer = await fetch(pdfUrl).then(res => res.arrayBuffer());

    // 5. DISPATCH EMAIL (Fixed TS2345: Added 'html' and cast content)
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email.toString(),
      subject: `Official Certified Translation: ${order.full_name}`,
      html: `<p>Please find your certified translation attached.</p>`, // Required field
      text: `Your certified translation is attached.`,
      attachments: [{ 
        filename: `Accucert_Translation.pdf`, 
        content: Buffer.from(pdfBuffer) 
      }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("FINAL_ERROR:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}