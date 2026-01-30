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

    // 1. GROK: GET THE "MAP"
    const grokRes = await fetch("https://api.x.ai/v1/chat/completions", {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.XAI_API_KEY?.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "grok-2-vision-1212",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: `Identify all Spanish text. Return a JSON object ONLY: 
              {"blocks": [{"english": "Translation", "x": 10, "y": 20, "size": 24, "bold": true}]}` },
            { type: "image_url", image_url: { url: order.image_url } }
          ]
        }]
      })
    });

    const grokData = await grokRes.json();
    const jsonMatch = grokData.choices[0].message.content.match(/\{[\s\S]*\}/);
    const blueprint = JSON.parse(jsonMatch[0]);

    // 2. STABILITY AI: USE "ERASE" (NOT Search and Replace)
    // This is the key to removing the 'smudge' effect you see in the image.
    const formData = new FormData();
    formData.append('image', await fetch(order.image_url).then(r => r.blob()));
    formData.append('mask_prompt', "all text, handwriting, and characters"); // Specifically targets the ink
    formData.append('output_format', 'png');

    const stabilityRes = await fetch("https://api.stability.ai/v2beta/stable-image/edit/erase", {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${process.env.STABILITY_API_KEY}`,
        'Accept': 'image/*' 
      },
      body: formData
    });

    if (!stabilityRes.ok) throw new Error("Stability Erase Failed");
    const cleanImageBuffer = await stabilityRes.arrayBuffer();

    // 3. SHARP: PIXEL-PERFECT STAMPING
    const metadata = await sharp(Buffer.from(cleanImageBuffer)).metadata();
    const { width, height } = metadata;

    const svgOverlay = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <style>
          .text { font-family: 'Times New Roman', serif; fill: #2d2d2d; }
        </style>
        ${blueprint.blocks.map((b: any) => `
          <text 
            x="${(b.x * width!) / 100}" 
            y="${(b.y * height!) / 100}" 
            font-size="${(b.size * width!) / 1000}" 
            font-weight="${b.bold ? 'bold' : 'normal'}"
            class="text"
          >
            ${b.english}
          </text>
        `).join('')}
      </svg>
    `;

    const finalImage = await sharp(Buffer.from(cleanImageBuffer))
      .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
      .jpeg({ quality: 90 })
      .toBuffer();

    // 4. DISPATCH
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email.toString(),
      subject: `Official Translation: ${order.full_name}`,
      html: `<p>Your certified translation is ready and perfectly replicated.</p>`,
      attachments: [{ filename: `Accucert_Document.jpg`, content: finalImage }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}