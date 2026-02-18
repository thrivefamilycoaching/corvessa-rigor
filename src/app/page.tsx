"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Upload,
  Search,
  Sparkles,
  CheckCircle2,
  ChevronDown,
  ShieldCheck,
  Instagram,
  Linkedin,
  Menu,
  X,
} from "lucide-react";

const navLinks = [
  { label: "How It Works", href: "#how-it-works" },
  { label: "See It in Action", href: "#see-it-in-action" },
  { label: "What's In Your Report", href: "#whats-in-your-report" },
  { label: "Testimonials", href: "#testimonials" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

const faqs = [
  {
    q: "What do I need to get started?",
    a: "Just select your state and high school from our dropdown, then upload your student\u2019s transcript as a PDF. For the best results, you can also upload your school\u2019s profile \u2014 it helps the AI analyze course offerings in more detail. Test scores are optional but improve accuracy.",
  },
  {
    q: "How accurate are the admission odds?",
    a: "Our odds are based on College Scorecard data, adjusted for your student\u2019s GPA, test scores, course rigor, and extracurriculars. They\u2019re estimates, not guarantees \u2014 similar to what a college counselor would provide.",
  },
  {
    q: "Can I run multiple school lists?",
    a: "Yes \u2014 each plan includes multiple school lists. Adjust scores, add activities, and re-run as many times as your plan allows.",
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
    a: "Over 500 colleges and universities, from small liberal arts colleges to large state universities, across all regions of the US. Don\u2019t see a school you\u2019re looking for? Let us know at info@corvessapartners.com and we\u2019ll add it.",
  },
];

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollTo = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string
  ) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen font-sans text-charcoal">
      {/* STICKY NAV */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-warmgray-200 transition-shadow ${
          scrolled ? "shadow-md" : ""
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-16">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="text-3xl font-extrabold text-teal tracking-tight"
          >
            My School List
          </a>

          {/* Desktop links */}
          <div className="hidden lg:flex items-center gap-6">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => scrollTo(e, link.href)}
                className="text-sm font-medium text-charcoal hover:text-teal transition-colors"
              >
                {link.label}
              </a>
            ))}
            <Link
              href="/tool"
              className="ml-2 bg-teal text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-teal-dark transition-colors"
            >
              Get Started
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 text-charcoal"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </button>
        </div>

        {/* Mobile dropdown */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-white border-t border-warmgray-200 px-6 py-4 space-y-3">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => scrollTo(e, link.href)}
                className="block text-sm font-medium text-charcoal hover:text-teal transition-colors py-1"
              >
                {link.label}
              </a>
            ))}
            <Link
              href="/tool"
              className="block text-center bg-teal text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-teal-dark transition-colors mt-3"
            >
              Get Started
            </Link>
          </div>
        )}
      </nav>

      {/* SECTION 1 — HERO */}
      <section className="bg-warmgray-50 pt-28 pb-14 md:pt-36 md:pb-20">
        <div className="max-w-4xl mx-auto text-center px-4">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight">
            Your Personalized College List in Minutes
          </h1>
          <p className="mt-6 text-xl md:text-2xl font-semibold max-w-3xl mx-auto">
            Find the right colleges for your child &mdash; with real admission
            odds based on an actual transcript.
          </p>
        </div>
      </section>

      {/* SECTION 2 — SEE IT IN ACTION (YouTube Demo) */}
      <section
        id="see-it-in-action"
        className="bg-white py-12 px-4 scroll-mt-20"
      >
        <div className="max-w-[800px] mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-8">
            See It in Action
          </h2>
          <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
            <iframe
              className="absolute inset-0 w-full h-full rounded-xl shadow-lg"
              src="https://www.youtube.com/embed/aHLI357FZxQ"
              title="My School List — How It Works"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      </section>

      {/* SECTION 3 — HOW IT WORKS */}
      <section
        id="how-it-works"
        className="bg-warmgray-50 py-12 px-4 scroll-mt-20"
      >
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-8">
            How It Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: <Search className="h-8 w-8 text-teal" />,
                title: "Find Your School",
                desc: "Select your state and high school from our database of thousands of public and private schools nationwide.",
              },
              {
                icon: <Upload className="h-8 w-8 text-teal" />,
                title: "Upload Your Documents",
                desc: "Upload your student\u2019s transcript PDF. Want even more detailed results? Optionally add your school\u2019s profile for course-specific recommendations.",
              },
              {
                icon: <Sparkles className="h-8 w-8 text-teal" />,
                title: "Get Your Personalized List",
                desc: "In under a minute, receive safety, match, and reach schools with your estimated admission odds.",
              },
            ].map((card) => (
              <div
                key={card.title}
                className="bg-white rounded-xl p-8 shadow-sm text-center"
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

      {/* SECTION 4 — WHAT'S IN YOUR REPORT */}
      <section
        id="whats-in-your-report"
        className="bg-white py-12 px-4 scroll-mt-20"
      >
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-8">
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

      {/* PRIMARY CTA */}
      <section className="bg-warmgray-50 py-10 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <Link
            href="/tool"
            className="inline-block bg-teal hover:bg-teal-dark text-white text-lg px-8 py-4 rounded-xl shadow-lg transition-colors font-medium"
          >
            Build My School List &rarr;
          </Link>
        </div>
      </section>

      {/* SECTION 5 — TESTIMONIALS */}
      <section
        id="testimonials"
        className="bg-white py-12 px-4 scroll-mt-20"
      >
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-8">
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

      {/* PRIVACY TRUST BANNER */}
      <section className="bg-charcoal py-10 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <ShieldCheck className="h-10 w-10 text-teal mx-auto mb-4" />
          <p className="text-xl md:text-2xl font-semibold text-white leading-relaxed">
            Your data stays yours.
          </p>
          <p className="mt-3 text-base md:text-lg text-warmgray-300 leading-relaxed">
            We don&apos;t store your documents, sell your information, or train
            AI on your uploads. Once your analysis is complete, your files are
            gone.
          </p>
        </div>
      </section>

      {/* SECTION 6 — PRICING */}
      <section
        id="pricing"
        className="bg-warmgray-50 py-12 px-4 scroll-mt-20"
      >
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-8">
            Simple Pricing
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            {/* Starter */}
            <div className="bg-white rounded-2xl shadow-sm border border-warmgray-200 p-8 text-center">
              <p className="text-sm font-semibold text-teal uppercase tracking-wide">
                Starter
              </p>
              <p className="mt-4 text-5xl font-bold">$19</p>
              <p className="mt-1 text-muted-foreground">one-time payment</p>
              <ul className="mt-8 space-y-3 text-left">
                {[
                  "3 school lists",
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
                Buy from My School List &rarr;
              </a>
            </div>

            {/* Standard — Most Popular */}
            <div className="relative bg-white rounded-2xl shadow-lg border-2 border-teal p-8 md:p-10 text-center">
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
                  "10 school lists",
                  "Personalized school recommendations with admission odds",
                  "Live links to school websites",
                  "Search any school for individual admission chances",
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
                Buy from My School List &rarr;
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
                  "25 school lists",
                  "Personalized school recommendations with admission odds",
                  "Live links to school websites",
                  "Search any school for individual admission chances",
                  "Side-by-side school comparison",
                  "Downloadable PDF report",
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
                Buy from My School List &rarr;
              </a>
            </div>
          </div>
          <p className="mt-8 text-center text-xs text-muted-foreground">
            Secure payment via Stripe. No subscription. No recurring charges.
          </p>
        </div>
      </section>

      {/* SECTION 7 — FAQ */}
      <section id="faq" className="bg-white py-12 px-4 scroll-mt-20">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-8">
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

      {/* SECTION 8 — FOOTER */}
      <footer className="bg-charcoal text-white py-10 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-xl font-bold">My School List</p>
          <p className="mt-2 text-warmgray-300 text-sm">
            A Corvessa Partners product
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-warmgray-300">
            <Link
              href="/terms"
              className="hover:text-white transition-colors"
            >
              Terms of Service
            </Link>
            <span className="hidden sm:inline">|</span>
            <Link
              href="/privacy"
              className="hover:text-white transition-colors"
            >
              Privacy Policy
            </Link>
            <span className="hidden sm:inline">|</span>
            <a
              href="mailto:info@corvessapartners.com"
              className="hover:text-white transition-colors"
            >
              Contact: info@corvessapartners.com
            </a>
          </div>
          <div className="mt-6 flex items-center justify-center gap-4">
            <a
              href="https://instagram.com/myschoollist"
              target="_blank"
              rel="noopener noreferrer"
              className="text-warmgray-300 hover:text-white transition-colors"
            >
              <Instagram className="h-5 w-5" />
            </a>
            <a
              href="https://linkedin.com/in/peteryoung-va"
              target="_blank"
              rel="noopener noreferrer"
              className="text-warmgray-300 hover:text-white transition-colors"
            >
              <Linkedin className="h-5 w-5" />
            </a>
          </div>
          <p className="mt-4 text-xs text-warmgray-200">
            &copy; 2026 Corvessa Partners LLC. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
