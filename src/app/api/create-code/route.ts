import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getServiceClient } from "@/lib/supabase";

const TIER_ANALYSES: Record<string, number> = {
  starter: 3,
  standard: 10,
  premium: 25,
};

const TIER_LABELS: Record<string, string> = {
  starter: "Starter",
  standard: "Standard",
  premium: "Premium",
};

function generateCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "MSL-";
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function buildEmailHtml(code: string, tierLabel: string, analyses: number): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#F8F6F2;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8F6F2;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background-color:#0B7A75;padding:24px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">My School List</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 32px;">
              <h2 style="margin:0 0 8px;color:#2D3142;font-size:24px;font-weight:700;text-align:center;">Thank you for your purchase!</h2>
              <p style="margin:0 0 24px;color:#6b7280;font-size:15px;text-align:center;">Here is your access code to start using the tool.</p>

              <!-- Code Box -->
              <div style="background-color:#F8F6F2;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px;">
                <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">Your access code</p>
                <p style="margin:0;color:#2D3142;font-size:32px;font-weight:700;font-family:'Courier New',monospace;letter-spacing:4px;">${code}</p>
              </div>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;">Tier purchased:</td>
                  <td style="padding:8px 0;color:#2D3142;font-size:14px;font-weight:600;text-align:right;">${tierLabel}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#6b7280;font-size:14px;">Analyses included:</td>
                  <td style="padding:8px 0;color:#2D3142;font-size:14px;font-weight:600;text-align:right;">${analyses}</td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="https://www.getmyschoollist.com/tool" style="display:inline-block;background-color:#0B7A75;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:16px;font-weight:600;">
                      Go to Tool &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;color:#6b7280;font-size:13px;text-align:center;">
                Save this email for your records. You&rsquo;ll need this code to access your analyses.
              </p>
            </td>
          </tr>
          <!-- Footer -->
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
    const { tier, email } = await req.json();
    const tierKey = (tier || "standard").toLowerCase();
    const analysesTotal = TIER_ANALYSES[tierKey];

    if (!analysesTotal) {
      return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    }

    const supabase = getServiceClient();
    let code = generateCode();
    let attempts = 0;

    // Retry if code collision (unlikely but safe)
    while (attempts < 5) {
      const { error } = await supabase.from("access_codes").insert({
        code,
        tier: tierKey,
        analyses_total: analysesTotal,
        analyses_remaining: analysesTotal,
        customer_email: email || null,
      });

      if (!error) {
        // Send email if provided
        let emailSent = false;
        if (email) {
          try {
            console.log("[create-code] Attempting to send email to:", email);
            console.log("[create-code] RESEND_API_KEY present:", !!process.env.RESEND_API_KEY);
            const resend = new Resend(process.env.RESEND_API_KEY);
            const { data: emailData, error: emailError } = await resend.emails.send({
              from: "My School List <onboarding@resend.dev>",
              to: email,
              subject: "Your My School List Access Code",
              html: buildEmailHtml(code, TIER_LABELS[tierKey], analysesTotal),
            });

            if (emailError) {
              console.error("[create-code] Resend API error:", JSON.stringify(emailError));
            } else {
              console.log("[create-code] Email sent successfully, id:", emailData?.id);
              emailSent = true;
            }
          } catch (emailErr) {
            console.error("[create-code] Resend exception:", emailErr);
          }
        } else {
          console.log("[create-code] No email provided, skipping send");
        }

        return NextResponse.json({ code, tier: tierKey, analyses: analysesTotal, emailSent });
      }

      // If unique constraint violation, regenerate
      if (error.code === "23505") {
        code = generateCode();
        attempts++;
        continue;
      }

      // Other error
      console.error("Supabase insert error:", error);
      return NextResponse.json({ error: "Failed to create access code" }, { status: 500 });
    }

    return NextResponse.json({ error: "Failed to generate unique code" }, { status: 500 });
  } catch (err) {
    console.error("Create code error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
