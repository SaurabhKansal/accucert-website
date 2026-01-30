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

    // 1. USE GROK TO FIND THE "MASK" AREAS
    // We need to tell Stability AI exactly which areas to erase.
    const grokRes = await fetch("https://api.x.ai/v1/chat/completions", {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.XAI_API_KEY?.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "grok-2-vision-1212",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: `Analyze this image. Find every Spanish word and return a JSON map.
              - PROMPT: "all spanish text and handwriting"
              - BLOCKS: [{"english": "Translation", "x": 10, "y": 20, "w": 30, "h": 5, "size": 24}]` 
            },
            { type: "image_url", image_url: { url: order.image_url } }
          ]
        }]
      })
    });

    const grokData = await grokRes.json();
    const blueprint = JSON.parse(grokData.choices[0].message.content.replace(/```json|```/g, ""));

    // 2. STABILITY AI INPAINTING (The "Magic Eraser")
    // This removes the text while keeping the paper texture perfectly intact.
    const formData = new FormData();
    formData.append('image', await fetch(order.image_url).then(r => r.blob()));
    formData.append('prompt', "remove all text and handwriting, leave only the clean paper texture and background designs");
    formData.append('search_prompt', "text, letters, handwriting, stamps with text");
    formData.append('output_format', 'webp');

    const stabilityRes = await fetch("https://api.stability.ai/v2beta/stable-image/edit/search-and-replace", {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${process.env.STABILITY_API_KEY}`,
        'Accept': 'image/*' 
      },
      body: formData
    });

    if (!stabilityRes.ok) throw new Error("Stability AI failed to clean the image.");
    const cleanImageBuffer = await stabilityRes.arrayBuffer();

    // 3. SHARP: OVERLAY THE ENGLISH
    // Now we take the "Clean" document and stamp the English text onto the blueprint coordinates.
    const svgOverlay = `
      <svg width="1000" height="1414">
        ${blueprint.blocks.map((b: any) => `
          <text x="${b.x}%" y="${b.y + b.h}%" font-family="serif" font-size="${b.size}px" fill="black">
            ${b.english}
          </text>
        `).join('')}
      </svg>
    `;

    const finalImage = await sharp(Buffer.from(cleanImageBuffer))
      .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
      .toBuffer();

    // 4. DISPATCH
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email,
      subject: `Official Certified Translation: ${order.full_name}`,
      html: `<p>Your document has been translated and inpainted into the original design.</p>`,
      attachments: [{ filename: `Accucert_Translation.jpg`, content: finalImage }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}