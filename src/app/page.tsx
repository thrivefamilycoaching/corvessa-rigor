"use client";

import { useState } from "react";
import { FileUploader } from "@/components/FileUploader";
import { RigorScorecard } from "@/components/RigorScorecard";
import { CounselorNarrative } from "@/components/CounselorNarrative";
import { RecommendedSchools } from "@/components/RecommendedSchools";
import { GapAnalysis } from "@/components/GapAnalysis";
import { ReportExport } from "@/components/ReportExport";
import { analyzeDocuments } from "@/app/actions/analyze";
import type { AnalysisResult } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Compass } from "lucide-react";

export default function CounselorCoPilot() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [editedNarrative, setEditedNarrative] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const handleFilesReady = async (files: {
    schoolProfile: File | null;
    transcript: File | null;
  }) => {
    if (!files.schoolProfile || !files.transcript) return;

    setIsProcessing(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("schoolProfile", files.schoolProfile);
      formData.append("transcript", files.transcript);

      const analysisResult = await analyzeDocuments(formData);
      setResult(analysisResult);
      setEditedNarrative(analysisResult.narrative);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Compass className="h-10 w-10 text-primary" />
            <h1 className="text-4xl font-bold tracking-tight">Counselor Co-Pilot</h1>
          </div>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Upload a school profile and student transcript to analyze course rigor,
            discover recommended colleges, and generate a professional counselor narrative.
          </p>
        </div>

        {/* File Upload Section */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Upload Documents</h2>
          <FileUploader onFilesReady={handleFilesReady} isProcessing={isProcessing} />
        </section>

        {/* Error Display */}
        {error && (
          <Card className="mb-8 border-destructive">
            <CardContent className="flex items-center gap-3 pt-6">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <p className="text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Results Section */}
        {result && (
          <section className="space-y-8">
            {/* Export Button */}
            <div className="flex justify-end">
              <ReportExport result={result} editedNarrative={editedNarrative} />
            </div>

            {/* Scorecard */}
            <div>
              <h2 className="text-lg font-semibold mb-4">Rigor Analysis</h2>
              <RigorScorecard
                overallScore={result.scorecard.overallScore}
                maxScore={result.scorecard.maxScore}
                scores={result.scorecard.scores}
                schoolSummary={result.schoolProfileSummary}
                transcriptSummary={result.transcriptSummary}
              />
            </div>

            {/* Gap Analysis */}
            {result.gapAnalysis && result.gapAnalysis.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-4">Curriculum Comparison</h2>
                <GapAnalysis gapAnalysis={result.gapAnalysis} />
              </div>
            )}

            {/* Recommended Schools */}
            {result.recommendedSchools && result.recommendedSchools.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-4">College Recommendations</h2>
                <RecommendedSchools
                  schools={result.recommendedSchools}
                  transcriptSummary={result.transcriptSummary}
                  schoolProfileSummary={result.schoolProfileSummary}
                  overallScore={result.scorecard.overallScore}
                />
              </div>
            )}

            {/* Counselor Narrative */}
            <div>
              <h2 className="text-lg font-semibold mb-4">Generated Narrative</h2>
              <CounselorNarrative
                narrative={result.narrative}
                onNarrativeChange={setEditedNarrative}
              />
            </div>
          </section>
        )}

        {/* Empty State */}
        {!result && !error && !isProcessing && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Compass className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground">
                No analysis yet
              </h3>
              <p className="text-sm text-muted-foreground/75 max-w-sm">
                Upload both a School Profile and Student Transcript to generate
                a comprehensive rigor analysis, college recommendations, and counselor narrative.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Processing State */}
        {isProcessing && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-12 w-12 rounded-full border-4 border-muted border-t-primary animate-spin mb-4" />
              <h3 className="text-lg font-medium">Analyzing documents...</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Parsing PDFs, evaluating course rigor, and generating college recommendations.
                This may take a moment.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
