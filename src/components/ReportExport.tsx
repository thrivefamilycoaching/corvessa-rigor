"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { jsPDF } from "jspdf";
import type { AnalysisResult } from "@/lib/types";

interface ReportExportProps {
  result: AnalysisResult;
  editedNarrative: string;
  schoolCount?: number;
}

// Brand colors
const TEAL = { r: 13, g: 148, b: 136 }; // #0D9488
const CHARCOAL = { r: 51, g: 51, b: 51 };
const GRAY = { r: 120, g: 120, b: 120 };
const ROW_ALT = { r: 248, g: 250, b: 252 };

export function ReportExport({ result, editedNarrative, schoolCount = 9 }: ReportExportProps) {
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

      const checkPageBreak = (needed: number) => {
        if (yPos + needed > pageHeight - 25) {
          doc.addPage();
          addPageHeader();
          yPos = 28;
        }
      };

      const addWrappedText = (
        text: string,
        fontSize: number,
        options: { bold?: boolean; color?: { r: number; g: number; b: number }; indent?: number; maxWidth?: number } = {}
      ) => {
        const { bold = false, color = CHARCOAL, indent = 0, maxWidth } = options;
        doc.setFontSize(fontSize);
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setTextColor(color.r, color.g, color.b);
        const width = maxWidth || contentWidth - indent;
        const lines = doc.splitTextToSize(text, width);

        for (const line of lines) {
          checkPageBreak(fontSize * 0.45);
          doc.text(line, margin + indent, yPos);
          yPos += fontSize * 0.45;
        }
        yPos += 2;
      };

      const addSectionHeader = (title: string) => {
        checkPageBreak(16);
        yPos += 6;
        doc.setFillColor(TEAL.r, TEAL.g, TEAL.b);
        doc.rect(margin, yPos - 5, contentWidth, 9, "F");
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        doc.text(title, margin + 4, yPos + 1);
        yPos += 10;
      };

      const addDivider = () => {
        yPos += 3;
        doc.setDrawColor(220, 220, 220);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 5;
      };

      const addPageHeader = () => {
        doc.setFillColor(TEAL.r, TEAL.g, TEAL.b);
        doc.rect(0, 0, pageWidth, 14, "F");
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        doc.text("My School List", margin, 9);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.text("College Recommendation Report", pageWidth - margin, 9, { align: "right" });
      };

      // ── Page 1: Cover / Header ──────────────────────────────────
      doc.setFillColor(TEAL.r, TEAL.g, TEAL.b);
      doc.rect(0, 0, pageWidth, 42, "F");

      doc.setFontSize(26);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("My School List", margin, 20);

      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(255, 255, 255);
      doc.text("College Recommendation Report", margin, 30);

      doc.setFontSize(9);
      doc.text(`Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, margin, 38);

      yPos = 52;

      // ── Student Profile Summary ─────────────────────────────────
      addSectionHeader("STUDENT PROFILE");

      // GPA
      if (result.recalculatedGPA) {
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(CHARCOAL.r, CHARCOAL.g, CHARCOAL.b);
        doc.text("Weighted Core GPA:", margin + 2, yPos);
        doc.setFontSize(14);
        doc.setTextColor(TEAL.r, TEAL.g, TEAL.b);
        doc.text(`${result.recalculatedGPA.toFixed(2)} / 4.0`, margin + 48, yPos);
        yPos += 5;
        doc.setFontSize(8);
        doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
        doc.text("Academic Core Only: Math, Science, English, Social Studies, World Languages", margin + 2, yPos);
        yPos += 6;
      }

      // Rigor Score
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(CHARCOAL.r, CHARCOAL.g, CHARCOAL.b);
      doc.text("Course Rigor Score:", margin + 2, yPos);
      doc.setFontSize(14);
      doc.setTextColor(TEAL.r, TEAL.g, TEAL.b);
      doc.text(`${result.scorecard.overallScore} / ${result.scorecard.maxScore}`, margin + 48, yPos);
      yPos += 8;

      // Score breakdown
      for (const score of result.scorecard.scores) {
        checkPageBreak(8);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(CHARCOAL.r, CHARCOAL.g, CHARCOAL.b);
        doc.text(`${score.category}:`, margin + 4, yPos);
        doc.setFont("helvetica", "bold");
        doc.text(`${score.score}/${score.maxScore}`, margin + 50, yPos);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
        doc.text(`— ${score.description}`, margin + 62, yPos);
        yPos += 5;
      }

      addDivider();

      // School Profile Summary
      addWrappedText("School Profile", 10, { bold: true, color: TEAL });
      addWrappedText(result.schoolProfileSummary, 9, { indent: 2 });
      yPos += 2;

      // Transcript Summary
      addWrappedText("Transcript Summary", 10, { bold: true, color: TEAL });
      addWrappedText(result.transcriptSummary, 9, { indent: 2 });

      // ── Activities ──────────────────────────────────────────────
      if (result.activitiesAnalysis) {
        addSectionHeader("ACTIVITIES & LEADERSHIP");

        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(CHARCOAL.r, CHARCOAL.g, CHARCOAL.b);
        doc.text("Leadership Score:", margin + 2, yPos);
        doc.setFontSize(14);
        doc.setTextColor(TEAL.r, TEAL.g, TEAL.b);
        doc.text(`${result.activitiesAnalysis.leadershipScore} / 10`, margin + 48, yPos);
        yPos += 8;

        for (const cat of result.activitiesAnalysis.categories) {
          checkPageBreak(10);
          doc.setFontSize(9);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(CHARCOAL.r, CHARCOAL.g, CHARCOAL.b);
          doc.text(`${cat.name}:`, margin + 4, yPos);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
          const activitiesText = cat.activities.join(", ");
          const lines = doc.splitTextToSize(activitiesText, contentWidth - 50);
          doc.text(lines, margin + 45, yPos);
          yPos += lines.length * 4 + 3;
        }

        if (result.activitiesAnalysis.summary) {
          yPos += 2;
          addWrappedText(result.activitiesAnalysis.summary, 9, { indent: 2, color: GRAY });
        }
      }

      // ── Recommended Schools ─────────────────────────────────────
      if (result.recommendedSchools && result.recommendedSchools.length > 0) {
        addSectionHeader("COLLEGE RECOMMENDATIONS");

        const sizeLabels: Record<string, string> = {
          Micro: "Micro (<2K)",
          Small: "Small (2-5K)",
          Medium: "Medium (5-15K)",
          Large: "Large (15-30K)",
          Mega: "Mega (30K+)",
        };

        const schoolGroups: { label: string; type: string; color: { r: number; g: number; b: number } }[] = [
          { label: "REACH SCHOOLS", type: "reach", color: { r: 239, g: 68, b: 68 } },
          { label: "MATCH SCHOOLS", type: "match", color: TEAL },
          { label: "SAFETY SCHOOLS", type: "safety", color: { r: 34, g: 197, b: 94 } },
        ];

        const perCategory = Math.floor(schoolCount / 3) || 3;

        for (const group of schoolGroups) {
          const schools = result.recommendedSchools.filter(s => s.type === group.type).slice(0, perCategory);
          if (schools.length === 0) continue;

          checkPageBreak(14);
          yPos += 3;
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(group.color.r, group.color.g, group.color.b);
          doc.text(group.label, margin + 2, yPos);
          yPos += 6;

          schools.forEach((school, idx) => {
            checkPageBreak(24);

            // Alternating row background
            if (idx % 2 === 0) {
              doc.setFillColor(ROW_ALT.r, ROW_ALT.g, ROW_ALT.b);
              doc.rect(margin, yPos - 4, contentWidth, 22, "F");
            }

            // School name + odds
            doc.setFontSize(10);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(CHARCOAL.r, CHARCOAL.g, CHARCOAL.b);
            doc.text(school.name, margin + 3, yPos);

            if (school.acceptanceProbability) {
              const prob = Math.max(1, Math.min(95, school.acceptanceProbability));
              doc.setFontSize(10);
              doc.setFont("helvetica", "bold");
              doc.setTextColor(TEAL.r, TEAL.g, TEAL.b);
              doc.text(`${prob}%`, pageWidth - margin - 3, yPos, { align: "right" });
            }

            yPos += 5;

            // Details line
            const sizeLabel = sizeLabels[school.campusSize] || school.campusSize;
            const enrollmentStr = school.enrollment
              ? ` \u2022 ${(school.enrollment / 1000).toFixed(1)}K students`
              : "";
            const ncaaStr = school.ncaaDivision ? ` \u2022 ${school.ncaaDivision}` : "";
            doc.setFontSize(8);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
            doc.text(`${school.region} \u2022 ${sizeLabel}${enrollmentStr}${ncaaStr}`, margin + 3, yPos);
            yPos += 4;

            // Programs line
            if (school.programs && school.programs.length > 0) {
              doc.setFontSize(7);
              doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
              const programsText = school.programs.join(" \u2022 ");
              const progLines = doc.splitTextToSize(programsText, contentWidth - 8);
              for (const line of progLines.slice(0, 1)) {
                doc.text(line, margin + 3, yPos);
                yPos += 3;
              }
            }

            // Match reasoning
            doc.setFontSize(8);
            doc.setTextColor(CHARCOAL.r, CHARCOAL.g, CHARCOAL.b);
            const reasonLines = doc.splitTextToSize(school.matchReasoning, contentWidth - 8);
            for (const line of reasonLines.slice(0, 2)) {
              doc.text(line, margin + 3, yPos);
              yPos += 3.5;
            }
            yPos += 4;
          });
        }
      }

      // ── Curriculum Gap Analysis ─────────────────────────────────
      if (result.gapAnalysis && result.gapAnalysis.length > 0) {
        addSectionHeader("CURRICULUM GAP ANALYSIS");

        for (let i = 0; i < result.gapAnalysis.length; i++) {
          const gap = result.gapAnalysis[i];
          checkPageBreak(20);

          if (i % 2 === 0) {
            doc.setFillColor(ROW_ALT.r, ROW_ALT.g, ROW_ALT.b);
            const estimatedHeight = 16 + (gap.missed.length > 0 ? 5 : 0);
            doc.rect(margin, yPos - 4, contentWidth, estimatedHeight, "F");
          }

          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(CHARCOAL.r, CHARCOAL.g, CHARCOAL.b);
          doc.text(gap.subject, margin + 3, yPos);
          yPos += 5;

          doc.setFontSize(8);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
          doc.text(`Offered: ${gap.offered.join(", ") || "None listed"}`, margin + 5, yPos);
          yPos += 4;
          doc.text(`Taken: ${gap.taken.join(", ") || "None"}`, margin + 5, yPos);
          yPos += 4;
          if (gap.missed.length > 0) {
            doc.setTextColor(239, 68, 68);
            doc.text(`Missed: ${gap.missed.join(", ")}`, margin + 5, yPos);
            yPos += 4;
          }
          yPos += 4;
        }
      }

      // ── Counselor Narrative ─────────────────────────────────────
      if (editedNarrative) {
        addSectionHeader("COUNSELOR NARRATIVE");
        addWrappedText(editedNarrative, 9, { indent: 2 });
      }

      // ── Footer on all pages ─────────────────────────────────────
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);

        // Add page header (skip first page which has the full branded header)
        if (i > 1) {
          addPageHeader();
        }

        // Footer line
        doc.setDrawColor(220, 220, 220);
        doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);

        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
        doc.text(
          "Generated by My School List | getmyschoollist.com",
          margin,
          pageHeight - 9
        );
        doc.text(
          `Page ${i} of ${pageCount}`,
          pageWidth - margin,
          pageHeight - 9,
          { align: "right" }
        );
      }

      doc.save("my-school-list-report.pdf");
    } catch (error) {
      console.error("Failed to generate PDF:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button
      onClick={generatePDF}
      disabled={isGenerating}
      className="bg-teal hover:bg-teal-dark text-white"
    >
      {isGenerating ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Generating PDF...
        </>
      ) : (
        <>
          <Download className="mr-2 h-4 w-4" />
          Download PDF Report
        </>
      )}
    </Button>
  );
}
