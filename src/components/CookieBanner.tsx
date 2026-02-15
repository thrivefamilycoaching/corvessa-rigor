"use client";

import { useState, useEffect } from "react";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (document.cookie.includes("msl_cookie_consent=1")) return;
    setVisible(true);
  }, []);

  const dismiss = () => {
    document.cookie = "msl_cookie_consent=1; path=/; max-age=31536000; SameSite=Lax";
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 bg-charcoal/95 text-white px-4 py-3 text-sm backdrop-blur-sm">
      <div className="mx-auto max-w-5xl flex items-center justify-between gap-4 flex-wrap">
        <p className="text-white/90">
          This site uses cookies to improve your experience. By continuing to use this site, you consent to our
          use of cookies.
        </p>
        <button
          onClick={dismiss}
          className="flex-shrink-0 rounded-lg bg-teal px-4 py-1.5 text-sm font-medium text-white hover:bg-teal/90 transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
