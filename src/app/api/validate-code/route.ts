import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

const DEMO_CODE = "MSL-DEMO1";

export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json();

    if (!code) {
      return NextResponse.json({ valid: false, error: "No code provided" }, { status: 400 });
    }

    // Demo bypass
    if (code.toUpperCase() === DEMO_CODE) {
      return NextResponse.json({
        valid: true,
        demo: true,
        tier: "demo",
        analyses_remaining: -1,
      });
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
      demo: false,
      tier: data.tier,
      analyses_remaining: data.analyses_remaining,
    });
  } catch (err) {
    console.error("Validate code error:", err);
    return NextResponse.json({ valid: false, error: "Internal server error" }, { status: 500 });
  }
}
