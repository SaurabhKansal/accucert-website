import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get('orderId');
  
  try {
    const body = await req.json();
    console.log(`📩 WEBHOOK_PAYLOAD for ${orderId}:`, JSON.stringify(body));

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Per Docs: WaveSpeed sends "status" and "outputs" at the root of the body
    if (body.status === 'completed' && body.outputs?.[0]) {
      const newUrl = body.outputs[0];

      const { data: order } = await supabase.from('translations').select('translated_url').eq('id', orderId).single();
      const existing = order?.translated_url ? order.translated_url.split(',').filter(Boolean) : [];
      
      if (!existing.includes(newUrl)) {
        const updatedUrls = [...existing, newUrl].join(',');
        
        await supabase.from('translations').update({ 
          translated_url: updatedUrls,
          processing_status: 'ready' 
        }).eq('id', orderId);
        
        console.log(`✅ SUCCESS: Order ${orderId} updated.`);
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("❌ WEBHOOK_ERROR:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}