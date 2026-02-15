import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

export default function SuccessPage() {
  return (
    <div className="min-h-screen bg-warmgray-50 flex flex-col items-center justify-center px-4 py-16 font-sans text-charcoal">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 md:p-10 text-center">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-teal/10 mb-6">
          <CheckCircle2 className="h-10 w-10 text-teal" />
        </div>

        <h1 className="text-3xl font-bold">Payment Successful!</h1>
        <p className="mt-3 text-muted-foreground">
          Check your email for your access code. It should arrive within a few
          minutes.
        </p>

        <Link
          href="/tool"
          className="mt-8 block w-full bg-teal hover:bg-teal-dark text-white rounded-xl py-4 font-medium text-lg transition-colors"
        >
          Go to Tool &rarr;
        </Link>

        <p className="mt-4 text-xs text-muted-foreground">
          Didn&apos;t receive it? Use the &ldquo;Lost your code?&rdquo; option
          on the tool page.
        </p>
      </div>
    </div>
  );
}
