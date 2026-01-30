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

    // 1. GET THE COORDINATES FROM GROK-2-VISION-1212
    const grokRes = await fetch("https://api.x.ai/v1/chat/completions", {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.XAI_API_KEY?.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "grok-2-vision-1212",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: `Analyze this image and return a JSON object ONLY. 
              Find every Spanish text block and map it to an English translation.
              Format: {"blocks": [{"english": "Text", "x": 10, "y": 20, "size": 18, "color": "#000000"}]}
              Important: Return ONLY the JSON. No conversational text.` },
            { type: "image_url", image_url: { url: order.image_url } }
          ]
        }]
      })
    });

    const grokData = await grokRes.json();
    let rawContent = grokData.choices[0].message.content;

    // --- THE "H" ERROR FIX: STRICT JSON EXTRACTION ---
    // This finds the first { and the last } and ignores everything else.
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Grok did not return a valid JSON object.");
    const blueprint = JSON.parse(jsonMatch[0]);

    // 2. STABILITY AI: SEARCH & REPLACE (Inpainting)
    // This removes the Spanish text and fills it with the original paper texture.
    const formData = new FormData();
    formData.append('image', await fetch(order.image_url).then(r => r.blob()));
    formData.append('search_prompt', "Spanish text, handwriting, ink, letters");
    formData.append('prompt', "clean background paper texture, blank document paper");
    formData.append('output_format', 'webp');

    const stabilityRes = await fetch("https://api.stability.ai/v2beta/stable-image/edit/search-and-replace", {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${process.env.STABILITY_API_KEY}`,
        'Accept': 'image/*' 
      },
      body: formData
    });

    if (!stabilityRes.ok) {
        const errText = await stabilityRes.text();
        throw new Error(`Stability AI Error: ${errText}`);
    }
    const cleanImageBuffer = await stabilityRes.arrayBuffer();

    // 3. SHARP: OVERLAY THE TRANSLATION
    // We take the clean "blank" document and draw the English text on top.
    const svgOverlay = `
      <svg width="1000" height="1414" viewBox="0 0 100 141.4">
        ${blueprint.blocks.map((b: any) => `
          <text x="${b.x}" y="${b.y}" font-family="serif" font-size="${b.size / 10}" fill="${b.color || 'black'}">
            ${b.english}
          </text>
        `).join('')}
      </svg>
    `;

    const finalImage = await sharp(Buffer.from(cleanImageBuffer))
      .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
      .jpeg()
      .toBuffer();

    // 4. DISPATCH EMAIL
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email.toString(),
      subject: `Official Certified Translation: ${order.full_name}`,
      html: `<p>Your official translation is attached.</p>`, // Required for Resend SDK
      attachments: [{ 
        filename: `Accucert_Translation.jpg`, 
        content: finalImage 
      }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("CRITICAL_ERROR:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}