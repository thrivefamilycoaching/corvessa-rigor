import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Privacy Policy | My School List",
  description: "Privacy Policy for My School List by Corvessa Partners LLC",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-warmgray-50 font-sans text-charcoal">
      <div className="bg-teal text-white">
        <div className="mx-auto max-w-4xl px-4 py-3 flex items-center justify-between">
          <Link href="/" className="font-bold text-xl">My School List</Link>
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-white/80 hover:text-white transition-colors">
            <ArrowLeft className="h-3 w-3" />
            Back to Home
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="bg-white rounded-2xl shadow-sm p-8 md:p-12">
          <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground mb-8">Last updated: February 12, 2026</p>

          <div className="prose prose-sm max-w-none space-y-6 text-charcoal/90 leading-relaxed">
            <section>
              <h2 className="text-xl font-semibold text-charcoal mt-8 mb-3">1. Introduction</h2>
              <p>
                Corvessa Partners LLC (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates My School
                List at getmyschoollist.com. This Privacy Policy describes how we collect, use, and protect your
                information when you use our Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-charcoal mt-8 mb-3">2. Information We Collect</h2>
              <p className="font-medium mt-4 mb-1">Email Address</p>
              <p>
                We collect your email address when you complete a purchase and request an access code. This is used
                to deliver your access code and for account recovery.
              </p>

              <p className="font-medium mt-4 mb-1">Payment Information</p>
              <p>
                Payments are processed by Stripe. We do not store, process, or have access to your credit card
                numbers or full payment details. Stripe handles all payment processing in accordance with PCI-DSS
                standards. For more information, see{" "}
                <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-teal hover:underline">
                  Stripe&apos;s Privacy Policy
                </a>.
              </p>

              <p className="font-medium mt-4 mb-1">Uploaded Documents</p>
              <p>
                You may upload student transcripts and school profiles (PDF files) for analysis. These documents
                are processed in real-time to generate your analysis and are not permanently stored on our servers.
              </p>

              <p className="font-medium mt-4 mb-1">Usage Data</p>
              <p>
                We track access code usage (number of analyses used) to enforce tier limits. We do not track
                browsing behavior, IP addresses, or use analytics cookies.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-charcoal mt-8 mb-3">3. How We Use Your Information</h2>
              <ul className="list-disc pl-5 space-y-2 mt-3">
                <li>To provide the college recommendation analysis you requested</li>
                <li>To generate and deliver your access code via email</li>
                <li>To process payments through Stripe</li>
                <li>To enable access code recovery (&ldquo;Lost your code?&rdquo; feature)</li>
                <li>To enforce analysis limits based on your purchased tier</li>
              </ul>
              <p className="mt-3">
                We do not sell, rent, or share your personal information with third parties for marketing purposes.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-charcoal mt-8 mb-3">4. Third-Party Services</h2>
              <p>We use the following third-party services to operate the Service:</p>
              <ul className="list-disc pl-5 space-y-2 mt-3">
                <li>
                  <span className="font-medium">Stripe</span> &mdash; Payment processing. Stripe receives your
                  payment details directly and is PCI-DSS compliant.
                </li>
                <li>
                  <span className="font-medium">Supabase</span> &mdash; Database hosting. Stores access codes,
                  tier information, and email addresses.
                </li>
                <li>
                  <span className="font-medium">Resend</span> &mdash; Email delivery. Used to send access codes
                  and recovery emails to your email address.
                </li>
                <li>
                  <span className="font-medium">OpenAI</span> &mdash; AI analysis. Uploaded documents are sent to
                  OpenAI&apos;s API for processing. OpenAI does not use API data to train its models. See{" "}
                  <a href="https://openai.com/policies/api-data-usage-policies" target="_blank" rel="noopener noreferrer" className="text-teal hover:underline">
                    OpenAI&apos;s API Data Usage Policy
                  </a>.
                </li>
                <li>
                  <span className="font-medium">Vercel</span> &mdash; Web hosting. Hosts the application and
                  processes serverless API requests.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-charcoal mt-8 mb-3">5. AI Processing Disclosure</h2>
              <p>
                The Service uses artificial intelligence to generate college recommendations. When you submit
                documents for analysis:
              </p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Your uploaded transcripts and school profiles are transmitted to the AI provider&apos;s API for processing;</li>
                <li>The AI provider processes this data solely to generate your analysis and does not use API-submitted data to train its models;</li>
                <li>AI-generated recommendations are probabilistic estimates and may contain errors or reflect outdated information;</li>
                <li>No human reviews your uploaded documents or the AI-generated output as part of the standard analysis process.</li>
              </ul>
              <p className="mt-3">
                We are transparent about our use of AI because we believe you have the right to know how your
                information is processed and how your recommendations are generated.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-charcoal mt-8 mb-3">6. Document Handling</h2>
              <p>
                Uploaded PDF files (transcripts and school profiles) are transmitted securely via HTTPS, processed
                in real-time by our serverless functions and the OpenAI API, and are not permanently stored on our
                servers or in our database. We do not keep copies of your uploaded documents after analysis is
                complete.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-charcoal mt-8 mb-3">7. Cookies and Local Storage</h2>
              <p>
                We use minimal client-side storage. The only data stored in your browser is your access code in
                session storage, which is automatically cleared when you close your browser tab. We do not use
                tracking cookies, advertising cookies, or third-party analytics.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-charcoal mt-8 mb-3">8. Data Retention</h2>
              <ul className="list-disc pl-5 space-y-2 mt-3">
                <li>
                  <span className="font-medium">Access codes and email addresses</span> are retained indefinitely
                  to allow ongoing access to the Service and code recovery.
                </li>
                <li>
                  <span className="font-medium">Uploaded documents</span> are not retained after processing.
                </li>
                <li>
                  <span className="font-medium">Payment records</span> are maintained by Stripe in accordance with
                  their retention policies.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-charcoal mt-8 mb-3">9. Children&apos;s Privacy (COPPA)</h2>
              <p>
                The Service is not directed at children under the age of 13. We do not knowingly collect personal
                information from children under 13. The Service is intended for use by parents, guardians, and
                students aged 18 or older (or with parental consent). If you believe a child under 13 has provided
                us with personal information, please contact us immediately.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-charcoal mt-8 mb-3">10. Virginia Consumer Data Protection Act</h2>
              <p>
                If you are a Virginia resident, you have the right under the Virginia Consumer Data Protection Act
                (VCDPA) to:
              </p>
              <ul className="list-disc pl-5 space-y-2 mt-3">
                <li>Confirm whether we are processing your personal data</li>
                <li>Access your personal data</li>
                <li>Correct inaccuracies in your personal data</li>
                <li>Delete your personal data</li>
                <li>Obtain a portable copy of your personal data</li>
              </ul>
              <p className="mt-3">
                To exercise these rights, contact us at{" "}
                <a href="mailto:peter@corvessapartners.com" className="text-teal hover:underline">
                  peter@corvessapartners.com
                </a>.
                We will respond within 45 days.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-charcoal mt-8 mb-3">11. Security</h2>
              <p>
                We use industry-standard security measures to protect your data, including HTTPS encryption for all
                data in transit, secure serverless processing, and encrypted database storage via Supabase. However,
                no method of transmission or storage is 100% secure, and we cannot guarantee absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-charcoal mt-8 mb-3">12. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. Material changes will be communicated via the
                email address associated with your access code. Your continued use of the Service after changes
                constitutes acceptance of the updated policy.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-charcoal mt-8 mb-3">13. Contact</h2>
              <p>
                If you have questions about this Privacy Policy or wish to exercise your data rights, please
                contact us at{" "}
                <a href="mailto:peter@corvessapartners.com" className="text-teal hover:underline">
                  peter@corvessapartners.com
                </a>.
              </p>
              <p className="mt-3">
                Corvessa Partners LLC<br />
                Commonwealth of Virginia
              </p>
            </section>
          </div>

          <div className="mt-12 pt-6 border-t border-warmgray-200 text-center text-xs text-muted-foreground">
            &copy; 2026 Corvessa Partners LLC. All rights reserved.
          </div>
        </div>
      </div>
    </div>
  );
}
