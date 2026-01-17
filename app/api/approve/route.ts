export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const orderId = body.orderId || body.requestId;

    if (!orderId) throw new Error('Order ID is missing');

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, 
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Fetch the order details
    const { data: order, error: fetchError } = await supabase
      .from('translations')
      .select('*')
      .eq('id', orderId)
      .single();

    if (fetchError || !order) throw new Error('Order not found in Database');

    // 2. Identify the Image URL (handles potential column name mismatches)
    const imageUrl = order.original_image_url || order.image_url;
    
    let refinedHtml = "";

    // 3. Attempt Codia AI Refinement if a URL exists
    if (imageUrl) {
      try {
        const codiaRes = await fetch('https://api.codia.ai/v1/open/image_to_design', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.CODIA_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            image_url: imageUrl, 
            platform: 'web', 
            framework: 'html' 
          })
        });

        if (codiaRes.ok) {
          const codiaData = await codiaRes.json();
          // Extract HTML from various possible nested structures
          refinedHtml = codiaData.data?.html || codiaData.code?.html || codiaData.html || (codiaData.data?.code?.html);
        } else {
          console.warn(`Codia AI skipped (Status: ${codiaRes.status}). Credits likely exhausted.`);
        }
      } catch (e) {
        console.error("Codia Connection Error:", e);
      }
    }

    // 4. FALLBACK: Use Editor Text if Codia fails or is out of credits
    if (!refinedHtml) {
      refinedHtml = `
        <div style="padding: 50mm; font-family: 'Helvetica', 'Arial', sans-serif; color: #1e293b; background: white;">
          <h1 style="text-align: center; text-transform: uppercase; border-bottom: 2pt solid black; padding-bottom: 10px; margin-bottom: 30px;">
            Certified Translation
          </h1>
          <div style="font-size: 12pt; line-height: 1.8; white-space: pre-wrap;">
            ${order.extracted_text || "No text content available."}
          </div>
        </div>
      `;
    }

    // 5. Return success with the HTML to be printed by the browser
    return NextResponse.json({ 
      success: true, 
      refinedHtml,
      source: refinedHtml.includes('Certified Translation') ? 'fallback' : 'codia'
    });

  } catch (error: any) {
    console.error('API_APPROVE_CRITICAL_ERROR:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}