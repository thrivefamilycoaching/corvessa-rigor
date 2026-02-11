"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { jsPDF } from "jspdf";
import type { AnalysisResult } from "@/lib/types";

interface ReportExportProps {
  result: AnalysisResult;
  editedNarrative: string;
}

export function ReportExport({ result, editedNarrative }: ReportExportProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const generatePDF = async () => {
    setIsGenerating(true);

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      const contentWidth = pageWidth - margin * 2;
      let yPos = 20;

      // Helper function to add text with word wrap
      const addWrappedText = (text: string, fontSize: number, isBold = false) => {
        doc.setFontSize(fontSize);
        doc.setFont("helvetica", isBold ? "bold" : "normal");
        const lines = doc.splitTextToSize(text, contentWidth);

        for (const line of lines) {
          if (yPos > 270) {
            doc.addPage();
            yPos = 20;
          }
          doc.text(line, margin, yPos);
          yPos += fontSize * 0.5;
        }
        yPos += 5;
      };

      // Helper to add logo placeholder on each page
      const addLogoPlaceholder = () => {
        const logoX = pageWidth - margin - 30;
        const logoY = 10;
        const logoSize = 25;

        // Draw placeholder box
        doc.setDrawColor(180, 180, 180);
        doc.setFillColor(245, 245, 245);
        doc.roundedRect(logoX, logoY, logoSize, logoSize, 3, 3, "FD");

        // Add "LOGO" text
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(150, 150, 150);
        doc.text("SCHOOL", logoX + logoSize / 2, logoY + 10, { align: "center" });
        doc.text("LOGO", logoX + logoSize / 2, logoY + 16, { align: "center" });

        // Reset text color
        doc.setTextColor(0, 0, 0);
      };

      // Add logo placeholder to first page
      addLogoPlaceholder();

      // Title
      doc.setFontSize(24);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text("My School List", margin, yPos);
      yPos += 10;

      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      doc.text("Course Rigor Analysis Report", margin, yPos);
      yPos += 5;
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, margin, yPos);
      yPos += 15;

      // Horizontal line
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 15;

      // Overall Score
      doc.setTextColor(0, 0, 0);
      addWrappedText("RIGOR SCORECARD", 14, true);
      yPos += 2;

      doc.setFontSize(36);
      doc.setFont("helvetica", "bold");
      const scoreText = `${result.scorecard.overallScore}/${result.scorecard.maxScore}`;
      doc.text(scoreText, margin, yPos);
      yPos += 15;

      // Recalculated Core GPA
      if (result.recalculatedGPA) {
        addWrappedText("RECALCULATED CORE GPA", 12, true);
        doc.setFontSize(28);
        doc.setFont("helvetica", "bold");
        doc.text(`${result.recalculatedGPA.toFixed(2)} / 4.0 (Weighted)`, margin, yPos);
        yPos += 12;
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 100, 100);
        doc.text("Academic Core Only: Math, Science, English, Social Studies, World Languages", margin, yPos);
        doc.setTextColor(0, 0, 0);
        yPos += 10;
      }

      // Score breakdown
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      for (const score of result.scorecard.scores) {
        const scoreLine = `${score.category}: ${score.score}/${score.maxScore} - ${score.description}`;
        addWrappedText(scoreLine, 10);
      }
      yPos += 10;

      // Document Summaries
      addWrappedText("SCHOOL PROFILE SUMMARY", 12, true);
      addWrappedText(result.schoolProfileSummary, 10);
      yPos += 5;

      addWrappedText("TRANSCRIPT SUMMARY", 12, true);
      addWrappedText(result.transcriptSummary, 10);
      yPos += 10;

      // Counselor Narrative
      doc.addPage();
      addLogoPlaceholder();
      yPos = 20;
      addWrappedText("COUNSELOR NARRATIVE", 14, true);
      yPos += 5;
      addWrappedText(editedNarrative, 11);
      yPos += 15;

      // Recommended Schools
      if (result.recommendedSchools && result.recommendedSchools.length > 0) {
        if (yPos > 200) {
          doc.addPage();
          addLogoPlaceholder();
          yPos = 20;
        }
        addWrappedText("RECOMMENDED SCHOOLS", 14, true);
        yPos += 5;

        const reachForPdf = result.recommendedSchools.filter(s => s.type === "reach").slice(0, 3);
        const matchForPdf = result.recommendedSchools.filter(s => s.type === "match").slice(0, 3);
        const safetyForPdf = result.recommendedSchools.filter(s => s.type === "safety").slice(0, 3);
        const pdfSchools = [...reachForPdf, ...matchForPdf, ...safetyForPdf];

        for (const school of pdfSchools) {
          if (yPos > 240) {
            doc.addPage();
            addLogoPlaceholder();
            yPos = 20;
          }
          const typeLabel = school.type.charAt(0).toUpperCase() + school.type.slice(1);
          const probText = school.acceptanceProbability ? ` — ${Math.max(1, Math.min(95, school.acceptanceProbability))}% acceptance likelihood` : "";
          addWrappedText(`${school.name} (${typeLabel})${probText}`, 11, true);

          // Format campus size
          const sizeLabels: Record<string, string> = {
            Micro: "Micro (<2K)",
            Small: "Small (2-5K)",
            Medium: "Medium (5-15K)",
            Large: "Large (15-30K)",
            Mega: "Mega (30K+)",
          };
          const sizeLabel = sizeLabels[school.campusSize] || school.campusSize;
          const enrollmentStr = school.enrollment
            ? ` - ${(school.enrollment / 1000).toFixed(1)}K students`
            : "";
          addWrappedText(`${school.region} | ${sizeLabel}${enrollmentStr}`, 9);
          addWrappedText(school.matchReasoning, 10);
          yPos += 5;
        }
      }

      // Gap Analysis
      if (result.gapAnalysis && result.gapAnalysis.length > 0) {
        doc.addPage();
        addLogoPlaceholder();
        yPos = 20;
        addWrappedText("CURRICULUM GAP ANALYSIS", 14, true);
        yPos += 5;

        for (const gap of result.gapAnalysis) {
          if (yPos > 230) {
            doc.addPage();
            addLogoPlaceholder();
            yPos = 20;
          }
          addWrappedText(gap.subject, 12, true);
          addWrappedText(`Offered: ${gap.offered.join(", ") || "None listed"}`, 10);
          addWrappedText(`Taken: ${gap.taken.join(", ") || "None"}`, 10);
          if (gap.missed.length > 0) {
            addWrappedText(`Missed Opportunities: ${gap.missed.join(", ")}`, 10);
          }
          yPos += 5;
        }
      }

      // Footer on all pages
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(
          `Page ${i} of ${pageCount} | My School List Report`,
          pageWidth / 2,
          285,
          { align: "center" }
        );
      }

      // Save the PDF
      doc.save("my-school-list-report.pdf");
    } catch (error) {
      console.error("Failed to generate PDF:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button onClick={generatePDF} disabled={isGenerating} size="lg">
      {isGenerating ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Generating PDF...
        </>
      ) : (
        <>
          <Download className="mr-2 h-4 w-4" />
          Download Report
        </>
      )}
    </Button>
  );
}
