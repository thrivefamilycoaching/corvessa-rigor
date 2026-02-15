import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 10 attempts per IP per 15 minutes
    const ip = getClientIp(req.headers);
    const { allowed, retryAfterSeconds } = checkRateLimit("validate-code", ip, 10, 15 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json(
        { valid: false, error: "Too many attempts. Try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
      );
    }

    const { code } = await req.json();

    if (!code) {
      return NextResponse.json({ valid: false, error: "No code provided" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("access_codes")
      .select("code, tier, analyses_total, analyses_remaining")
      .eq("code", code.toUpperCase())
      .single();

    if (error || !data) {
      return NextResponse.json({ valid: false, error: "Invalid or expired access code" });
    }

    if (data.analyses_remaining <= 0) {
      return NextResponse.json({
        valid: false,
        error: "You've used all analyses. Purchase more at getmyschoollist.com",
      });
    }

    return NextResponse.json({
      valid: true,
      tier: data.tier,
      analyses_remaining: data.analyses_remaining,
    });
  } catch (err) {
    console.error("Validate code error:", err);
    return NextResponse.json({ valid: false, error: "Internal server error" }, { status: 500 });
  }
}
