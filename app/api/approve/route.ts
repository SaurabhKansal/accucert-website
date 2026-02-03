export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Aggressive ID extractor to bypass JSON parsing glitches
const extractTaskId = (text: string) => {
  try {
    const match = text.match(/\{[\s\S]*?\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      const id = parsed.id || parsed.task_id || parsed.data?.id || parsed.data?.task_id;
      if (id) return id;
    }
    const rawMatch = text.match(/"(?:id|task_id|request_id)"\s*:\s*"([^"]+)"/);
    if (rawMatch && rawMatch[1]) return rawMatch[1];
    return null;
  } catch (e) {
    return null;
  }
};

export async function POST(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let currentOrderId: string = ""; // Initialize as empty string instead of null

  try {
    const body = await req.json();
    if (!body.orderId) throw new Error("Order ID is missing from request body.");
    
    currentOrderId = body.orderId; // TypeScript now knows this is a string

    const { data: order } = await supabase
      .from('translations')
      .select('*')
      .eq('id', currentOrderId)
      .single();

    if (!order) throw new Error('Order record not found.');

    // 1. Initial UI update
    await supabase.from('translations').update({ 
      processing_status: 'processing',
      processing_percentage: 10 
    }).eq('id', currentOrderId);

    // 2. Prepare Storage Access
    const filePath = order.image_url.includes('/documents/') 
      ? order.image_url.split('/documents/')[1] 
      : order.image_url.split('/').pop(); 

    const { data: signedData } = await supabase.storage
      .from('documents')
      .createSignedUrl(filePath!, 900);

    if (!signedData?.signedUrl) throw new Error("Could not access source file.");

    // 3. Submit to WaveSpeed
    const submitRes = await fetch("https://api.wavespeed.ai/api/v3/wavespeed-ai/image-translator", {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}`,
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        image: signedData.signedUrl,
        target_language: "english",
        output_format: "jpeg"
      })
    });

    const rawText = await submitRes.text();
    const taskId = extractTaskId(rawText);

    if (!taskId) {
      console.error("WAVESPEED_DEBUG_RAW:", rawText);
      throw new Error(`Task initialization failed. Server response: ${rawText.substring(0, 50)}`);
    }

    // 4. Success - Hand off to background polling
    await supabase.from('translations').update({ processing_percentage: 20 }).eq('id', currentOrderId);
    
    pollInBack(taskId, currentOrderId, supabase);

    return NextResponse.json({ success: true, taskId });

  } catch (err: any) {
    console.error("APPROVE_CRITICAL_FAILURE:", err.message);
    
    // Safety check: Only update DB if we actually have an ID to update
    if (currentOrderId !== "") {
      await supabase.from('translations').update({ 
        processing_status: 'failed',
        processing_percentage: 0 
      }).eq('id', currentOrderId);
    }

    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function pollInBack(taskId: string, orderId: string, supabase: any) {
  const maxAttempts = 40; // Increased to 40 for more stability
  for (let i = 1; i <= maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 7000));

    const progress = Math.min(20 + Math.round((i / maxAttempts) * 75), 98);
    await supabase.from('translations').update({ processing_percentage: progress }).eq('id', orderId);

    try {
      const res = await fetch(`https://api.wavespeed.ai/api/v3/predictions/${taskId}/result`, {
        headers: { 'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}` }
      });
      const rawRes = await res.text();
      const match = rawRes.match(/\{[\s\S]*?\}/);
      
      if (match) {
        const result = JSON.parse(match[0]);
        const status = result.status || result.data?.status;
        
        if (status === "completed") {
          const url = result.outputs?.[0] || result.data?.outputs?.[0];
          if (url) {
            await supabase.from('translations').update({ 
              translated_url: url,
              processing_status: 'ready',
              processing_percentage: 100 
            }).eq('id', orderId);
            return;
          }
        }
        
        if (status === "failed") {
          await supabase.from('translations').update({ processing_status: 'failed' }).eq('id', orderId);
          return;
        }
      }
    } catch (e) {
      console.error("Polling blip, retrying...");
    }
  }
}