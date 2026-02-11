"use client";

import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import Link from "next/link";
import { CheckCircle2, Copy, Check, AlertCircle, Loader2, Mail } from "lucide-react";

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

  const [email, setEmail] = useState("");
  const [accessCode, setAccessCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleCreateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/create-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: tierKey, email: email.trim().toLowerCase() }),
      });

      if (!res.ok) {
        throw new Error("Failed to create access code");
      }

      const data = await res.json();
      setAccessCode(data.code);
      setEmailSent(data.emailSent);
    } catch {
      setError("Failed to generate access code. Please contact support@getmyschoollist.com");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!accessCode) return;
    await navigator.clipboard.writeText(accessCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Step 1: Collect email
  if (!accessCode) {
    return (
      <div className="min-h-screen bg-warmgray-50 flex flex-col items-center justify-center px-4 py-16 font-sans text-charcoal">
        <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 md:p-10 text-center">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-teal/10 mb-6">
            <CheckCircle2 className="h-10 w-10 text-teal" />
          </div>

          <h1 className="text-3xl font-bold">Payment Successful!</h1>
          <p className="mt-3 text-muted-foreground">
            Enter your email to receive your access code.
          </p>

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

          <form onSubmit={handleCreateCode} className="mt-8">
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="flex-1 rounded-xl border-2 border-warmgray-200 px-4 py-3 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20 transition-colors placeholder:text-warmgray-200"
              />
              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="bg-teal hover:bg-teal-dark disabled:bg-warmgray-200 disabled:text-warmgray-300 disabled:cursor-not-allowed text-white rounded-xl px-5 py-3 font-medium text-sm transition-colors inline-flex items-center gap-2 whitespace-nowrap"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
                Send Code
              </button>
            </div>

            {error && (
              <div className="mt-4 flex items-center gap-2 text-sm text-coral justify-center">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </form>

          <p className="mt-6 text-xs text-muted-foreground">
            We&apos;ll email your access code and display it on the next screen.
          </p>
        </div>
      </div>
    );
  }

  // Step 2: Show code
  return (
    <div className="min-h-screen bg-warmgray-50 flex flex-col items-center justify-center px-4 py-16 font-sans text-charcoal">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 md:p-10 text-center">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-teal/10 mb-6">
          <CheckCircle2 className="h-10 w-10 text-teal" />
        </div>

        <h1 className="text-3xl font-bold">You&apos;re All Set!</h1>

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
          {emailSent && (
            <p className="text-teal font-medium">
              Code sent to {email}
            </p>
          )}
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
