"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { CheckCircle2, Copy, Check, AlertCircle, Loader2 } from "lucide-react";

const tierLabels: Record<string, string> = {
  starter: "Starter",
  standard: "Standard",
  premium: "Premium",
};

const tierAnalyses: Record<string, number> = {
  starter: 3,
  standard: 10,
  premium: 25,
};

function SuccessContent() {
  const searchParams = useSearchParams();
  const tierKey = (searchParams.get("tier") || "standard").toLowerCase();
  const tierLabel = tierLabels[tierKey] || "Standard";
  const analyses = tierAnalyses[tierKey] || 10;

  const [accessCode, setAccessCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function createCode() {
      try {
        const res = await fetch("/api/create-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier: tierKey }),
        });

        if (!res.ok) {
          throw new Error("Failed to create access code");
        }

        const data = await res.json();
        if (!cancelled) {
          setAccessCode(data.code);
        }
      } catch {
        if (!cancelled) {
          setError("Failed to generate access code. Please contact support@getmyschoollist.com");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    createCode();
    return () => { cancelled = true; };
  }, [tierKey]);

  const handleCopy = async () => {
    if (!accessCode) return;
    await navigator.clipboard.writeText(accessCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-warmgray-50 flex flex-col items-center justify-center px-4 py-16 font-sans text-charcoal">
        <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 md:p-10 text-center">
          <Loader2 className="h-12 w-12 text-teal animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Generating your access code...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-warmgray-50 flex flex-col items-center justify-center px-4 py-16 font-sans text-charcoal">
        <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 md:p-10 text-center">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-coral/10 mb-6">
            <AlertCircle className="h-10 w-10 text-coral" />
          </div>
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="mt-4 text-muted-foreground">{error}</p>
          <Link
            href="/"
            className="mt-8 block w-full bg-teal hover:bg-teal-dark text-white rounded-xl py-4 font-medium text-lg transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warmgray-50 flex flex-col items-center justify-center px-4 py-16 font-sans text-charcoal">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 md:p-10 text-center">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-teal/10 mb-6">
          <CheckCircle2 className="h-10 w-10 text-teal" />
        </div>

        <h1 className="text-3xl font-bold">Payment Successful!</h1>

        <div className="mt-8 bg-warmgray-50 rounded-xl p-6">
          <p className="text-sm text-muted-foreground mb-2">Your access code</p>
          <p className="text-3xl font-bold tracking-widest font-mono">
            {accessCode}
          </p>
          <button
            onClick={handleCopy}
            className="mt-4 inline-flex items-center gap-2 bg-teal hover:bg-teal-dark text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy Code
              </>
            )}
          </button>
        </div>

        <div className="mt-6 space-y-2 text-sm text-muted-foreground">
          <p>
            Tier purchased:{" "}
            <span className="font-semibold text-charcoal">{tierLabel}</span>
          </p>
          <p>
            Analyses included:{" "}
            <span className="font-semibold text-charcoal">{analyses}</span>
          </p>
        </div>

        <Link
          href="/tool"
          className="mt-8 block w-full bg-teal hover:bg-teal-dark text-white rounded-xl py-4 font-medium text-lg transition-colors"
        >
          Go to Tool &rarr;
        </Link>

        <p className="mt-4 text-xs text-muted-foreground">
          Save this code &mdash; you&apos;ll need it to access your analyses.
        </p>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-warmgray-50 flex items-center justify-center font-sans text-charcoal">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
