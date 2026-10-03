import DOMPurify from "isomorphic-dompurify";

/**
 * Sanitize untrusted HTML (e.g. inbound emails) to prevent XSS.
 * Allows common formatting tags but strips scripts, event handlers, etc.
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    USE_PROFILES: { html: true },
    ALLOWED_TAGS: [
      "p", "br", "b", "i", "em", "strong", "u", "a", "ul", "ol", "li",
      "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code",
      "table", "thead", "tbody", "tr", "th", "td", "img", "hr", "span",
      "div", "sub", "sup", "small",
    ],
    ALLOWED_ATTR: [
      "href", "src", "alt", "title", "class", "style", "width", "height",
      "target", "rel", "colspan", "rowspan",
    ],
    ALLOW_DATA_ATTR: false,
  });
}
