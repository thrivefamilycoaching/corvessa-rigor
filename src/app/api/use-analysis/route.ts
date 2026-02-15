import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { hmacHash } from "@/lib/encryption";

export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json();

    if (!code) {
      return NextResponse.json({ error: "No code provided" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Fetch current remaining
    const { data, error: fetchError } = await supabase
      .from("access_codes")
      .select("analyses_remaining")
      .eq("code", hmacHash(code.toUpperCase()))
      .single();

    if (fetchError || !data) {
      return NextResponse.json({ error: "Invalid access code" }, { status: 400 });
    }

    if (data.analyses_remaining <= 0) {
      return NextResponse.json({ error: "No analyses remaining" }, { status: 403 });
    }

    // Decrement
    const { error: updateError } = await supabase
      .from("access_codes")
      .update({
        analyses_remaining: data.analyses_remaining - 1,
        last_used_at: new Date().toISOString(),
      })
      .eq("code", hmacHash(code.toUpperCase()));

    if (updateError) {
      console.error("Decrement error:", updateError);
      return NextResponse.json({ error: "Failed to use analysis" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      analyses_remaining: data.analyses_remaining - 1,
    });
  } catch (err) {
    console.error("Use analysis error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
