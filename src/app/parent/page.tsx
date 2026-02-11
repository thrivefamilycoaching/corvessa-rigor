"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Compass,
  FileText,
  Upload,
  Check,
  X,
  AlertCircle,
  ClipboardList,
  Shield,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnalysisResult } from "@/lib/types";
import type { Activity } from "@/lib/activities";
import { RigorScorecard } from "@/components/RigorScorecard";
import { RecommendedSchools } from "@/components/RecommendedSchools";
import { GapAnalysis } from "@/components/GapAnalysis";
import { ActivitiesInput } from "@/components/ActivitiesInput";
import { ActivitiesProfile } from "@/components/ActivitiesProfile";

import Link from "next/link";

interface TestScores {
  satReading: string;
  satMath: string;
  actComposite: string;
}

const US_STATES = [
  { value: "", label: "Not specified" },
  { value: "AL", label: "Alabama" }, { value: "AK", label: "Alaska" }, { value: "AZ", label: "Arizona" },
  { value: "AR", label: "Arkansas" }, { value: "CA", label: "California" }, { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" }, { value: "DE", label: "Delaware" }, { value: "DC", label: "District of Columbia" },
  { value: "FL", label: "Florida" }, { value: "GA", label: "Georgia" }, { value: "HI", label: "Hawaii" },
  { value: "ID", label: "Idaho" }, { value: "IL", label: "Illinois" }, { value: "IN", label: "Indiana" },
  { value: "IA", label: "Iowa" }, { value: "KS", label: "Kansas" }, { value: "KY", label: "Kentucky" },
  { value: "LA", label: "Louisiana" }, { value: "ME", label: "Maine" }, { value: "MD", label: "Maryland" },
  { value: "MA", label: "Massachusetts" }, { value: "MI", label: "Michigan" }, { value: "MN", label: "Minnesota" },
  { value: "MS", label: "Mississippi" }, { value: "MO", label: "Missouri" }, { value: "MT", label: "Montana" },
  { value: "NE", label: "Nebraska" }, { value: "NV", label: "Nevada" }, { value: "NH", label: "New Hampshire" },
  { value: "NJ", label: "New Jersey" }, { value: "NM", label: "New Mexico" }, { value: "NY", label: "New York" },
  { value: "NC", label: "North Carolina" }, { value: "ND", label: "North Dakota" }, { value: "OH", label: "Ohio" },
  { value: "OK", label: "Oklahoma" }, { value: "OR", label: "Oregon" }, { value: "PA", label: "Pennsylvania" },
  { value: "RI", label: "Rhode Island" }, { value: "SC", label: "South Carolina" }, { value: "SD", label: "South Dakota" },
  { value: "TN", label: "Tennessee" }, { value: "TX", label: "Texas" }, { value: "UT", label: "Utah" },
  { value: "VT", label: "Vermont" }, { value: "VA", label: "Virginia" }, { value: "WA", label: "Washington" },
  { value: "WV", label: "West Virginia" }, { value: "WI", label: "Wisconsin" }, { value: "WY", label: "Wyoming" },
];

export default function CollegeCoPilot() {
  const [schoolProfile, setSchoolProfile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState<File | null>(null);
  const [homeState, setHomeState] = useState("");
  const [testScores, setTestScores] = useState<TestScores>({
    satReading: "",
    satMath: "",
    actComposite: "",
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualGPA, setManualGPA] = useState("");
  const [schoolCount, setSchoolCount] = useState(9);
  const [activities, setActivities] = useState<Activity[]>([]);

  const onDropSchoolProfile = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles[0]) setSchoolProfile(acceptedFiles[0]);
  }, []);

  const onDropTranscript = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles[0]) setTranscript(acceptedFiles[0]);
  }, []);

  const schoolProfileDropzone = useDropzone({
    onDrop: onDropSchoolProfile,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    disabled: isProcessing,
  });

  const transcriptDropzone = useDropzone({
    onDrop: onDropTranscript,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    disabled: isProcessing,
  });

  const handleAnalyze = async () => {
    if (!schoolProfile || !transcript) return;

    setIsProcessing(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("schoolProfile", schoolProfile);
      formData.append("transcript", transcript);

      // Append home state if provided
      if (homeState) {
        formData.append("homeState", homeState);
      }

      // Append test scores if provided
      if (testScores.satReading) {
        formData.append("satReading", testScores.satReading);
      }
      if (testScores.satMath) {
        formData.append("satMath", testScores.satMath);
      }
      if (testScores.actComposite) {
        formData.append("actComposite", testScores.actComposite);
      }

      if (manualGPA) {
        formData.append("manualGPA", manualGPA);
      }
      formData.append("schoolCount", String(schoolCount));

      if (activities.length > 0) {
        const activitiesText = activities
          .map((a) => `${a.name} — ${a.years} year${a.years > 1 ? "s" : ""} total — ${a.role} for ${a.yearsInRole} year${a.yearsInRole > 1 ? "s" : ""}`)
          .join("; ");
        formData.append("activitiesText", activitiesText);
      }

      const res = await fetch("/api/parse-pdf", { method: "POST", body: formData });
      if (!res.ok) {
        const text = await res.text();
        console.error("API error:", text);
        // Try to parse as JSON for structured error, fall back to raw text
        try {
          const errData = JSON.parse(text);
          throw new Error(errData.error || "Analysis failed");
        } catch (parseErr) {
          if (parseErr instanceof SyntaxError) {
            throw new Error("Analysis failed — server returned an unexpected response");
          }
          throw parseErr;
        }
      }
      const data = await res.json();
      const analysisResult = data as AnalysisResult;
      setResult(analysisResult);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("PDF") || message.includes("parse") || message.includes("module") || message.includes("Document processing")) {
        setError("Document processing failed in the cloud environment. Please try refreshing or ensuring the files are standard PDFs.");
      } else {
        setError(message || "An unexpected error occurred");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleScoreChange = (field: keyof TestScores, value: string) => {
    const numValue = value.replace(/\D/g, "");
    setTestScores((prev) => ({ ...prev, [field]: numValue }));
  };

  const getSatTotal = () => {
    const rw = parseInt(testScores.satReading) || 0;
    const m = parseInt(testScores.satMath) || 0;
    return rw + m > 0 ? rw + m : null;
  };

  const canAnalyze = schoolProfile && transcript && !isProcessing;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-2 flex items-center justify-center gap-3">
            <Compass className="h-10 w-10 text-primary" />
            <h1 className="text-4xl font-bold tracking-tight">College Co-Pilot</h1>
          </div>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Upload the school profile, your child&apos;s transcript, and test scores
            to analyze course rigor and to discover personalized college recommendations.
          </p>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
            <Shield className="h-3 w-3" />
            Private Mode — Your data is never shared
          </div>
          <div className="mt-2">
            <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors">
              View Counselor Dashboard <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* Upload Section */}
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-semibold">Upload Documents & Enter Scores</h2>

          {/* Home State Selector */}
          <div className="mb-6">
            <label className="mb-1 block text-sm font-medium">
              Student Home State <span className="text-xs text-muted-foreground">(for in-state admission boost)</span>
            </label>
            <select
              value={homeState}
              onChange={(e) => setHomeState(e.target.value)}
              className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors hover:border-primary/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {US_STATES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* GPA Override & School Count */}
          <div className="mb-6 flex flex-wrap gap-6">
            <div>
              <label className="mb-1 block text-sm font-medium">
                GPA Override <span className="text-xs text-muted-foreground">(optional — use if tool misreads transcript)</span>
              </label>
              <input
                type="number"
                step={0.01}
                min={0}
                max={4.0}
                placeholder="e.g. 3.45"
                value={manualGPA}
                onChange={(e) => setManualGPA(e.target.value)}
                className="w-full max-w-[180px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground hover:border-primary/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Number of Schools to Display
              </label>
              <select
                value={schoolCount}
                onChange={(e) => setSchoolCount(parseInt(e.target.value))}
                className="w-full max-w-[180px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors hover:border-primary/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value={9}>9 (3/3/3)</option>
                <option value={12}>12 (4/4/4)</option>
                <option value={15}>15 (5/5/5)</option>
                <option value={18}>18 (6/6/6)</option>
              </select>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {/* School Profile Upload */}
            <Card>
              <CardContent className="pt-6">
                <div
                  {...schoolProfileDropzone.getRootProps()}
                  className={cn(
                    "relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors cursor-pointer",
                    schoolProfileDropzone.isDragActive
                      ? "border-primary bg-primary/5"
                      : "border-muted-foreground/25 hover:border-primary/50",
                    isProcessing && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <input {...schoolProfileDropzone.getInputProps()} />
                  {schoolProfile ? (
                    <>
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                        <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
                      </div>
                      <p className="mt-4 text-sm font-medium">{schoolProfile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(schoolProfile.size / 1024).toFixed(1)} KB
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSchoolProfile(null);
                        }}
                        disabled={isProcessing}
                      >
                        <X className="mr-1 h-4 w-4" />
                        Remove
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                        <FileText className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <p className="mt-4 text-sm font-medium">School Profile</p>
                      <p className="mt-1 text-center text-xs text-muted-foreground">
                        Drag & drop or click to upload
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">PDF only</p>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Student Transcript Upload */}
            <Card>
              <CardContent className="pt-6">
                <div
                  {...transcriptDropzone.getRootProps()}
                  className={cn(
                    "relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors cursor-pointer",
                    transcriptDropzone.isDragActive
                      ? "border-primary bg-primary/5"
                      : "border-muted-foreground/25 hover:border-primary/50",
                    isProcessing && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <input {...transcriptDropzone.getInputProps()} />
                  {transcript ? (
                    <>
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                        <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
                      </div>
                      <p className="mt-4 text-sm font-medium">{transcript.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(transcript.size / 1024).toFixed(1)} KB
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTranscript(null);
                        }}
                        disabled={isProcessing}
                      >
                        <X className="mr-1 h-4 w-4" />
                        Remove
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                        <FileText className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <p className="mt-4 text-sm font-medium">Student Transcript</p>
                      <p className="mt-1 text-center text-xs text-muted-foreground">
                        Drag & drop or click to upload
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">PDF only</p>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Test Scores Entry */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <ClipboardList className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="mt-4 text-sm font-medium">Test Scores</p>
                  <p className="mb-4 mt-1 text-center text-xs text-muted-foreground">
                    Optional — for scenario modeling
                  </p>
                </div>
                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">SAT R/W</label>
                      <input
                        type="number"
                        min={200}
                        max={800}
                        placeholder="200-800"
                        value={testScores.satReading}
                        onChange={(e) => handleScoreChange("satReading", e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-center text-sm shadow-sm transition-colors placeholder:text-muted-foreground hover:border-primary/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">SAT Math</label>
                      <input
                        type="number"
                        min={200}
                        max={800}
                        placeholder="200-800"
                        value={testScores.satMath}
                        onChange={(e) => handleScoreChange("satMath", e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-center text-sm shadow-sm transition-colors placeholder:text-muted-foreground hover:border-primary/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">ACT Composite</label>
                    <input
                      type="number"
                      min={1}
                      max={36}
                      placeholder="1-36"
                      value={testScores.actComposite}
                      onChange={(e) => handleScoreChange("actComposite", e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-center text-sm shadow-sm transition-colors placeholder:text-muted-foreground hover:border-primary/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  {getSatTotal() ? (
                    <p className="text-center text-xs text-muted-foreground">
                      SAT Total: <span className="font-semibold text-foreground">{getSatTotal()}</span>
                    </p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Extracurricular Activities */}
          <div className="mt-6">
            <h3 className="mb-1 text-sm font-medium">
              Extracurricular Activities & Leadership
            </h3>
            <p className="mb-3 text-xs text-muted-foreground">
              Optional — add up to 15 activities to boost your profile analysis
            </p>
            <ActivitiesInput
              activities={activities}
              onChange={setActivities}
              disabled={isProcessing}
            />
          </div>

          <div className="mt-6 flex justify-center">
            <Button
              size="lg"
              onClick={handleAnalyze}
              disabled={!canAnalyze}
              className="min-w-[200px]"
            >
              {isProcessing ? (
                <>
                  <Upload className="mr-2 h-4 w-4 animate-pulse" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Analyze Documents
                </>
              )}
            </Button>
          </div>
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
            {/* Scorecard */}
            <div>
              <h2 className="mb-4 text-lg font-semibold">Rigor Analysis</h2>
              <RigorScorecard
                overallScore={result.scorecard.overallScore}
                maxScore={result.scorecard.maxScore}
                scores={result.scorecard.scores}
                schoolSummary={result.schoolProfileSummary}
                transcriptSummary={result.transcriptSummary}
                recalculatedGPA={result.recalculatedGPA}
              />
            </div>

            {/* Gap Analysis */}
            {result.gapAnalysis && result.gapAnalysis.length > 0 && (
              <div>
                <h2 className="mb-4 text-lg font-semibold">Curriculum Comparison</h2>
                <GapAnalysis gapAnalysis={result.gapAnalysis} />
              </div>
            )}

            {/* Activities Profile */}
            {result.activitiesAnalysis && (
              <div>
                <h2 className="mb-4 text-lg font-semibold">Activities & Leadership</h2>
                <ActivitiesProfile analysis={result.activitiesAnalysis} />
              </div>
            )}

            {/* Recommended Schools */}
            {result.recommendedSchools && result.recommendedSchools.length > 0 && (
              <div>
                <h2 className="mb-4 text-lg font-semibold">College Recommendations</h2>
                <RecommendedSchools
                  schools={result.recommendedSchools}
                  transcriptSummary={result.transcriptSummary}
                  schoolProfileSummary={result.schoolProfileSummary}
                  overallScore={result.scorecard.overallScore}
                  schoolCount={schoolCount}
                />
              </div>
            )}
          </section>
        )}

        {/* Empty State */}
        {!result && !error && !isProcessing && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Compass className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <h3 className="text-lg font-medium text-muted-foreground">No analysis yet</h3>
              <p className="max-w-sm text-sm text-muted-foreground/75">
                Upload the school profile and your child&apos;s transcript to generate
                a comprehensive rigor analysis and personalized college recommendations.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Processing State */}
        {isProcessing && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-muted border-t-primary" />
              <h3 className="text-lg font-medium">Analyzing documents...</h3>
              <p className="max-w-sm text-sm text-muted-foreground">
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
