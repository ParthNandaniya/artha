import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Artha",
  description: "Privacy Policy for Artha",
};

export default function PrivacyPage() {
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
          Privacy Policy
        </h1>

        <div className="text-foreground/90 leading-relaxed space-y-4">
          <div className="space-y-6">
            <p>
              This Privacy Policy explains how{" "}
              <span className="font-semibold text-foreground">Artha</span>{" "}
              ("Company," "we," "our," or "us") collects, uses, and protects
              your information when you use our platform, products, services,
              and website (collectively, the "Service").
            </p>
            <p>
              By using the Service, you agree to the collection and use of
              information in accordance with this Privacy Policy.
            </p>
          </div>

          <div className="mt-12 space-y-12">

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                1. Information We Collect
              </h2>
              <p className="leading-relaxed">
                We may collect the following types of information:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-4">
                <li>Account information (name, email, company details).</li>
                <li>Payment information (processed securely by third-party providers).</li>
                <li>Business data you upload or connect to the Service.</li>
                <li>Usage data, analytics, and device information.</li>
                <li>Communications with our support team.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                2. How We Use Information
              </h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>To provide, operate, and improve the Service.</li>
                <li>To personalize your experience.</li>
                <li>To process payments and manage accounts.</li>
                <li>To communicate updates and important notices.</li>
                <li>To ensure security and prevent fraud.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                3. AI & Data Processing
              </h2>
              <p className="leading-relaxed">
                Artha uses artificial intelligence to analyze and automate
                aspects of your online business operations.
              </p>
              <p className="leading-relaxed mt-4">
                Your data may be processed by AI models to generate insights,
                automation decisions, or content. We do not sell your identifiable
                business data. Aggregated and anonymized data may be used to
                improve our systems.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                4. Data Sharing
              </h2>
              <p className="leading-relaxed">
                We do not sell personal information. We may share information:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-4">
                <li>With service providers who help operate our platform.</li>
                <li>To comply with legal obligations.</li>
                <li>In connection with a merger, acquisition, or asset sale.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                5. Data Security
              </h2>
              <p className="leading-relaxed">
                We implement reasonable technical and organizational safeguards
                to protect your information. However, no method of transmission
                over the Internet is 100% secure.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                6. Data Retention
              </h2>
              <p className="leading-relaxed">
                We retain information for as long as necessary to provide the
                Service, comply with legal obligations, resolve disputes,
                and enforce agreements.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                7. Your Rights
              </h2>
              <p className="leading-relaxed">
                Depending on your jurisdiction, you may have rights to:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-4">
                <li>Access or correct your personal data.</li>
                <li>Request deletion of your data.</li>
                <li>Object to or restrict certain processing.</li>
                <li>Request data portability.</li>
              </ul>
              <p className="leading-relaxed mt-4">
                To exercise these rights, contact us at the email below.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                8. Cookies & Analytics
              </h2>
              <p className="leading-relaxed">
                We may use cookies and similar technologies to analyze usage,
                remember preferences, and improve performance.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                9. International Users
              </h2>
              <p className="leading-relaxed">
                If you access the Service from outside the United States,
                your information may be transferred to and processed in the U.S.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                10. Changes to This Policy
              </h2>
              <p className="leading-relaxed">
                We may update this Privacy Policy from time to time.
                Continued use of the Service after updates constitutes
                acceptance of the revised policy.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                11. Contact Information
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