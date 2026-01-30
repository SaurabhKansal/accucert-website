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

    // 1. GROK: MAP THE DESIGN (Forced English Translation)
    const grokRes = await fetch("https://api.x.ai/v1/chat/completions", {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.XAI_API_KEY?.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "grok-2-vision-1212",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: `Task: Translate this Spanish document into English.
              - Identify every text block.
              - Provide the English translation.
              - Return ONLY a JSON object: {"blocks": [{"text": "English Translation", "x": 15, "y": 20, "size": 30}]}.
              - Use coordinates (x,y) in percentage (0-100).` },
            { type: "image_url", image_url: { url: order.image_url } }
          ]
        }]
      })
    });

    const grokData = await grokRes.json();
    const jsonMatch = grokData.choices[0].message.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Grok failed to provide a translation map.");
    const blueprint = JSON.parse(jsonMatch[0]);

    // 2. STABILITY AI: ERASE SPANISH
    const formData = new FormData();
    formData.append('image', await fetch(order.image_url).then(r => r.blob()));
    formData.append('mask_prompt', "spanish text, handwriting, ink");
    formData.append('output_format', 'png');

    const stabilityRes = await fetch("https://api.stability.ai/v2beta/stable-image/edit/erase", {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.STABILITY_API_KEY}`, 'Accept': 'image/*' },
      body: formData
    });

    if (!stabilityRes.ok) throw new Error("Stability AI failed to clean the document.");
    const cleanImageBuffer = await stabilityRes.arrayBuffer();

    // 3. SHARP: LAYER THE ENGLISH (The Fix)
    const metadata = await sharp(Buffer.from(cleanImageBuffer)).metadata();
    const width = metadata.width || 1000;
    const height = metadata.height || 1414;

    // We create a very bold SVG to ensure it's visible
    const svgOverlay = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        ${blueprint.blocks.map((b: any) => {
          const xPos = (b.x * width) / 100;
          const yPos = (b.y * height) / 100;
          const fSize = (b.size * width) / 1000;
          return `
            <text x="${xPos}" y="${yPos}" font-family="Arial, sans-serif" font-size="${fSize}" fill="black" font-weight="bold">
              ${b.text}
            </text>
          `;
        }).join('')}
      </svg>
    `;

    // Composite forces the SVG 'on top' of the cleaned image
    const finalImage = await sharp(Buffer.from(cleanImageBuffer))
      .composite([{ 
        input: Buffer.from(svgOverlay), 
        top: 0, 
        left: 0 
      }])
      .jpeg({ quality: 95 })
      .toBuffer();

    // 4. DISPATCH
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email.toString(),
      subject: `Certified Translation: ${order.full_name}`,
      html: `<p>Your official translation is attached as a high-resolution image.</p>`,
      attachments: [{ filename: `Accucert_Translation.jpg`, content: finalImage }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("TRANSLATION_FAILURE:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}