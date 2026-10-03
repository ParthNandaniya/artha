/**
 * Shared validation and footer injection for generated landing pages.
 *
 * validateLandingPage checks two things:
 *  1. Basic HTML structure (DOCTYPE, html, head, body tags)
 *  2. JSX-in-plain-script detection — the root cause of "Unexpected token '<'" browser errors.
 *     If JSX (`return <Tag`) appears inside a regular <script> block that lacks
 *     type="text/babel", the browser tries to parse it as plain JS and fails.
 *     Template-built pages always put JSX in <script type="text/babel">, so they pass.
 *     AI-generated pages that skip the Babel wrapper are caught and rejected.
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Returns true if the script tag's opening tag lacks type="text/babel".
 * Works on the raw opening-tag string (everything up to and including ">").
 */
function isNonBabelScript(openTag: string): boolean {
  // Has a src= → external script, not inline code
  if (/\bsrc\s*=/i.test(openTag)) return false;
  // Has type="text/babel" → Babel will handle it
  if (/type\s*=\s*["']text\/babel["']/i.test(openTag)) return false;
  return true;
}

/**
 * Returns true if the script content looks like it contains JSX.
 * Heuristic: function returns opening JSX element or fragment.
 */
function containsJsx(content: string): boolean {
  // "return (<Tag" or "return <Tag" or "return (<>" (fragment)
  return /return\s*\(\s*<[A-Za-z<]/.test(content) || /return\s+<[A-Za-z<]/.test(content);
}

export function validateLandingPage(html: string): ValidationResult {
  const errors: string[] = [];

  // ── 1. Structural HTML checks ──
  if (!html.includes("<!DOCTYPE html>") && !html.includes("<!doctype html>")) {
    errors.push("Missing <!DOCTYPE html>");
  }
  if (!html.includes("<html")) errors.push("Missing <html> tag");
  if (!html.includes("<head>") && !html.includes("<head ")) errors.push("Missing <head> tag");
  if (!html.includes("<body")) errors.push("Missing <body> tag");
  if (!html.includes("</html>")) errors.push("Missing closing </html> tag");

  // ── 2. JSX-in-plain-script check ──
  // Match inline <script ...>...</script> blocks (non-greedy so we stop at first </script>).
  // We intentionally only extract the opening tag and a content sample — we don't need the
  // full block, just enough to detect JSX usage.
  const scriptRe = /<(script(?:[^>]*?)>)([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html)) !== null) {
    const openTag = m[1] ?? "";
    const content = m[2] ?? "";
    if (!content.trim()) continue;
    if (!isNonBabelScript(openTag)) continue; // external or babel-typed — skip
    if (containsJsx(content)) {
      errors.push(
        'JSX found in a plain <script> block. Use <script type="text/babel"> for React/JSX code, ' +
        'and ensure React + Babel CDN scripts are loaded before it.'
      );
      break; // one report is enough
    }
  }

  return { valid: errors.length === 0, errors };
}

export function cleanGeneratedHtml(html: string): string {
  html = html.trim();
  if (html.startsWith("```")) {
    html = html.replace(/^```(?:html)?\n?/, "").replace(/\n?```$/, "");
  }
  const doctypeIdx = html.indexOf("<!DOCTYPE");
  if (doctypeIdx === -1) {
    const htmlIdx = html.indexOf("<html");
    if (htmlIdx > 0) html = html.slice(htmlIdx);
  } else if (doctypeIdx > 0) {
    html = html.slice(doctypeIdx);
  }
  return html.trim();
}

export function ensureFooter(html: string, companyEmail: string): string {
  if (html.includes("artha.run")) return html;

  const footer = `\n<footer style="text-align:center;padding:2rem;opacity:0.6;font-size:0.85rem;">
  <p>${companyEmail}</p>
  <p>Built with ❤️ on <a href="https://artha.run" style="color:inherit;">artha.run</a></p>
</footer>`;

  const bodyCloseIdx = html.lastIndexOf("</body>");
  if (bodyCloseIdx !== -1) {
    return html.slice(0, bodyCloseIdx) + footer + "\n" + html.slice(bodyCloseIdx);
  }
  return html + footer;
}
