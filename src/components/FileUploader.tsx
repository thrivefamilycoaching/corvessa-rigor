"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, X, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FileUploaderProps {
  onFilesReady: (files: { schoolProfile: File | null; transcript: File | null }) => void;
  isProcessing: boolean;
}

export function FileUploader({ onFilesReady, isProcessing }: FileUploaderProps) {
  const [schoolProfile, setSchoolProfile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState<File | null>(null);

  const onDropSchoolProfile = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles[0]) {
      setSchoolProfile(acceptedFiles[0]);
    }
  }, []);

  const onDropTranscript = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles[0]) {
      setTranscript(acceptedFiles[0]);
    }
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

  const handleAnalyze = () => {
    onFilesReady({ schoolProfile, transcript });
  };

  const canAnalyze = schoolProfile && transcript && !isProcessing;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
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
                    <X className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="mt-4 text-sm font-medium">School Profile</p>
                  <p className="mt-1 text-xs text-muted-foreground text-center">
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
                    <X className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="mt-4 text-sm font-medium">Student Transcript</p>
                  <p className="mt-1 text-xs text-muted-foreground text-center">
                    Drag & drop or click to upload
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">PDF only</p>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-center">
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
    </div>
  );
}
