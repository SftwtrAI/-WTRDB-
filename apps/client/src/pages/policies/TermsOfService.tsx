import { Button } from "@/components/ui/button";
import { ArrowLeft, Mic2 } from "lucide-react";
import { useLocation } from "wouter";
import { useBranding } from "@/components/BrandingProvider";

export default function TermsOfService() {
  const [, setLocation] = useLocation();
  const { branding, currentLogo } = useBranding();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <nav className="border-b bg-background sticky top-0 z-50 backdrop-blur-md bg-background/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <div
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => setLocation("/")}
            >
              {currentLogo ? (
                <img
                  src={currentLogo}
                  alt={branding.app_name}
                  className="h-10 w-auto max-w-[180px] object-contain"
                  data-testid="img-policy-logo"
                />
              ) : (
                <>
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                    <Mic2 className="h-6 w-6 text-white" />
                  </div>
                  <span className="text-2xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                    {branding.app_name}
                  </span>
                </>
              )}
            </div>
            <Button
              variant="ghost"
              onClick={() => setLocation("/")}
              data-testid="button-back-home"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="prose prose-invert max-w-none">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Terms of Service
          </h1>
          <p className="text-muted-foreground text-lg mb-12">
            Last updated: December 3, 2025
          </p>

          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-4">1. Acceptance of Terms</h2>
            <p className="text-lg leading-relaxed mb-4">
              By accessing or using {branding.app_name} ("the Service"), you
              agree to be bound by these Terms of Service. If you do not agree
              to these terms, please do not use our Service.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-4">
              2. Description of Service
            </h2>
            <p className="text-lg leading-relaxed mb-4">
              {branding.app_name} provides an AI-powered bulk calling platform
              that enables users to:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-lg">
              <li>Create and deploy AI voice agents</li>
              <li>Run outbound calling campaigns</li>
              <li>Manage contacts and analyze call data</li>
              <li>Integrate with third-party services</li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-4">3. Account Registration</h2>
            <p className="text-lg leading-relaxed mb-4">
              To use our Service, you must:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-lg">
              <li>Provide accurate and complete registration information</li>
              <li>Maintain the security of your account credentials</li>
              <li>Be at least 18 years old</li>
              <li>
                Accept responsibility for all activities under your account
              </li>
              <li>Notify us immediately of any unauthorized access</li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-4">4. Acceptable Use</h2>
            <p className="text-lg leading-relaxed mb-4">
              You agree NOT to use the Service to:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-lg">
              <li>Make calls to numbers on do-not-call lists</li>
              <li>Engage in harassment, threats, or abuse</li>
              <li>Conduct fraudulent or deceptive activities</li>
              <li>Violate telemarketing laws (TCPA, GDPR, etc.)</li>
              <li>Send spam or unsolicited communications</li>
              <li>Impersonate individuals or organizations</li>
              <li>Transmit malicious code or content</li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-4">5. Payment Terms</h2>
            <p className="text-lg leading-relaxed mb-4">
              By subscribing to our Service:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-lg">
              <li>
                You authorize us to charge your payment method for subscription
                fees
              </li>
              <li>Credits are non-refundable except as required by law</li>
              <li>Unused credits expire according to your plan terms</li>
              <li>We may change pricing with 30 days notice</li>
              <li>Phone number costs are billed separately</li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-4">
              6. Intellectual Property
            </h2>
            <p className="text-lg leading-relaxed mb-4">
              {branding.app_name} and its original content, features, and
              functionality are owned by us and are protected by international
              copyright, trademark, and other intellectual property laws.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-4">7. Data and Privacy</h2>
            <p className="text-lg leading-relaxed mb-4">
              Your use of the Service is also governed by our Privacy Policy. By
              using the Service, you consent to our collection and use of data
              as described in the Privacy Policy.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-4">
              8. Limitation of Liability
            </h2>
            <p className="text-lg leading-relaxed mb-4">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR
              ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE
              DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, OR
              BUSINESS OPPORTUNITIES.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-4">9. Termination</h2>
            <p className="text-lg leading-relaxed mb-4">
              We may terminate or suspend your account immediately, without
              prior notice, for:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-lg">
              <li>Violation of these Terms</li>
              <li>Fraudulent or illegal activity</li>
              <li>Non-payment of fees</li>
              <li>Actions that harm other users or the Service</li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-4">10. Changes to Terms</h2>
            <p className="text-lg leading-relaxed mb-4">
              We reserve the right to modify these Terms at any time. We will
              provide notice of material changes through the Service or by
              email. Continued use after changes constitutes acceptance of the
              new Terms.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-4">11. Contact</h2>
            <p className="text-lg leading-relaxed mb-4">
              If you have questions about these Terms, please contact our
              support team through the application.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
