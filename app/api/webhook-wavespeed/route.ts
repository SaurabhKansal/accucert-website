import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    // 1. Extract Order ID from the Webhook URL
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get('orderId');
    
    if (!orderId) {
      console.error("📥 WEBHOOK_ERROR: No OrderId provided in URL");
      return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
    }

    const body = await req.json();
    console.log(`📥 WEBHOOK_INCOMING for Order: ${orderId}`);

    // 2. Initialize Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, 
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 3. Extract Data (Handles different WaveSpeed response shapes)
    const status = body.status || body.data?.status;
    const outputs = body.outputs || body.data?.outputs;

    if (status === 'completed' && outputs && outputs.length > 0) {
      const newUrl = outputs[0];

      // 4. Fetch existing URLs to handle Multi-Page PDF appending
      const { data: order } = await supabase
        .from('translations')
        .select('translated_url')
        .eq('id', orderId)
        .single();

      const existingUrls = order?.translated_url 
        ? order.translated_url.split(',').filter((u: string) => u.trim() !== "") 
        : [];
      
      // 5. Check if we already have this URL to prevent duplicates
      if (!existingUrls.includes(newUrl)) {
        const updatedUrls = [...existingUrls, newUrl].join(',');

        // 6. Update Database
        const { error: updateError } = await supabase
          .from('translations')
          .update({ 
            translated_url: updatedUrls,
            processing_status: 'ready' 
          })
          .eq('id', orderId);

        if (updateError) throw updateError;
        console.log(`✅ WEBHOOK_SUCCESS: Order ${orderId} updated with new page.`);
      }
    } else if (status === 'failed') {
      console.error(`❌ WEBHOOK_REPORTED_FAILURE for ${orderId}:`, body.error || "Unknown Error");
      await supabase.from('translations').update({ processing_status: 'failed' }).eq('id', orderId);
    }

    return NextResponse.json({ received: true });

  } catch (err: any) {
    console.error("📥 WEBHOOK_CRITICAL_FAILURE:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}