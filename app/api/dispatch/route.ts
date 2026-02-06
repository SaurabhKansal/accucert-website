import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    // 1. Get data from the Admin Dashboard request
    const { 
      orderId, 
      htmlContent, 
      translatedUrls, 
      userEmail, 
      fullName 
    } = await req.json();
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, 
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 2. Save the Manual Edits back to the database for records
    await supabase
      .from('translations')
      .update({ manual_edits: htmlContent })
      .eq('id', orderId);

    // 3. Prepare Attachments (Handles Multi-Page Comma-Separated URLs)
    const urlArray = translatedUrls.split(',').filter((url: string) => url.trim() !== "");
    
    const attachmentPromises = urlArray.map(async (url: string, index: number) => {
      const fileRes = await fetch(url.trim());
      if (!fileRes.ok) throw new Error(`Failed to fetch page ${index + 1}`);
      const arrayBuffer = await fileRes.arrayBuffer();
      
      return {
        filename: `Accucert_Translation_Page_${index + 1}.jpg`,
        content: Buffer.from(arrayBuffer),
      };
    });

    const attachments = await Promise.all(attachmentPromises);

    // 4. Send the Email via Resend
    const { error: emailError } = await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>', // Change to verified domain in production
      to: userEmail,
      subject: `Official Certified Translation: ${fullName}`,
      html: `
        <div style="font-family: 'Times New Roman', serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 40px;">
          <h2 style="text-transform: uppercase; letter-spacing: 2px; border-bottom: 2px solid #333; padding-bottom: 10px;">Translation Ready</h2>
          <p>Dear ${fullName},</p>
          <p>We are pleased to inform you that your certified English translation is now complete.</p>
          <p><strong>Included in this delivery:</strong></p>
          <ul>
            <li>Digitally reconstructed certified documents (${attachments.length} page/s)</li>
          </ul>
          <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px; color: #666;">
              <em>Note: Please find the attached high-resolution images. You can print these directly for physical submission or save them for digital filing.</em>
            </p>
          </div>
          <p>Thank you for choosing Accucert Global.</p>
          <br/>
          <p>Best regards,<br/><strong>The Accucert Team</strong></p>
        </div>
      `,
      attachments: attachments,
    });

    if (emailError) throw new Error(`Resend Error: ${emailError.message}`);

    // 5. Finalize the Order Status
    await supabase
      .from('translations')
      .update({ status: 'completed' })
      .eq('id', orderId);

    return NextResponse.json({ success: true, message: "Dispatched successfully" });

  } catch (err: any) {
    console.error("DISPATCH_CRITICAL_FAILURE:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}