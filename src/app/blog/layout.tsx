import Link from "next/link";
import { ArthaIcon } from "@/components/icons/artha-icon";

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Nav */}
      <div className="max-w-3xl mx-auto w-full px-6 pt-8">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArthaIcon size={20} className="text-foreground" />
            <span className="font-display font-bold text-foreground">artha</span>
          </Link>
          <Link
            href="/blog"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Blog
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1">{children}</div>

      {/* Footer */}
      <footer className="max-w-3xl mx-auto w-full px-6 py-12 border-t border-border/50">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Artha. AI agents that build and run your company.</p>
          <div className="flex gap-6">
            <Link href="/" className="hover:text-foreground">Home</Link>
            <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
            <Link href="/blog" className="hover:text-foreground">Blog</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
