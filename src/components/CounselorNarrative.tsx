"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Check, Edit3, RotateCcw } from "lucide-react";

interface CounselorNarrativeProps {
  narrative: string;
  onNarrativeChange?: (narrative: string) => void;
}

export function CounselorNarrative({ narrative, onNarrativeChange }: CounselorNarrativeProps) {
  const [copied, setCopied] = useState(false);
  const [editedNarrative, setEditedNarrative] = useState(narrative);
  const [isEdited, setIsEdited] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(editedNarrative);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleChange = (value: string) => {
    setEditedNarrative(value);
    setIsEdited(value !== narrative);
    onNarrativeChange?.(value);
  };

  const handleReset = () => {
    setEditedNarrative(narrative);
    setIsEdited(false);
    onNarrativeChange?.(narrative);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Edit3 className="h-5 w-5" />
            <CardTitle>Counselor Narrative</CardTitle>
            {isEdited && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                Edited
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isEdited && (
              <Button variant="ghost" size="sm" onClick={handleReset}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {copied ? (
                <>
                  <Check className="mr-2 h-4 w-4 text-green-500" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Textarea
          value={editedNarrative}
          onChange={(e) => handleChange(e.target.value)}
          className="min-h-[300px] resize-y font-serif text-sm leading-relaxed"
          placeholder="Counselor narrative will appear here..."
        />
        <p className="mt-2 text-xs text-muted-foreground">
          This narrative is fully editable. Make any adjustments needed before copying or exporting.
        </p>
      </CardContent>
    </Card>
  );
}
