"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { CheckCircle2, Copy, Check } from "lucide-react";

const tierInfo: Record<string, { label: string; analyses: number }> = {
  starter: { label: "Starter", analyses: 3 },
  standard: { label: "Standard", analyses: 10 },
  premium: { label: "Premium", analyses: 25 },
};

function generateCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "MSL-";
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function SuccessContent() {
  const searchParams = useSearchParams();
  const tierKey = (searchParams.get("tier") || "standard").toLowerCase();
  const tier = tierInfo[tierKey] || tierInfo.standard;

  const accessCode = useMemo(() => generateCode(), []);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(accessCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
            <span className="font-semibold text-charcoal">{tier.label}</span>
          </p>
          <p>
            Analyses included:{" "}
            <span className="font-semibold text-charcoal">{tier.analyses}</span>
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
