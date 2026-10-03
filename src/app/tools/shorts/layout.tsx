import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Free AI UGC Video Generator — Create Shorts with AI Avatars",
  description:
    "Write a script, pick an AI avatar, and generate professional UGC short videos with captions. Free, no signup required.",
  keywords: [
    "ugc video generator",
    "ai video maker",
    "short form video",
    "ugc creator",
    "ai avatar video",
    "tiktok video maker",
    "free video generator",
  ],
  openGraph: {
    title: "Free AI UGC Video Generator | Artha",
    description:
      "Write a script, pick an AI avatar, generate professional UGC shorts with captions. Free.",
    url: "https://artha.run/tools/shorts",
    siteName: "Artha",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free AI UGC Video Generator | Artha",
    description:
      "Write a script, pick an AI avatar, generate professional UGC shorts with captions.",
  },
  alternates: { canonical: "https://artha.run/tools/shorts" },
};

export default function UgcShortsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Fixed overlay covers the parent tools layout entirely
    <div className="fixed inset-0 z-50 bg-[#0a0a0f] text-white flex flex-col overflow-y-auto">
      {/* Minimal header */}
      <div className="max-w-6xl mx-auto w-full px-6 pt-6">
        <div className="flex items-center justify-between">
          <Link
            href="/tools"
            className="text-white/50 text-sm hover:text-white/80 transition-colors"
          >
            &larr; Back to Tools
          </Link>
          <Link
            href="/"
            className="text-white/40 text-xs hover:text-white/60 transition-colors"
          >
            Powered by Artha
          </Link>
        </div>
      </div>

      <main className="flex-1">{children}</main>

      <footer className="w-full pb-8 px-6">
        <div className="max-w-6xl mx-auto pt-8 border-t border-white/10">
          <div className="flex items-center justify-between text-xs text-white/30">
            <span>&copy; {new Date().getFullYear()} Artha</span>
            <div className="flex gap-4">
              <Link href="/terms" className="hover:text-white/50">
                Terms
              </Link>
              <Link href="/privacy" className="hover:text-white/50">
                Privacy
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
