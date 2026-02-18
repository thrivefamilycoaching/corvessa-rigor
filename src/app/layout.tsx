import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { CookieBanner } from "@/components/CookieBanner";

export const maxDuration = 30;

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "My School List — AI-Powered College Recommendations Based on Your Transcript",
  description:
    "Upload your high school transcript and get personalized college recommendations with real admission odds. Safety, match, and reach schools in under a minute. Starting at $19.",
  keywords:
    "college recommendations, college list, admission odds, college admissions tool, AI college counselor, safety match reach schools, transcript analysis, course rigor, college search, personalized college list",
  alternates: {
    canonical: "https://getmyschoollist.com",
  },
  openGraph: {
    title: "My School List — Your Personalized College List in Minutes",
    description:
      "Upload a transcript. Get safety, match, and reach schools with real admission odds. AI-powered college recommendations starting at $19.",
    type: "website",
    url: "https://getmyschoollist.com",
    siteName: "My School List",
  },
  twitter: {
    card: "summary_large_image",
    title: "My School List — Your Personalized College List in Minutes",
    description:
      "Upload a transcript. Get safety, match, and reach schools with real admission odds.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${geistMono.variable} antialiased font-sans`}
        suppressHydrationWarning
      >
        {children}
        <CookieBanner />
      </body>
    </html>
  );
}
