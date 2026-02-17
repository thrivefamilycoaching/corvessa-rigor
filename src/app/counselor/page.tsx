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
  ArrowRight,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnalysisResult } from "@/lib/types";
import type { Activity } from "@/lib/activities";
import Link from "next/link";
import { RigorScorecard } from "@/components/RigorScorecard";
import { CounselorNarrative } from "@/components/CounselorNarrative";
import { RecommendedSchools } from "@/components/RecommendedSchools";
import { GapAnalysis } from "@/components/GapAnalysis";
import { ActivitiesInput } from "@/components/ActivitiesInput";
import { ActivitiesProfile } from "@/components/ActivitiesProfile";
import { HighSchoolSearch, type SelectedSchool } from "@/components/HighSchoolSearch";


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

export default function MySchoolListCounselor() {
  const [schoolProfile, setSchoolProfile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState<File | null>(null);
  const [homeState, setHomeState] = useState("");
  const [selectedSchool, setSelectedSchool] = useState<SelectedSchool | null>(null);
  const [testScores, setTestScores] = useState<TestScores>({
    satReading: "",
    satMath: "",
    actComposite: "",
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [editedNarrative, setEditedNarrative] = useState<string>("");
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
    if ((!schoolProfile && !selectedSchool) || !transcript) return;

    setIsProcessing(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      if (schoolProfile) {
        formData.append("schoolProfile", schoolProfile);
      }
      formData.append("transcript", transcript);

      // Send selected school info for dropdown-based analysis
      if (selectedSchool) {
        formData.append("schoolName", selectedSchool.name);
        formData.append("schoolCity", selectedSchool.city);
        formData.append("schoolState", selectedSchool.state);
      }

      if (homeState) {
        formData.append("homeState", homeState);
      }

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
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Analysis failed");
      }
      const analysisResult = data as AnalysisResult;
      setResult(analysisResult);
      setEditedNarrative(analysisResult.narrative);
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

  const canAnalyze = (schoolProfile || selectedSchool) && transcript && !isProcessing;

  return (
    <div className="min-h-screen bg-warmgray-50">
      {/* Top bar */}
      <div className="bg-teal text-white">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Compass className="h-6 w-6" />
            <span className="font-bold text-xl">My School List</span>
            <span className="text-teal-light text-sm ml-1">— Counselor View</span>
          </div>
          <Link href="/tool" className="inline-flex items-center gap-1 text-sm text-white/80 hover:text-white transition-colors duration-200">
            Parent Portal <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Upload a school profile and student transcript to analyze course rigor,
            discover recommended colleges, and generate a professional counselor narrative.
          </p>
        </div>

        {/* Upload Section */}
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-charcoal">Upload Documents & Enter Scores</h2>

          {/* High School Search */}
          <div className="mb-6">
            <label className="mb-2 block text-sm font-medium">
              Find Student&apos;s High School
            </label>
            <HighSchoolSearch
              onSelect={(school) => {
                setSelectedSchool(school);
                if (school) setHomeState(school.state);
              }}
              disabled={isProcessing}
              initialState={homeState}
            />
          </div>

          {/* Encouragement to upload PDF when school selected from dropdown */}
          {selectedSchool && !schoolProfile && (
            <div className="mb-6 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <Info className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-900 leading-relaxed">
                For the most detailed analysis including course-specific recommendations, upload the school&apos;s profile PDF as well. This is usually available on the school&apos;s website or from the guidance office.
              </p>
            </div>
          )}

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

          {/* Test Scores */}
          <div className="mb-6">
            <label className="mb-1 block text-sm font-medium">
              Test Scores <span className="text-xs text-muted-foreground">(optional)</span>
            </label>
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">SAT R/W</label>
                <input
                  type="number"
                  min={200}
                  max={800}
                  placeholder="200-800"
                  value={testScores.satReading}
                  onChange={(e) => handleScoreChange("satReading", e.target.value)}
                  className="w-full max-w-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground hover:border-primary/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
                  className="w-full max-w-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground hover:border-primary/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
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
                  className="w-full max-w-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground hover:border-primary/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              {getSatTotal() ? (
                <p className="text-xs text-muted-foreground pb-2">
                  SAT Total: <span className="font-semibold text-foreground">{getSatTotal()}</span>
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* School Profile Upload */}
            <Card>
              <CardContent className="pt-6">
                <div
                  {...schoolProfileDropzone.getRootProps()}
                  className={cn(
                    "relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 transition-colors cursor-pointer",
                    schoolProfileDropzone.isDragActive
                      ? "border-primary bg-primary/5"
                      : "border-muted-foreground/25 hover:border-primary/50",
                    isProcessing && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <input {...schoolProfileDropzone.getInputProps()} />
                  {schoolProfile ? (
                    <>
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal/10">
                        <Check className="h-5 w-5 text-teal" />
                      </div>
                      <p className="mt-2 text-sm font-medium">{schoolProfile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(schoolProfile.size / 1024).toFixed(1)} KB
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-1"
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
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <p className="mt-2 text-sm font-medium">
                        School Profile {selectedSchool ? <span className="text-muted-foreground font-normal">(Optional)</span> : null}
                      </p>
                      <p className="mt-1 text-center text-xs text-muted-foreground">
                        Drag & drop or click — PDF only
                      </p>
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
                    "relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 transition-colors cursor-pointer",
                    transcriptDropzone.isDragActive
                      ? "border-primary bg-primary/5"
                      : "border-muted-foreground/25 hover:border-primary/50",
                    isProcessing && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <input {...transcriptDropzone.getInputProps()} />
                  {transcript ? (
                    <>
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal/10">
                        <Check className="h-5 w-5 text-teal" />
                      </div>
                      <p className="mt-2 text-sm font-medium">{transcript.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(transcript.size / 1024).toFixed(1)} KB
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-1"
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
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <p className="mt-2 text-sm font-medium">Student Transcript</p>
                      <p className="mt-1 text-center text-xs text-muted-foreground">
                        Drag & drop or click — PDF only
                      </p>
                    </>
                  )}
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
              className="min-w-[200px] bg-teal hover:bg-teal-dark text-white rounded-lg px-6 py-3 font-semibold shadow-md transition-colors duration-200"
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
          <Card className="mb-8 border-coral bg-coral/10 rounded-lg">
            <CardContent className="flex items-center gap-3 pt-6">
              <AlertCircle className="h-5 w-5 text-coral" />
              <p className="text-coral">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Results Section */}
        {result && (
          <section className="space-y-8">
            {/* Scorecard */}
            <div>
              <h2 className="mb-4 text-lg font-semibold text-charcoal">Rigor Analysis</h2>
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
                <h2 className="mb-4 text-lg font-semibold text-charcoal">Curriculum Comparison</h2>
                <GapAnalysis gapAnalysis={result.gapAnalysis} />
              </div>
            )}

            {/* Activities Profile */}
            {result.activitiesAnalysis && (
              <div>
                <h2 className="mb-4 text-lg font-semibold text-charcoal">Activities & Leadership</h2>
                <ActivitiesProfile analysis={result.activitiesAnalysis} />
              </div>
            )}

            {/* Recommended Schools */}
            {result.recommendedSchools && result.recommendedSchools.length > 0 && (
              <div>
                <h2 className="mb-4 text-lg font-semibold text-charcoal">College Recommendations</h2>
                <RecommendedSchools
                  schools={result.recommendedSchools}
                  transcriptSummary={result.transcriptSummary}
                  schoolProfileSummary={result.schoolProfileSummary}
                  overallScore={result.scorecard.overallScore}
                  schoolCount={schoolCount}
                  homeState={homeState}
                />
              </div>
            )}

            {/* Counselor Narrative */}
            <div>
              <h2 className="mb-4 text-lg font-semibold text-charcoal">Generated Narrative</h2>
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
              <Compass className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <h3 className="text-lg font-medium text-muted-foreground">No analysis yet</h3>
              <p className="max-w-sm text-sm text-muted-foreground/75">
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
              <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-warmgray-200 border-t-teal" />
              <h3 className="text-lg font-medium text-teal">Analyzing documents...</h3>
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
