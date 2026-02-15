import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getServiceClient } from "@/lib/supabase";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { hmacHash, decrypt } from "@/lib/encryption";

const TIER_LABELS: Record<string, string> = {
  starter: "Starter",
  standard: "Standard",
  premium: "Premium",
};

function buildEmailHtml(code: string, tierLabel: string, remaining: number): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#F8F6F2;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8F6F2;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background-color:#0B7A75;padding:24px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">My School List</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 32px;">
              <h2 style="margin:0 0 8px;color:#2D3142;font-size:24px;font-weight:700;text-align:center;">Here&rsquo;s your access code</h2>
              <p style="margin:0 0 24px;color:#6b7280;font-size:15px;text-align:center;">You requested your access code be resent. Here it is:</p>

              <div style="background-color:#F8F6F2;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px;">
                <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">Your access code</p>
                <p style="margin:0;color:#2D3142;font-size:32px;font-weight:700;font-family:'Courier New',monospace;letter-spacing:4px;">${code}</p>
              </div>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;">Tier:</td>
                  <td style="padding:8px 0;color:#2D3142;font-size:14px;font-weight:600;text-align:right;">${tierLabel}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;">Analyses remaining:</td>
                  <td style="padding:8px 0;color:#2D3142;font-size:14px;font-weight:600;text-align:right;">${remaining}</td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="https://www.getmyschoollist.com/tool" style="display:inline-block;background-color:#0B7A75;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:16px;font-weight:600;">
                      Go to Tool &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">&copy; 2026 Corvessa Partners LLC. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 3 requests per IP per hour
    const ip = getClientIp(req.headers);
    const { allowed, retryAfterSeconds } = checkRateLimit("resend-code", ip, 3, 60 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
      );
    }

    const { email } = await req.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Look up code by email
    const { data, error: fetchError } = await supabase
      .from("access_codes")
      .select("encrypted_code, tier, analyses_remaining")
      .eq("customer_email", hmacHash(email.toLowerCase().trim()))
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (fetchError || !data) {
      // Generic response to prevent email enumeration
      return NextResponse.json({ success: true });
    }

    // Decrypt the code for the email
    const plaintextCode = decrypt(data.encrypted_code);

    // Send email
    try {
      console.log("[resend-code] Attempting to send email to:", email);
      console.log("[resend-code] RESEND_API_KEY present:", !!process.env.RESEND_API_KEY);
      const resend = new Resend(process.env.RESEND_API_KEY);
      const { data: emailData, error: emailError } = await resend.emails.send({
        from: "My School List <noreply@getmyschoollist.com>",
        to: email.toLowerCase().trim(),
        subject: "Your My School List Access Code",
        html: buildEmailHtml(
          plaintextCode,
          TIER_LABELS[data.tier] || data.tier,
          data.analyses_remaining
        ),
      });

      if (emailError) {
        console.error("[resend-code] Resend API error:", JSON.stringify(emailError));
        return NextResponse.json({ error: "Failed to send email: " + emailError.message }, { status: 500 });
      }
      console.log("[resend-code] Email sent successfully, id:", emailData?.id);
    } catch (emailErr) {
      console.error("[resend-code] Resend exception:", emailErr);
      return NextResponse.json({ error: "Failed to send email. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Resend code error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
