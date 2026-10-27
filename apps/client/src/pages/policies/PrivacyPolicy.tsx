import { Button } from "@/components/ui/button";
import { ArrowLeft, Mic2 } from "lucide-react";
import { useLocation } from "wouter";
import { useBranding } from "@/components/BrandingProvider";

export default function PrivacyPolicy() {
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
            Privacy Policy
          </h1>
          <p className="text-muted-foreground text-lg mb-12">
            Last updated: December 3, 2025
          </p>

          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-4">Introduction</h2>
            <p className="text-lg leading-relaxed mb-4">
              At {branding.app_name}, we take your privacy seriously. This
              Privacy Policy explains how we collect, use, disclose, and
              safeguard your information when you use our AI-powered calling
              platform.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-4">Information We Collect</h2>
            <h3 className="text-2xl font-semibold mb-3 mt-6">
              Personal Information
            </h3>
            <p className="text-lg leading-relaxed mb-4">
              When you register for an account, we collect:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-lg">
              <li>Name and email address</li>
              <li>Phone number (if provided)</li>
              <li>Company information</li>
              <li>
                Payment information (processed securely through our payment
                partners)
              </li>
            </ul>

            <h3 className="text-2xl font-semibold mb-3 mt-6">Usage Data</h3>
            <p className="text-lg leading-relaxed mb-4">
              We automatically collect certain information when you use our
              platform:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-lg">
              <li>Call records and transcripts</li>
              <li>Campaign performance data</li>
              <li>Device and browser information</li>
              <li>IP addresses and log data</li>
            </ul>

            <h3 className="text-2xl font-semibold mb-3 mt-6">
              Call Recording and AI Processing
            </h3>
            <p className="text-lg leading-relaxed mb-4">
              When you use our AI calling services, we process the following
              data:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-lg">
              <li>
                <strong>Voice Recordings:</strong> AI-generated and recipient
                audio during calls
              </li>
              <li>
                <strong>Transcripts:</strong> Real-time speech-to-text
                conversion of conversations
              </li>
              <li>
                <strong>AI Analysis:</strong> Automated summaries, sentiment
                analysis, and lead scoring
              </li>
              <li>
                <strong>Call Metadata:</strong> Duration, timestamps, caller ID,
                and connection status
              </li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-4">
              How We Use Your Information
            </h2>
            <p className="text-lg leading-relaxed mb-4">
              We use the collected information for the following purposes:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-lg">
              <li>
                <strong>Service Delivery:</strong> To provide and maintain our
                AI calling platform
              </li>
              <li>
                <strong>Account Management:</strong> To manage your subscription
                and credits
              </li>
              <li>
                <strong>Analytics:</strong> To improve our AI models and service
                quality
              </li>
              <li>
                <strong>Communication:</strong> To send important updates and
                notifications
              </li>
              <li>
                <strong>Support:</strong> To respond to your inquiries and
                resolve issues
              </li>
              <li>
                <strong>Legal Compliance:</strong> To meet regulatory
                requirements
              </li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-4">
              Data Storage and Security
            </h2>
            <p className="text-lg leading-relaxed mb-4">
              We implement industry-standard security measures to protect your
              data:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-lg">
              <li>
                <strong>Encryption:</strong> All data is encrypted in transit
                (TLS) and at rest
              </li>
              <li>
                <strong>Access Controls:</strong> Strict role-based access to
                sensitive data
              </li>
              <li>
                <strong>Data Centers:</strong> Secure, SOC 2 compliant hosting
                facilities
              </li>
              <li>
                <strong>Regular Audits:</strong> Periodic security assessments
                and penetration testing
              </li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-4">Third-Party Services</h2>
            <p className="text-lg leading-relaxed mb-4">
              We integrate with trusted third-party services to provide our
              platform:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-lg">
              <li>
                <strong>Telephony Providers:</strong> For phone number
                provisioning and call routing
              </li>
              <li>
                <strong>AI Voice Services:</strong> For voice synthesis and
                speech processing
              </li>
              <li>
                <strong>Payment Processors:</strong> For secure payment handling
              </li>
              <li>
                <strong>Analytics Services:</strong> For platform performance
                monitoring
              </li>
            </ul>
            <p className="text-lg leading-relaxed mb-4">
              These providers are bound by strict data processing agreements and
              privacy standards.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-4">Your Rights</h2>
            <p className="text-lg leading-relaxed mb-4">
              Depending on your location, you may have the following rights:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-lg">
              <li>
                <strong>Access:</strong> Request a copy of your personal data
              </li>
              <li>
                <strong>Correction:</strong> Update inaccurate or incomplete
                information
              </li>
              <li>
                <strong>Deletion:</strong> Request removal of your personal data
              </li>
              <li>
                <strong>Export:</strong> Receive your data in a portable format
              </li>
              <li>
                <strong>Opt-Out:</strong> Unsubscribe from marketing
                communications
              </li>
            </ul>
            <p className="text-lg leading-relaxed mb-4">
              To exercise these rights, please contact us using the information
              below.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-4">Data Retention</h2>
            <p className="text-lg leading-relaxed mb-4">
              We retain your data for as long as necessary to provide our
              services:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-lg">
              <li>
                <strong>Account Data:</strong> Until you delete your account
              </li>
              <li>
                <strong>Call Recordings:</strong> 90 days, or as required by
                your settings
              </li>
              <li>
                <strong>Transcripts:</strong> Duration of your subscription plus
                30 days
              </li>
              <li>
                <strong>Payment Records:</strong> As required by financial
                regulations
              </li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-4">Changes to This Policy</h2>
            <p className="text-lg leading-relaxed mb-4">
              We may update this Privacy Policy from time to time. We will
              notify you of any material changes by posting the new policy on
              this page and updating the "Last updated" date.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-4">Contact Us</h2>
            <p className="text-lg leading-relaxed mb-4">
              If you have any questions about this Privacy Policy or our data
              practices, please contact our support team through the application
              or visit our contact page.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
