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

    // 1. PASS 1: GROK - CREATE THE LAYOUT MAP
    const grokRes = await fetch("https://api.x.ai/v1/chat/completions", {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.XAI_API_KEY?.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "grok-2-vision-1212",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: `Analyze this document. Identify every Spanish text block.
              - Provide the professional English translation for each block.
              - Return ONLY a JSON object: {"blocks": [{"text": "English", "x": 10.5, "y": 20.0, "size": 32, "bold": true}]}.
              - Use Percentage coordinates (0-100).` },
            { type: "image_url", image_url: { url: order.image_url } }
          ]
        }],
        temperature: 0
      })
    });

    const grokData = await grokRes.json();
    const jsonMatch = grokData.choices[0].message.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Grok failed to map the document.");
    const blueprint = JSON.parse(jsonMatch[0]);

    // 2. PASS 2: STABILITY AI - THE "CLEAN SLATE" ERASE
    const formData = new FormData();
    formData.append('image', await fetch(order.image_url).then(r => r.blob()));
    formData.append('mask_prompt', "all text, handwriting, and ink characters"); 
    formData.append('output_format', 'png');

    const stabilityRes = await fetch("https://api.stability.ai/v2beta/stable-image/edit/erase", {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.STABILITY_API_KEY}`, 'Accept': 'image/*' },
      body: formData
    });

    if (!stabilityRes.ok) throw new Error("Stability AI failed to clean the image.");
    const cleanImageBuffer = await stabilityRes.arrayBuffer();

    // 3. PASS 3: SHARP - THE PIXEL-PERFECT PRINT
    const metadata = await sharp(Buffer.from(cleanImageBuffer)).metadata();
    const { width = 1000, height = 1414 } = metadata;

    const svgOverlay = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <style>
          .txt { font-family: 'Times New Roman', serif; fill: #1a1a1a; }
        </style>
        ${blueprint.blocks.map((b: any) => `
          <text 
            x="${(b.x * width) / 100}" 
            y="${(b.y * height) / 100}" 
            font-size="${(b.size * width) / 1000}" 
            font-weight="${b.bold ? 'bold' : 'normal'}" 
            class="txt"
          >
            ${b.text}
          </text>
        `).join('')}
      </svg>
    `;

    const finalImage = await sharp(Buffer.from(cleanImageBuffer))
      .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
      .jpeg({ quality: 95 })
      .toBuffer();

    // 4. DISPATCH THE FINAL RESULT
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email.toString(),
      subject: `Official Certified Translation: ${order.full_name}`,
      html: `<p>Your official translation is attached, reconstructed to match the original design.</p>`,
      attachments: [{ filename: `Accucert_Translation.jpg`, content: finalImage }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("PIXEL_RECON_ERROR:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}