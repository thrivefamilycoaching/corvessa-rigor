import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

const TIER_ANALYSES: Record<string, number> = {
  starter: 3,
  standard: 10,
  premium: 25,
};

function generateCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "MSL-";
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function POST(req: NextRequest) {
  try {
    const { tier } = await req.json();
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
      });

      if (!error) {
        return NextResponse.json({ code, tier: tierKey, analyses: analysesTotal });
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
