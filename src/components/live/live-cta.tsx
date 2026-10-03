"use client";

import Link from "next/link";

export function LiveCta() {
  return (
    <div className="bg-primary text-primary-foreground rounded-xl shadow-sm overflow-hidden p-6 flex flex-col items-center text-center relative group">
      {/* Shine sweep on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>
      <h3 className="text-lg font-bold relative">Describe your idea.</h3>
      <p className="text-sm opacity-90 mt-1.5 max-w-[240px] relative">
        We build the company. Mission, website, email, tasks — all automated.
      </p>
      <Link
        href="/"
        className="mt-5 inline-flex items-center justify-center rounded-lg bg-white text-primary px-6 py-2.5 text-sm font-semibold hover:bg-white/90 hover:scale-[1.02] active:scale-[0.98] transition-all duration-150 relative"
      >
        Build my company
      </Link>
    </div>
  );
}
