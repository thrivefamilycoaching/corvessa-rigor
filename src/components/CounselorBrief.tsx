"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Loader2 } from "lucide-react";
import { jsPDF } from "jspdf";
import type { AnalysisResult } from "@/lib/types";

interface CounselorBriefProps {
  result: AnalysisResult;
}

// Brand colors
const TEAL = { r: 13, g: 148, b: 136 };
const CHARCOAL = { r: 51, g: 51, b: 51 };
const GRAY = { r: 120, g: 120, b: 120 };
const ROW_ALT = { r: 248, g: 250, b: 252 };

export function CounselorBrief({ result }: CounselorBriefProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const generatePDF = async () => {
    setIsGenerating(true);

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 18;
      const contentWidth = pageWidth - margin * 2;
      let yPos = 0;

      const addWrappedText = (
        text: string,
        fontSize: number,
        options: { bold?: boolean; color?: { r: number; g: number; b: number }; indent?: number } = {}
      ) => {
        const { bold = false, color = CHARCOAL, indent = 0 } = options;
        doc.setFontSize(fontSize);
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setTextColor(color.r, color.g, color.b);
        const lines = doc.splitTextToSize(text, contentWidth - indent);
        for (const line of lines) {
          doc.text(line, margin + indent, yPos);
          yPos += fontSize * 0.42;
        }
        yPos += 1.5;
      };

      // ── Branded Header ──────────────────────────────────────────
      doc.setFillColor(TEAL.r, TEAL.g, TEAL.b);
      doc.rect(0, 0, pageWidth, 30, "F");

      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("My School List", margin, 14);

      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text("Counselor Brief", margin, 23);

      doc.setFontSize(8);
      doc.text(
        new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
        pageWidth - margin,
        23,
        { align: "right" }
      );

      yPos = 38;

      // ── Student Academic Snapshot ───────────────────────────────
      doc.setFillColor(TEAL.r, TEAL.g, TEAL.b);
      doc.rect(margin, yPos - 5, contentWidth, 8, "F");
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("STUDENT ACADEMIC SNAPSHOT", margin + 4, yPos);
      yPos += 8;

      // GPA and Rigor Score side by side
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(CHARCOAL.r, CHARCOAL.g, CHARCOAL.b);

      if (result.recalculatedGPA) {
        doc.text("Weighted Core GPA:", margin + 2, yPos);
        doc.setTextColor(TEAL.r, TEAL.g, TEAL.b);
        doc.setFontSize(12);
        doc.text(`${result.recalculatedGPA.toFixed(2)} / 4.0`, margin + 42, yPos);
      }

      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(CHARCOAL.r, CHARCOAL.g, CHARCOAL.b);
      doc.text("Course Rigor Score:", pageWidth / 2 + 5, yPos);
      doc.setTextColor(TEAL.r, TEAL.g, TEAL.b);
      doc.setFontSize(12);
      doc.text(
        `${result.scorecard.overallScore} / ${result.scorecard.maxScore}`,
        pageWidth / 2 + 47,
        yPos
      );
      yPos += 7;

      // Key extracurriculars
      if (result.activitiesAnalysis) {
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(CHARCOAL.r, CHARCOAL.g, CHARCOAL.b);
        doc.text("Key Activities:", margin + 2, yPos);

        doc.setFont("helvetica", "normal");
        doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
        const allActivities = result.activitiesAnalysis.categories
          .flatMap(c => c.activities)
          .slice(0, 6);
        const activitiesStr = allActivities.join(", ");
        const lines = doc.splitTextToSize(activitiesStr, contentWidth - 35);
        doc.text(lines, margin + 32, yPos);
        yPos += lines.length * 3.5 + 2;

        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(CHARCOAL.r, CHARCOAL.g, CHARCOAL.b);
        doc.text("Leadership Score:", margin + 2, yPos);
        doc.setTextColor(TEAL.r, TEAL.g, TEAL.b);
        doc.text(`${result.activitiesAnalysis.leadershipScore} / 10`, margin + 38, yPos);
        yPos += 6;
      }

      yPos += 2;

      // ── Top 5 Recommended Schools ──────────────────────────────
      doc.setFillColor(TEAL.r, TEAL.g, TEAL.b);
      doc.rect(margin, yPos - 5, contentWidth, 8, "F");
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("TOP 5 RECOMMENDED SCHOOLS", margin + 4, yPos);
      yPos += 8;

      // Pick top 5: 2 match, 2 reach, 1 safety (or best available mix)
      const reach = result.recommendedSchools.filter(s => s.type === "reach");
      const match = result.recommendedSchools.filter(s => s.type === "match");
      const safety = result.recommendedSchools.filter(s => s.type === "safety");
      const top5 = [
        ...match.slice(0, 2),
        ...reach.slice(0, 2),
        ...safety.slice(0, 1),
      ].slice(0, 5);

      top5.forEach((school, idx) => {
        // Alternating background
        if (idx % 2 === 0) {
          doc.setFillColor(ROW_ALT.r, ROW_ALT.g, ROW_ALT.b);
          doc.rect(margin, yPos - 4, contentWidth, 18, "F");
        }

        const typeLabel = school.type.charAt(0).toUpperCase() + school.type.slice(1);
        const typeColors: Record<string, { r: number; g: number; b: number }> = {
          reach: { r: 239, g: 68, b: 68 },
          match: TEAL,
          safety: { r: 34, g: 197, b: 94 },
        };
        const typeColor = typeColors[school.type] || CHARCOAL;

        // School name
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(CHARCOAL.r, CHARCOAL.g, CHARCOAL.b);
        doc.text(school.name, margin + 3, yPos);

        // Type badge + odds
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(typeColor.r, typeColor.g, typeColor.b);
        const oddsText = school.acceptanceProbability
          ? `${typeLabel} \u2022 ${Math.max(1, Math.min(95, school.acceptanceProbability))}% odds`
          : typeLabel;
        doc.text(oddsText, pageWidth - margin - 3, yPos, { align: "right" });
        yPos += 4.5;

        // Rationale (1-2 sentences)
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
        const reasoning = school.matchReasoning.length > 160
          ? school.matchReasoning.slice(0, 157) + "..."
          : school.matchReasoning;
        const reasonLines = doc.splitTextToSize(reasoning, contentWidth - 8);
        for (const line of reasonLines.slice(0, 2)) {
          doc.text(line, margin + 3, yPos);
          yPos += 3.2;
        }
        yPos += 4;
      });

      yPos += 2;

      // ── Suggested Next Steps ───────────────────────────────────
      doc.setFillColor(TEAL.r, TEAL.g, TEAL.b);
      doc.rect(margin, yPos - 5, contentWidth, 8, "F");
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("SUGGESTED NEXT STEPS", margin + 4, yPos);
      yPos += 9;

      const nextSteps = [
        "Review this school list with your counselor and discuss fit based on your student\u2019s academic goals and interests.",
        "Schedule campus visits or attend virtual info sessions for your top match and reach schools.",
        "Identify any curriculum gaps and explore whether additional coursework or summer programs could strengthen your profile.",
        "Begin researching scholarship and financial aid opportunities at each recommended school.",
      ];

      nextSteps.forEach((step, idx) => {
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(TEAL.r, TEAL.g, TEAL.b);
        doc.text(`${idx + 1}.`, margin + 3, yPos);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(CHARCOAL.r, CHARCOAL.g, CHARCOAL.b);
        const lines = doc.splitTextToSize(step, contentWidth - 12);
        for (const line of lines) {
          doc.text(line, margin + 10, yPos);
          yPos += 3.8;
        }
        yPos += 2;
      });

      // ── Footer ─────────────────────────────────────────────────
      doc.setDrawColor(220, 220, 220);
      doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);

      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
      doc.text(
        "Prepared by My School List | getmyschoollist.com",
        margin,
        pageHeight - 9
      );
      doc.text(
        new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
        pageWidth - margin,
        pageHeight - 9,
        { align: "right" }
      );

      doc.save("my-school-list-counselor-brief.pdf");
    } catch (error) {
      console.error("Failed to generate Counselor Brief:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button
      onClick={generatePDF}
      disabled={isGenerating}
      variant="outline"
      className="border-teal text-teal hover:bg-teal hover:text-white"
    >
      {isGenerating ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Generating Brief...
        </>
      ) : (
        <>
          <FileText className="mr-2 h-4 w-4" />
          Download Counselor Brief
        </>
      )}
    </Button>
  );
}
