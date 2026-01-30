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

    // 1. GROK: GET THE DESIGN SPECS & TRANSLATION
    const grokRes = await fetch("https://api.x.ai/v1/chat/completions", {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.XAI_API_KEY?.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "grok-2-vision-1212",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: `Analyze the original Spanish document layout.
              - BACKGROUND: Identify the exact HEX background color of the paper.
              - TRANSLATION: Translate all content to English using this: "${order.extracted_text}".
              - MAPPING: Return ONLY a JSON object: 
                {"bgColor": "#hex", "blocks": [{"text": "English", "x": 10, "y": 20, "size": 30, "bold": true}]}` 
            },
            { type: "image_url", image_url: { url: order.image_url } }
          ]
        }]
      })
    });

    const grokData = await grokRes.json();
    const jsonMatch = grokData.choices[0].message.content.match(/\{[\s\S]*\}/);
    const blueprint = JSON.parse(jsonMatch[0]);

    // 2. DOWNLOAD ORIGINAL (To keep the Border/Seal)
    const originalBuffer = await fetch(order.image_url).then(r => r.arrayBuffer());
    const metadata = await sharp(Buffer.from(originalBuffer)).metadata();
    const { width = 1000, height = 1414 } = metadata;

    // 3. CREATE A CLEAN "PAPER" RECTANGLE 
    // This covers the Spanish text areas but leaves the border and seal visible
    const svgOverlay = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <rect x="${width * 0.08}" y="${height * 0.08}" width="${width * 0.84}" height="${height * 0.75}" fill="${blueprint.bgColor}" />
        
        ${blueprint.blocks.map((b: any) => `
          <text 
            x="${(b.x * width) / 100}" 
            y="${(b.y * height) / 100}" 
            font-family="serif" 
            font-size="${(b.size * width) / 1000}" 
            font-weight="${b.bold ? 'bold' : 'normal'}" 
            fill="#2d2d2d"
          >
            ${b.text}
          </text>
        `).join('')}
      </svg>
    `;

    // 4. MERGE (Sharp puts the clean paper + text OVER the original image)
    const finalImage = await sharp(Buffer.from(originalBuffer))
      .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
      .jpeg({ quality: 95 })
      .toBuffer();

    // 5. DISPATCH
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email.toString(),
      subject: `Official Certified Translation: ${order.full_name}`,
      html: `<p>Your certified English translation is attached.</p>`,
      attachments: [{ filename: `Accucert_Translation.jpg`, content: finalImage }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}