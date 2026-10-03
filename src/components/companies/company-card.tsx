"use client";

import { useEffect, useRef, useState } from "react";

interface CompanyCardProps {
  slug: string;
  name: string;
  tagline: string | null;
  companyDomain: string;
}

export function CompanyCard({ slug, name, tagline, companyDomain }: CompanyCardProps) {
  const siteUrl = `https://${slug}.${companyDomain}`;
  const previewUrl = `/site/${slug}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Lazy-load iframe when near viewport
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Dynamically compute scale so 1440px iframe fits card width exactly
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.offsetWidth;
      if (w > 0) el.style.setProperty("--preview-scale", String(w / 1440));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <a
      href={siteUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-xl border border-neutral-200 bg-white overflow-hidden hover:shadow-xl hover:border-neutral-300 hover:-translate-y-1 transition-all duration-200"
    >
      {/* Browser chrome bar */}
      <div className="flex items-center gap-1.5 px-3 py-2 bg-neutral-100 border-b border-neutral-200">
        <span className="w-2 h-2 rounded-full bg-neutral-300" />
        <span className="w-2 h-2 rounded-full bg-neutral-300" />
        <span className="w-2 h-2 rounded-full bg-neutral-300" />
        <div className="flex-1 mx-2 px-2 py-0.5 bg-white rounded text-[10px] text-neutral-400 font-mono truncate text-center border border-neutral-200">
          {slug}.{companyDomain}
        </div>
      </div>

      {/* Iframe preview area */}
      <div
        ref={containerRef}
        className="relative w-full bg-white overflow-hidden"
        style={{ aspectRatio: "16 / 9" }}
      >
        {visible && (
          <>
            <iframe
              src={previewUrl}
              title={`${name} preview`}
              loading="lazy"
              sandbox="allow-scripts allow-same-origin"
              onLoad={() => setLoaded(true)}
              className="absolute top-0 left-0 border-0 pointer-events-none select-none"
              style={{
                width: "1440px",
                height: "900px",
                transform: "scale(var(--preview-scale, 0.3))",
                transformOrigin: "top left",
                opacity: loaded ? 1 : 0,
                transition: "opacity 0.4s ease",
              }}
              tabIndex={-1}
            />
            {/* Bottom gradient for clean edge */}
            <div
              className="absolute bottom-0 left-0 right-0 h-12 pointer-events-none"
              style={{
                background: "linear-gradient(to top, white, transparent)",
              }}
            />
          </>
        )}
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-50">
            <div className="w-6 h-6 border-2 border-neutral-200 border-t-neutral-400 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Card info */}
      <div className="px-4 py-3 border-t border-neutral-100">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-[15px] text-neutral-900 group-hover:text-primary transition-colors truncate">
            {name}
          </h3>
          <svg
            className="w-3.5 h-3.5 text-neutral-400 shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7 17L17 7M17 7H7M17 7v10"
            />
          </svg>
        </div>
        {tagline && (
          <p className="text-[13px] text-neutral-500 mt-0.5 line-clamp-1">
            {tagline}
          </p>
        )}
        <div className="flex items-center gap-1.5 mt-2">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
          <span className="text-xs text-neutral-400 font-mono truncate">
            {slug}.{companyDomain}
          </span>
        </div>
      </div>
    </a>
  );
}
