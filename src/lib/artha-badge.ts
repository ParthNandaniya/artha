/**
 * Floating "Powered by Artha" badge for free-tier sites.
 * Injected as a script that renders a fixed-position badge in the bottom-right corner.
 * Pro users have this removed (the footer attribution remains for all tiers).
 */
export function buildArthaBadgeScript(slug: string): string {
  return `(function(){
  var b=document.createElement("a");
  b.href="https://artha.run?ref=${encodeURIComponent(slug)}";
  b.target="_blank";
  b.rel="noopener noreferrer";
  b.textContent="Powered by Artha";
  b.style.cssText="position:fixed;bottom:16px;right:16px;z-index:9999;padding:8px 16px;border-radius:9999px;font-family:system-ui,sans-serif;font-size:13px;font-weight:600;color:#fff;background:#000;text-decoration:none;box-shadow:0 2px 8px rgba(0,0,0,0.15);transition:transform 0.2s,box-shadow 0.2s;";
  b.onmouseover=function(){b.style.transform="scale(1.05)";b.style.boxShadow="0 4px 12px rgba(0,0,0,0.25)";};
  b.onmouseout=function(){b.style.transform="scale(1)";b.style.boxShadow="0 2px 8px rgba(0,0,0,0.15)";};
  document.body.appendChild(b);
})();`;
}
