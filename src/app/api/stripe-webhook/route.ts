import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { Resend } from "resend";
import { getServiceClient } from "@/lib/supabase";
import { hmacHash, encrypt } from "@/lib/encryption";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-01-28.clover",
});

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

const AMOUNT_TO_TIER: Record<number, string> = {
  1900: "starter",
  3900: "standard",
  7900: "premium",
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
          <tr>
            <td style="background-color:#0B7A75;padding:24px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">My School List</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 32px;">
              <h2 style="margin:0 0 8px;color:#2D3142;font-size:24px;font-weight:700;text-align:center;">Thank you for your purchase!</h2>
              <p style="margin:0 0 24px;color:#6b7280;font-size:15px;text-align:center;">Here is your access code to start using the tool.</p>

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
    const rawBody = await req.text();
    const sig = req.headers.get("stripe-signature");

    if (!sig) {
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err) {
      console.error("[stripe-webhook] Signature verification failed:", err);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    if (event.type !== "checkout.session.completed") {
      return NextResponse.json({ received: true });
    }

    const session = event.data.object as Stripe.Checkout.Session;

    // Determine tier
    let tierKey = (session.metadata?.tier || "").toLowerCase();
    if (!TIER_ANALYSES[tierKey] && session.amount_total) {
      tierKey = AMOUNT_TO_TIER[session.amount_total] || "";
    }
    if (!TIER_ANALYSES[tierKey]) {
      console.error("[stripe-webhook] Could not determine tier for session:", session.id);
      return NextResponse.json({ error: "Unknown tier" }, { status: 400 });
    }

    const analysesTotal = TIER_ANALYSES[tierKey];
    const email = session.customer_details?.email || null;
    const stripeSessionId = session.id;

    const supabase = getServiceClient();

    // Idempotency check
    const { data: existing } = await supabase
      .from("access_codes")
      .select("code")
      .eq("stripe_session_id", stripeSessionId)
      .single();

    if (existing) {
      console.log("[stripe-webhook] Already processed session:", stripeSessionId);
      return NextResponse.json({ received: true, code: existing.code });
    }

    // Generate unique code
    let code = generateCode();
    let attempts = 0;

    while (attempts < 5) {
      const { error } = await supabase.from("access_codes").insert({
        code: hmacHash(code),
        tier: tierKey,
        analyses_total: analysesTotal,
        analyses_remaining: analysesTotal,
        customer_email: email ? hmacHash(email.toLowerCase().trim()) : null,
        stripe_session_id: stripeSessionId,
        encrypted_code: encrypt(code),
        encrypted_email: email ? encrypt(email.toLowerCase().trim()) : null,
      });

      if (!error) {
        // Send email if available
        if (email) {
          try {
            const resend = new Resend(process.env.RESEND_API_KEY);
            await resend.emails.send({
              from: "My School List <noreply@getmyschoollist.com>",
              to: email,
              subject: "Your My School List Access Code",
              html: buildEmailHtml(code, TIER_LABELS[tierKey], analysesTotal),
            });
            console.log("[stripe-webhook] Email sent to:", email);
          } catch (emailErr) {
            console.error("[stripe-webhook] Email send failed (code still created):", emailErr);
          }
        }

        console.log("[stripe-webhook] Code created:", code, "tier:", tierKey, "session:", stripeSessionId);
        return NextResponse.json({ received: true });
      }

      if (error.code === "23505") {
        code = generateCode();
        attempts++;
        continue;
      }

      console.error("[stripe-webhook] Supabase insert error:", error);
      return NextResponse.json({ error: "Failed to create code" }, { status: 500 });
    }

    return NextResponse.json({ error: "Failed to generate unique code" }, { status: 500 });
  } catch (err) {
    console.error("[stripe-webhook] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
