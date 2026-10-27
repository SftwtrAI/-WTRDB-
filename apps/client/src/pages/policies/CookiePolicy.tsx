import { Button } from "@/components/ui/button";
import { ArrowLeft, Mic2 } from "lucide-react";
import { useLocation } from "wouter";
import { useBranding } from "@/components/BrandingProvider";

export default function CookiePolicy() {
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
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Cookie Policy</h1>
          <p className="text-muted-foreground text-lg mb-12">
            Last updated: November 2, 2025
          </p>

          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-4">What Are Cookies?</h2>
            <p className="text-lg leading-relaxed mb-4">
              Cookies are small text files that are stored on your device when
              you visit our website. They help us provide you with a better
              experience by remembering your preferences and improving our
              Service.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-4">How We Use Cookies</h2>
            <p className="text-lg leading-relaxed mb-4">
              {branding.app_name} uses cookies for the following purposes:
            </p>
          </section>

          <section className="mb-12">
            <h3 className="text-2xl font-semibold mb-3">Essential Cookies</h3>
            <p className="text-lg leading-relaxed mb-4">
              These cookies are necessary for the website to function properly:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-lg">
              <li>
                <strong>Authentication:</strong> Keep you logged in to your
                account
              </li>
              <li>
                <strong>Security:</strong> Protect against fraudulent activity
              </li>
              <li>
                <strong>Session Management:</strong> Remember your preferences
                during your visit
              </li>
            </ul>
            <p className="text-lg leading-relaxed mb-4">
              These cookies cannot be disabled as they are essential for the
              Service to work.
            </p>
          </section>

          <section className="mb-12">
            <h3 className="text-2xl font-semibold mb-3">Analytics Cookies</h3>
            <p className="text-lg leading-relaxed mb-4">
              We use analytics cookies to understand how visitors interact with
              our website:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-lg">
              <li>
                <strong>Page Views:</strong> Track which pages are most popular
              </li>
              <li>
                <strong>Performance:</strong> Monitor site speed and errors
              </li>
              <li>
                <strong>User Journey:</strong> Understand how visitors navigate
              </li>
            </ul>
          </section>

          <section className="mb-12">
            <h3 className="text-2xl font-semibold mb-3">Preference Cookies</h3>
            <p className="text-lg leading-relaxed mb-4">
              These cookies remember your settings and preferences:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-lg">
              <li>
                <strong>Theme:</strong> Light or dark mode preference
              </li>
              <li>
                <strong>Language:</strong> Your preferred language
              </li>
              <li>
                <strong>Timezone:</strong> Your local timezone settings
              </li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-4">Third-Party Cookies</h2>
            <p className="text-lg leading-relaxed mb-4">
              We may use third-party services that set their own cookies:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-lg">
              <li>
                <strong>Payment Processors:</strong> For secure payment handling
              </li>
              <li>
                <strong>Analytics Services:</strong> For performance monitoring
              </li>
              <li>
                <strong>Support Tools:</strong> For customer support features
              </li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-4">Managing Cookies</h2>
            <p className="text-lg leading-relaxed mb-4">
              You can control cookies through your browser settings:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-lg">
              <li>
                <strong>Block All Cookies:</strong> May prevent some features
                from working
              </li>
              <li>
                <strong>Delete Cookies:</strong> Clear stored cookies from your
                device
              </li>
              <li>
                <strong>Accept Only First-Party:</strong> Block third-party
                cookies
              </li>
            </ul>
            <p className="text-lg leading-relaxed mb-4">
              Note that disabling cookies may affect the functionality of our
              Service.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-4">Cookie Retention</h2>
            <p className="text-lg leading-relaxed mb-4">
              Different cookies have different retention periods:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2 text-lg">
              <li>
                <strong>Session Cookies:</strong> Deleted when you close your
                browser
              </li>
              <li>
                <strong>Persistent Cookies:</strong> Remain for a set period
                (e.g., 30 days)
              </li>
              <li>
                <strong>Authentication:</strong> Typically 7-30 days based on
                your settings
              </li>
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-4">Updates to This Policy</h2>
            <p className="text-lg leading-relaxed mb-4">
              We may update this Cookie Policy from time to time. We will notify
              you of any significant changes by posting the new policy on this
              page.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-4">Contact Us</h2>
            <p className="text-lg leading-relaxed mb-4">
              If you have questions about our use of cookies, please contact our
              support team through the application.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
