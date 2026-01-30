export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import sharp from 'sharp';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: order } = await supabase.from('translations').select('*').eq('id', orderId).single();

    if (!order) throw new Error('Order not found.');

    // 1. GROK: GET THE DESIGN BLUEPRINT
    const grokRes = await fetch("https://api.x.ai/v1/chat/completions", {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.XAI_API_KEY?.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "grok-2-vision-1212",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: `Return ONLY JSON. Translate this Spanish document to English. 
              {
                "paperColor": "#hex", 
                "textColor": "#hex",
                "blocks": [{"text": "English Translation", "x": 10, "y": 20, "size": 25, "bold": true}]
              }
              Use percentage (0-100) for x and y.` 
            },
            { type: "image_url", image_url: { url: order.image_url } }
          ]
        }]
      })
    });

    const grokData = await grokRes.json();
    const blueprint = JSON.parse(grokData.choices[0].message.content.match(/\{[\s\S]*\}/)[0]);

    // 2. IMAGE PREP
    const originalBuffer = await fetch(order.image_url).then(r => r.arrayBuffer());
    const metadata = await sharp(Buffer.from(originalBuffer)).metadata();
    const { width = 1000, height = 1414 } = metadata;

    // 3. THE "RECONSTRUCTION" SVG
    // We create a "Clean Layer" that matches the paper color to hide the Spanish.
    const svgOverlay = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <rect x="${width * 0.1}" y="${height * 0.1}" width="${width * 0.8}" height="${height * 0.7}" fill="${blueprint.paperColor}" />
        
        ${blueprint.blocks.map((b: any) => `
          <text x="${(b.x * width) / 100}" y="${(b.y * height) / 100}" 
                font-family="serif" font-size="${(b.size * width) / 1000}" 
                font-weight="${b.bold ? 'bold' : 'normal'}" fill="${blueprint.textColor}">
            ${b.text}
          </text>
        `).join('')}
      </svg>
    `;

    // 4. MERGE (Physical Pixel Flattening)
    const finalImage = await sharp(Buffer.from(originalBuffer))
      .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
      .jpeg({ quality: 90 })
      .toBuffer();

    // 5. DISPATCH
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email.toString(),
      subject: `Official Certified Translation: ${order.full_name}`,
      html: `<p>Your official English translation is ready and attached.</p>`,
      attachments: [{ filename: `Accucert_Translation.jpg`, content: finalImage }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("FINAL_SYSTEM_ERROR:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}