import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Terms of Service | My School List",
  description: "Terms of Service for My School List by Corvessa Partners LLC",
};

export default function TermsPage() {
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
          <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
          <p className="text-sm text-muted-foreground mb-8">Last updated: February 11, 2026</p>

          <div className="prose prose-sm max-w-none space-y-6 text-charcoal/90 leading-relaxed">
            <section>
              <h2 className="text-xl font-semibold text-charcoal mt-8 mb-3">1. Service Description</h2>
              <p>
                My School List (&ldquo;the Service&rdquo;) is an AI-powered college recommendation tool operated by
                Corvessa Partners LLC (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;), accessible at
                getmyschoollist.com. The Service analyzes student transcripts, school profiles, test scores, and
                extracurricular activities to generate personalized college recommendations and admission odds
                estimates.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-charcoal mt-8 mb-3">2. Access Codes and Purchases</h2>
              <p>
                Access to the Service requires a valid access code obtained through purchase. Each access code grants
                a set number of analyses based on the tier purchased (Starter: 3 analyses, Standard: 10 analyses,
                Premium: 25 analyses). Access codes are non-transferable and non-refundable. Each analysis is consumed
                when you submit documents for processing. Unused analyses do not expire.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-charcoal mt-8 mb-3">3. Informational Purpose Only</h2>
              <p>
                The college recommendations, admission odds, and analyses provided by the Service are for
                informational purposes only. They are estimates based on publicly available data and AI analysis,
                and are not guarantees of college admission. We are not college counselors, admissions consultants,
                or educational advisors. The Service is intended to complement &mdash; not replace &mdash;
                professional college counseling. Actual admission decisions are made solely by colleges and
                universities based on their own criteria.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-charcoal mt-8 mb-3">4. User Requirements</h2>
              <p>
                You must be at least 18 years of age or have the consent of a parent or legal guardian to use this
                Service. By using the Service, you represent that you have the legal authority to enter into these
                Terms or that a parent or guardian has consented on your behalf.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-charcoal mt-8 mb-3">5. Document Handling</h2>
              <p>
                Documents you upload (transcripts, school profiles) are processed in real-time for the sole purpose
                of providing the analysis you requested. Uploaded documents are not permanently stored on our
                servers. We do not retain copies of your PDFs after processing is complete. You are responsible for
                ensuring you have the right to upload any documents you submit.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-charcoal mt-8 mb-3">6. Acceptable Use</h2>
              <p>
                You agree not to misuse the Service, including but not limited to: attempting to reverse-engineer
                the analysis algorithms, sharing access codes with third parties, uploading fraudulent or
                falsified documents, or using the Service for any unlawful purpose.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-charcoal mt-8 mb-3">7. Limitation of Liability</h2>
              <p>
                To the maximum extent permitted by law, Corvessa Partners LLC shall not be liable for any indirect,
                incidental, special, consequential, or punitive damages, including but not limited to loss of
                profits, data, or other intangible losses, resulting from your use of the Service. Our total
                liability shall not exceed the amount you paid for your access code. The Service is provided
                &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-charcoal mt-8 mb-3">8. Modifications</h2>
              <p>
                We reserve the right to modify these Terms, our pricing, features, and the Service at any time.
                Material changes will be communicated via the email address associated with your access code. Your
                continued use of the Service after changes constitutes acceptance of the updated Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-charcoal mt-8 mb-3">9. Governing Law</h2>
              <p>
                These Terms shall be governed by and construed in accordance with the laws of the Commonwealth
                of Virginia, without regard to its conflict of law provisions. Any disputes arising under these
                Terms shall be resolved in the courts of the Commonwealth of Virginia.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-charcoal mt-8 mb-3">10. Contact</h2>
              <p>
                If you have questions about these Terms, please contact us at{" "}
                <a href="mailto:peter@corvessapartners.com" className="text-teal hover:underline">
                  peter@corvessapartners.com
                </a>.
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
