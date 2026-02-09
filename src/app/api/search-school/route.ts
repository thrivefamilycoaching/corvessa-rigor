import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.COLLEGE_SCORECARD_API_KEY;

const STATE_TO_REGION: Record<string, string> = {
  "MA": "Northeast", "CT": "Northeast", "NY": "Northeast", "RI": "Northeast", "ME": "Northeast", "VT": "Northeast", "NH": "Northeast",
  "VA": "Mid-Atlantic", "DC": "Mid-Atlantic", "MD": "Mid-Atlantic", "PA": "Mid-Atlantic", "DE": "Mid-Atlantic", "NJ": "Mid-Atlantic",
  "TX": "South", "GA": "South", "NC": "South", "FL": "South", "TN": "South", "SC": "South", "AL": "South", "LA": "South",
  "IL": "Midwest", "MI": "Midwest", "OH": "Midwest", "WI": "Midwest", "MN": "Midwest", "IN": "Midwest", "IA": "Midwest", "MO": "Midwest",
  "CA": "West", "OR": "West", "WA": "West", "CO": "West", "AZ": "West", "UT": "West", "NV": "West",
};

function getEnrollmentSize(enrollment: number): string {
  if (enrollment < 2000) return "Micro";
  if (enrollment < 5000) return "Small";
  if (enrollment < 15000) return "Medium";
  if (enrollment < 30000) return "Large";
  return "Mega";
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q");
  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const url = `https://api.data.gov/ed/collegescorecard/v1/schools.json?api_key=${API_KEY}&school.name=${encodeURIComponent(query)}&school.degrees_awarded.predominant=3&school.operating=1&fields=school.name,school.school_url,latest.student.size,latest.admissions.admission_rate.overall,school.state&per_page=10&sort=latest.student.size:desc`;

    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data = await response.json();

    const results = (data.results || []).map((r: any) => {
      const enrollment = r["latest.student.size"] || 0;
      const admitRate = r["latest.admissions.admission_rate.overall"];
      const state = r["school.state"] || "";
      const region = STATE_TO_REGION[state] || "Other";

      let odds = null;
      let type = "match";
      if (admitRate !== null && admitRate !== undefined) {
        odds = Math.round(admitRate * 100);
        if (odds < 30) type = "reach";
        else if (odds >= 80) type = "safety";
        else type = "match";
      }

      return {
        name: r["school.name"] || "",
        url: r["school.school_url"] ? `https://${r["school.school_url"]}` : "",
        type,
        region,
        campusSize: getEnrollmentSize(enrollment),
        enrollment,
        testPolicy: "Check School Website",
        acceptanceProbability: odds,
        matchReasoning: `Located in ${state} (${region}). ${enrollment > 0 ? getEnrollmentSize(enrollment) + " campus with " + enrollment.toLocaleString() + " students." : ""}`,
      };
    }).filter((r: any) => r.name.length > 0);

    return NextResponse.json({ results });
  } catch (error) {
    console.error("[SearchSchool] Error:", error);
    return NextResponse.json({ results: [] });
  }
}
