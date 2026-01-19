import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { runOCR } from "@/lib/ocr"; 
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const runtime = "nodejs";
export const maxDuration = 300; 

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    
    // 1. EXTRACT ALL FIELDS (Original + New)
    const file = formData.get("file") as File | null;
    const userEmail = (formData.get("email") as string | null) || "";
    const fullName = (formData.get("fullName") as string | null) || "";
    const phone = (formData.get("phone") as string | null) || "";
    const address = (formData.get("address") as string | null) || "";
    const serviceLevel = (formData.get("serviceLevel") as string | null) || "standard";
    const urgency = (formData.get("urgency") as string | null) || "normal";

    // New Fields from Client Request
    const languageFrom = (formData.get("languageFrom") as string | null) || "";
    const languageTo = (formData.get("languageTo") as string | null) || "";
    const documentType = (formData.get("documentType") as string | null) || "";
    const needsApostille = formData.get("needsApostille") === "true";
    const needsPhysical = formData.get("needsPhysical") === "true";
    const clientComments = (formData.get("comments") as string | null) || "";

    if (!file || !userEmail || !fullName) {
      return new Response(JSON.stringify({ error: "Missing required information" }), { status: 400 });
    }

    // 2. INITIALIZE CLIENTS
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const resendKey = process.env.RESEND_API_KEY?.trim();

    const supabase = createClient(supabaseUrl!, supabaseKey!);
    const resend = new Resend(resendKey);

    const buffer = Buffer.from(await file.arrayBuffer());

    // 3. UPLOAD TO STORAGE
    const fileName = `${Date.now()}-${file.name}`;
    await supabase.storage
      .from("documents")
      .upload(`uploads/${fileName}`, buffer, { contentType: file.type });

    const { data: { publicUrl } } = supabase.storage
      .from("documents")
      .getPublicUrl(`uploads/${fileName}`);

    // 4. RUN OCR (Kept from your original logic)
    const translatedText = await runOCR(buffer);

    // 5. CALCULATE PRICE (Includes new Apostille fee)
    let amount = 2500; // Base price £25.00
    if (serviceLevel === "certified") amount += 2000;
    if (urgency === "expedited") amount += 1500;
    if (needsApostille) amount += 1500; // Added Apostille Premium

    // 6. CREATE STRIPE SESSION
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: `${documentType || 'Translation'} (${languageFrom} to ${languageTo})`,
              description: `Urgency: ${urgency} ${needsApostille ? '+ Apostille' : ''}`,
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${req.headers.get("origin")}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get("origin")}/`,
      customer_email: userEmail,
    });

    // 7. SAVE TO DB (Including all new fields)
    const { data, error: dbError } = await supabase
      .from("translations")
      .insert([{
        filename: file.name,
        user_email: userEmail,
        full_name: fullName,
        phone: phone,
        postal_address: address,
        service_level: serviceLevel,
        urgency: urgency,
        extracted_text: translatedText,
        status: "pending",
        payment_status: "unpaid",
        stripe_session_id: session.id,
        image_url: publicUrl,
        language_from: languageFrom,      // New field
        language_to: languageTo,          // New field
        document_type: documentType,      // New field
        needs_apostille: needsApostille,  // New field
        needs_physical_copy: needsPhysical, // New field
        client_comments: clientComments,  // New field
        version_history: []
      }])
      .select().single();

    if (dbError) throw dbError;

    // 8. SEND INITIAL EMAIL
    await resend.emails.send({
      from: "Accucert <onboarding@resend.dev>", 
      to: userEmail,
      subject: `Order Created: ${fullName}`,
      html: `<h3>Order Pending Payment</h3><p>Hi ${fullName}, please complete your payment for your <b>${documentType}</b> translation to start the review process.</p>`,
    });

    return new Response(JSON.stringify({ 
      success: true, 
      id: data.id, 
      stripeUrl: session.url 
    }), { status: 200 });

  } catch (err: any) {
    console.error("UPLOAD ERROR:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}