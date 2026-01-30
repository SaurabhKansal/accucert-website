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
            { type: "text", text: `Analyze this document and return a JSON object ONLY. 
              Map Spanish text to English.
              Format: {"blocks": [{"english": "Text", "x": 10, "y": 20, "size": 18, "color": "#000000"}]}
              Important: Coordinates (x,y) must be in PERCENTAGE (0-100).` },
            { type: "image_url", image_url: { url: order.image_url } }
          ]
        }]
      })
    });

    const grokData = await grokRes.json();
    const jsonMatch = grokData.choices[0].message.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Invalid Grok Response");
    const blueprint = JSON.parse(jsonMatch[0]);

    // 2. STABILITY AI: INPAINTING (Erase Spanish)
    const formData = new FormData();
    formData.append('image', await fetch(order.image_url).then(r => r.blob()));
    formData.append('search_prompt', "Spanish text, handwriting, ink");
    formData.append('prompt', "clean blank paper texture");
    formData.append('output_format', 'png'); // PNG is safer for dimensions

    const stabilityRes = await fetch("https://api.stability.ai/v2beta/stable-image/edit/search-and-replace", {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.STABILITY_API_KEY}`, 'Accept': 'image/*' },
      body: formData
    });

    if (!stabilityRes.ok) throw new Error("Stability AI Cleaning Failed");
    const cleanImageBuffer = await stabilityRes.arrayBuffer();

    // 3. SHARP: DYNAMIC DIMENSIONS FIX
    // We get the ACTUAL width and height of the Stability AI output
    const imageMetadata = await sharp(Buffer.from(cleanImageBuffer)).metadata();
    const { width, height } = imageMetadata;

    if (!width || !height) throw new Error("Could not read image dimensions.");

    // Create SVG using the EXACT dimensions of the image
    const svgOverlay = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        ${blueprint.blocks.map((b: any) => {
          // Calculate pixel positions based on percentages from Grok
          const posX = (b.x * width) / 100;
          const posY = (b.y * height) / 100;
          const fontSize = (b.size * width) / 1000; // Relative font scaling
          return `
            <text x="${posX}" y="${posY}" font-family="serif" font-size="${fontSize}" fill="${b.color || 'black'}">
              ${b.english}
            </text>
          `;
        }).join('')}
      </svg>
    `;

    const finalImage = await sharp(Buffer.from(cleanImageBuffer))
      .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
      .jpeg()
      .toBuffer();

    // 4. DISPATCH
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email.toString(),
      subject: `Official Certified Translation: ${order.full_name}`,
      html: `<p>Your official translation has been professionally inpainted.</p>`,
      attachments: [{ filename: `Accucert_Translation.jpg`, content: finalImage }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("DIMENSION_ERROR_FIXED:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}