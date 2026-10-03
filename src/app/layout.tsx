import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Geist, Geist_Mono, Syne } from "next/font/google";
import { QueryProvider } from "@/components/query-provider";
import { PostHogClientProvider } from "@/components/posthog-provider";
import "./globals.css";

const GA_MEASUREMENT_ID = "G-NJQ15ZHEKM";
const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
const GOOGLE_ADS_SIGNUP_SEND_TO = process.env.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_SEND_TO || "";
const GOOGLE_ADS_SUBSCRIPTION_SEND_TO = process.env.NEXT_PUBLIC_GOOGLE_ADS_SUBSCRIPTION_SEND_TO || "";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const syne = Syne({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://artha.run"),
  title: "Artha — AI agents that build and run your company",
  description:
    "Describe your idea in one prompt. Artha builds your website, finds your first customers, and handles marketing — so you can focus on your product.",
  keywords: [
    "AI business launch",
    "find first customers",
    "AI marketing for freelancers",
    "launch business with AI",
    "AI customer discovery",
  ],
  openGraph: {
    type: "website",
    url: "https://artha.run",
    title: "Artha — AI agents that build and run your company",
    description:
      "Describe your idea in one prompt. Artha builds your website, finds your first customers, and handles marketing — so you can focus on your product.",
    siteName: "Artha",
  },
  twitter: {
    card: "summary_large_image",
    title: "Artha — AI agents that build and run your company",
    description:
      "Describe your idea in one prompt. Artha builds your website, finds your first customers, and handles marketing — so you can focus on your product.",
  },
  robots: { index: true, follow: true },
  alternates: { canonical: "https://artha.run" },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Artha",
  url: "https://artha.run",
  logo: "https://artha.run/icon.svg",
  description:
    "AI agents that build and run your company. Describe your idea in one prompt — Artha builds your website, finds customers, and handles marketing.",
  sameAs: [
    "https://x.com/tryartha",
    "https://www.instagram.com/tryarthahq",
    "https://bsky.app/profile/artha.run",
  ],
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Artha",
  url: "https://artha.run",
  description:
    "Describe your idea in one prompt. Artha builds your website, finds your first customers, and handles marketing.",
  publisher: { "@type": "Organization", name: "Artha" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="alternate" type="text/markdown" href="https://artha.run/index.md" />
        <link rel="alternate" type="text/plain" href="https://artha.run/llms.txt" />
        <link rel="describedby" type="text/markdown" href="https://artha.run/llms-full.txt" />
        <link rel="service-desc" type="application/json" href="https://artha.run/agents.json" />
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga4-init" strategy="afterInteractive">
          {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_MEASUREMENT_ID}');${GOOGLE_ADS_ID ? `gtag('config','${GOOGLE_ADS_ID}');` : ""}window.__testAdsConversion=function(type){var sendTo=type==='subscription'?'${GOOGLE_ADS_SUBSCRIPTION_SEND_TO}':'${GOOGLE_ADS_SIGNUP_SEND_TO}';if(!sendTo){console.warn('[ads] no send_to configured for '+type);return;}if(typeof window.gtag!=='function'){console.warn('[ads] gtag not loaded — likely blocked by ad blocker');return;}var payload={send_to:sendTo,transaction_id:'test_'+Date.now()};if(type==='subscription'){payload.value=49;payload.currency='USD';}window.gtag('event','conversion',payload);console.log('[ads] fired test '+type+' conversion',payload);};`}
        </Script>
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${syne.variable} antialiased`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([organizationJsonLd, websiteJsonLd]),
          }}
        />
        <PostHogClientProvider>
          <QueryProvider>{children}</QueryProvider>
        </PostHogClientProvider>
      </body>
    </html>
  );
}
