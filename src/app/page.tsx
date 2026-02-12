"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Upload,
  ListChecks,
  Sparkles,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";

const faqs = [
  {
    q: "What documents do I need?",
    a: "Your high school\u2019s school profile (PDF) and your student\u2019s transcript (PDF). Test scores are optional but improve accuracy.",
  },
  {
    q: "How accurate are the admission odds?",
    a: "Our odds are based on College Scorecard data, adjusted for your student\u2019s GPA, test scores, course rigor, and extracurriculars. They\u2019re estimates, not guarantees \u2014 similar to what a college counselor would provide.",
  },
  {
    q: "Can I run multiple analyses?",
    a: "Yes \u2014 each plan includes multiple analyses. Adjust scores, add activities, and re-run as many times as your plan allows.",
  },
  {
    q: "Is my data secure?",
    a: "Your documents are processed securely and are never stored or shared. We don\u2019t keep copies of transcripts or school profiles.",
  },
  {
    q: "Do you replace a college counselor?",
    a: "No \u2014 we complement your counselor\u2019s advice with data-driven insights. Think of this as a second opinion backed by admissions data.",
  },
  {
    q: "What schools are in the database?",
    a: "Over 500 colleges and universities, from small liberal arts colleges to large state universities, across all regions of the US. Don\u2019t see a school you\u2019re looking for? Let us know at peter@corvessapartners.com and we\u2019ll add it.",
  },
];

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen font-sans text-charcoal">
      {/* SECTION 1 — HERO */}
      <section className="min-h-screen bg-warmgray-50 flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto w-full">
          <span className="text-2xl font-bold text-teal">My School List</span>
          <Link
            href="/tool"
            className="bg-teal text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-teal-dark transition-colors"
          >
            Get Started
          </Link>
        </header>

        {/* Hero Content */}
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4 pb-16">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold max-w-4xl leading-tight">
            Your Child&apos;s Personalized College List in Minutes
          </h1>
          <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl">
            Upload a transcript, add test scores and activities, and get a
            personalized list of safety, match, and reach schools &mdash; backed
            by real admissions data.
          </p>
          <p className="mt-6 text-xl md:text-2xl font-semibold max-w-3xl">
            Find the right colleges for your kid &mdash; with real admission odds based on their actual transcript.
          </p>
          <Link
            href="/tool"
            className="mt-8 inline-block bg-teal hover:bg-teal-dark text-white text-lg px-8 py-4 rounded-xl shadow-lg transition-colors font-medium"
          >
            Build Your School List &rarr;
          </Link>

        </div>
      </section>

      {/* SECTION 2 — HOW IT WORKS */}
      <section className="bg-white py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            How It Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: <Upload className="h-8 w-8 text-teal" />,
                title: "Upload Documents",
                desc: "Add your school\u2019s profile and student transcript as PDFs. Optionally add SAT/ACT scores.",
              },
              {
                icon: <ListChecks className="h-8 w-8 text-teal" />,
                title: "Add Activities",
                desc: "Select extracurriculars and leadership roles from our database of 100+ activities.",
              },
              {
                icon: <Sparkles className="h-8 w-8 text-teal" />,
                title: "Get Your List",
                desc: "Receive a personalized list of safety, match, and reach schools with admission odds for each.",
              },
            ].map((card) => (
              <div
                key={card.title}
                className="bg-warmgray-50 rounded-xl p-8 shadow-sm text-center"
              >
                <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-teal/10 mb-5">
                  {card.icon}
                </div>
                <h3 className="text-xl font-semibold mb-2">{card.title}</h3>
                <p className="text-muted-foreground">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 3 — WHAT YOU GET */}
      <section className="bg-warmgray-50 py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            What&apos;s In Your Report
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {[
              {
                title: "Personalized School Recommendations",
                desc: "Safety, match, and reach schools tailored to your student\u2019s GPA, test scores, and course rigor.",
              },
              {
                title: "Admission Odds",
                desc: "See your estimated chances at each school, from <10% to 95%+.",
              },
              {
                title: "Curriculum Gap Analysis",
                desc: "Identify missed opportunities in course rigor across math, science, English, history, languages, and arts.",
              },
              {
                title: "Activities & Leadership Profile",
                desc: "See how extracurriculars and leadership roles strengthen your student\u2019s profile.",
              },
              {
                title: "In-State Advantage Detection",
                desc: "Public university odds automatically adjust based on your home state residency.",
              },
              {
                title: "Filters & Search",
                desc: "Filter results by region, campus size, and school type. Search any school by name.",
              },
            ].map((item) => (
              <div key={item.title} className="flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-teal flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-lg">{item.title}</h3>
                  <p className="text-muted-foreground mt-1">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 4 — TESTIMONIALS */}
      <section className="bg-white py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            What Parents Are Saying
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                quote:
                  "I uploaded my daughter\u2019s transcript and within minutes had a personalized list of schools I hadn\u2019t even considered. The admission odds gave us a realistic picture of where she stands \u2014 it completely changed how we\u2019re approaching her college search.",
                author: "Peter, Potomac School Parent",
              },
              {
                quote:
                  "We\u2019re just starting the process of looking at colleges for our sophomore daughter. This tool narrowed it down fast and let us search any school to see her chances. It\u2019s like having a college counselor on demand.",
                author: "Leah, Langley School Parent",
              },
              {
                quote:
                  "Our oldest is only in 7th grade, but we wanted to get ahead of the college conversation early. Running an analysis gave us a sense of what to focus on now so there are no surprises later. Wish this existed when I was applying to schools.",
                author: "Matt, Falls Church, VA",
              },
            ].map((item) => (
              <div
                key={item.author}
                className="bg-warmgray-50 rounded-xl p-8"
              >
                <p className="italic text-muted-foreground leading-relaxed">
                  &ldquo;{item.quote}&rdquo;
                </p>
                <p className="mt-4 text-sm font-medium text-charcoal">
                  &mdash; {item.author}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 5 — PRICING */}
      <section id="pricing" className="bg-warmgray-50 py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            Simple Pricing
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            {/* Starter */}
            <div className="bg-white rounded-2xl shadow-sm border border-warmgray-200 p-8 text-center">
              <p className="text-sm font-semibold text-teal uppercase tracking-wide">
                Starter
              </p>
              <p className="mt-4 text-5xl font-bold">$19</p>
              <p className="mt-1 text-muted-foreground">one-time payment</p>
              <ul className="mt-8 space-y-3 text-left">
                {[
                  "3 analyses",
                  "Personalized school recommendations with admission odds",
                  "Live links to school websites",
                  "Search any school for individual admission chances",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-teal flex-shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <a
                href="https://buy.stripe.com/28E6oJ3Vy07s9Go08Lasg00"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-8 block w-full border-2 border-teal text-teal hover:bg-teal hover:text-white rounded-xl py-4 font-medium text-lg transition-colors"
              >
                Get Started &rarr;
              </a>
            </div>

            {/* Standard — Most Popular */}
            <div className="relative bg-white rounded-2xl shadow-lg border-2 border-teal p-8 md:p-10 text-center md:scale-105">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-coral text-white rounded-full px-3 py-1 text-xs font-semibold">
                Most Popular
              </span>
              <p className="text-sm font-semibold text-teal uppercase tracking-wide">
                Standard
              </p>
              <p className="mt-4 text-5xl font-bold">$39</p>
              <p className="mt-1 text-muted-foreground">one-time payment</p>
              <ul className="mt-8 space-y-3 text-left">
                {[
                  "10 analyses",
                  "Everything in Starter",
                  "Side-by-side school comparison",
                  "Downloadable PDF report",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-teal flex-shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <a
                href="https://buy.stripe.com/00wcN7cs4aM69Gof3Fasg01"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-8 block w-full bg-teal hover:bg-teal-dark text-white rounded-xl py-4 font-medium text-lg transition-colors"
              >
                Get Started &rarr;
              </a>
            </div>

            {/* Premium */}
            <div className="bg-white rounded-2xl shadow-sm border border-warmgray-200 p-8 text-center">
              <p className="text-sm font-semibold text-teal uppercase tracking-wide">
                Premium
              </p>
              <p className="mt-4 text-5xl font-bold">$79</p>
              <p className="mt-1 text-muted-foreground">one-time payment</p>
              <ul className="mt-8 space-y-3 text-left">
                {[
                  "25 analyses",
                  "Everything in Standard",
                  "Counselor Brief \u2014 a one-page summary to bring to your school counselor meeting",
                  "Priority support via email",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-teal flex-shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <a
                href="https://buy.stripe.com/bJe7sN1Nqg6q3i0bRtasg02"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-8 block w-full border-2 border-teal text-teal hover:bg-teal hover:text-white rounded-xl py-4 font-medium text-lg transition-colors"
              >
                Get Started &rarr;
              </a>
            </div>
          </div>
          <p className="mt-8 text-center text-xs text-muted-foreground">
            Secure payment via Stripe. No subscription. No recurring charges.
          </p>
        </div>
      </section>

      {/* SECTION 6 — FAQ */}
      <section className="bg-white py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            Frequently Asked Questions
          </h2>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div
                key={i}
                className="border border-warmgray-200 rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-6 py-4 text-left font-medium hover:bg-warmgray-50 transition-colors"
                >
                  {faq.q}
                  <ChevronDown
                    className={`h-5 w-5 text-muted-foreground flex-shrink-0 ml-4 transition-transform ${
                      openFaq === i ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-4 text-muted-foreground leading-relaxed">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 7 — FOOTER */}
      <footer className="bg-charcoal text-white py-12 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-xl font-bold">My School List</p>
          <p className="mt-2 text-warmgray-300 text-sm">
            A Corvessa Partners product
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-warmgray-300">
            <Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
            <span className="hidden sm:inline">|</span>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <span className="hidden sm:inline">|</span>
            <span>Contact: peter@corvessapartners.com</span>
          </div>
          <p className="mt-6 text-xs text-warmgray-200">
            &copy; 2026 Corvessa Partners LLC. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
