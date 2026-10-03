import Link from "next/link";

export const metadata = {
  title: "Terms of Service — Artha",
  description: "Terms of Service for Artha",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full px-6 pt-12 pb-16">
        <Link
          href="/"
          className="text-sm font-medium text-muted-foreground hover:text-foreground underline underline-offset-2 mb-8"
        >
          ← Back
        </Link>

        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground mb-6">
          Terms of Service
        </h1>

        <div className="text-foreground/90 leading-relaxed space-y-4">
          <div className="space-y-6">
            <p>
              Welcome to <span className="font-semibold text-foreground">Artha</span>{" "}
              (&quot;Company,&quot; &quot;we,&quot; &quot;our,&quot; or &quot;us&quot;). These Terms of Service (&quot;Terms&quot;)
              govern your access to and use of our platform, products, services,
              and website (collectively, the &quot;Service&quot;).
            </p>
            <p>
              By accessing or using the Service, you agree to be bound by these Terms.
              If you do not agree, please do not use the Service.
            </p>
          </div>

          <div className="mt-12 space-y-12">
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                1. Overview of the Service
              </h2>
              <p className="leading-relaxed">
                The Service provides AI-powered software designed to help operate,
                manage, automate, and optimize online businesses 24×7, including
                customer support automation, sales workflows, marketing automation,
                and operational insights.
              </p>
              <p className="leading-relaxed mt-4">
                We reserve the right to modify or discontinue features at any time.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                2. Eligibility
              </h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>You must be at least 18 years old.</li>
                <li>You must have authority to enter a binding agreement.</li>
                <li>You must comply with applicable laws.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                3. Account Registration
              </h2>
              <p className="leading-relaxed">
                You agree to provide accurate information, maintain the security
                of your credentials, and accept responsibility for activities
                under your account.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                4. Acceptable Use
              </h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>No unlawful or fraudulent use.</li>
                <li>No infringement of intellectual property.</li>
                <li>No distribution of malware or harmful code.</li>
                <li>No reverse engineering or unauthorized copying.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                5. AI-Generated Outputs
              </h2>
              <p className="leading-relaxed">
                AI-generated outputs may contain inaccuracies. You are responsible
                for reviewing and validating outputs before relying on them for
                business decisions.
              </p>
              <p className="leading-relaxed mt-4">
                The Service is provided without guarantees of revenue growth,
                performance, or specific outcomes.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                6. Customer Data
              </h2>
              <p className="leading-relaxed">
                You retain ownership of your data. By using the Service, you grant
                us a limited license to host, process, and analyze data for the
                purpose of operating and improving the platform.
              </p>
              <p className="leading-relaxed mt-4">
                We do not sell identifiable customer data.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                7. Fees & Payments
              </h2>
              <p className="leading-relaxed">
                Paid features require upfront billing unless stated otherwise.
                Fees are non-refundable except where required by law.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                8. Intellectual Property
              </h2>
              <p className="leading-relaxed">
                All rights to the Service, including software and branding,
                remain the exclusive property of the Company.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                9. Disclaimer of Warranties
              </h2>
              <p className="leading-relaxed">
                The Service is provided &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; without
                warranties of any kind.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                10. Limitation of Liability
              </h2>
              <p className="leading-relaxed">
                To the maximum extent permitted by law, the Company is not liable
                for indirect, incidental, or consequential damages. Total liability
                shall not exceed the amount paid by you in the past 12 months.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                11. Termination
              </h2>
              <p className="leading-relaxed">
                We may suspend or terminate access if these Terms are violated or
                fees remain unpaid.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                12. Governing Law
              </h2>
              <p className="leading-relaxed">
                These Terms are governed by the laws of the State of California,
                without regard to conflict of law principles.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                13. Contact Information
              </h2>
              <p className="leading-relaxed">
                Artha<br />
                Email: parth@artha.run<br />
                Address: 111 Pine St, San Francisco, CA
              </p>
            </section>
          </div>

          <div className="mt-16 pt-8 border-t border-gray-200 text-sm text-muted-foreground">
            © {new Date().getFullYear()} Artha. All rights reserved.
          </div>
        </div>
      </div>
    </div>
  );
}
