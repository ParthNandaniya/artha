import DOMPurify from "dompurify";

/** Sanitize HTML from AI-generated content before using dangerouslySetInnerHTML */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "h1", "h2", "h3", "h4", "h5", "h6",
      "p", "br", "hr",
      "ul", "ol", "li",
      "strong", "em", "b", "i", "u", "s",
      "a", "blockquote", "pre", "code",
      "table", "thead", "tbody", "tr", "th", "td",
      "div", "span",
      "img",
      "svg", "path", "circle", "rect", "line", "polyline", "polygon", "text", "g", "defs", "clipPath", "use",
    ],
    ALLOWED_ATTR: [
      "href", "target", "rel", "src", "alt", "width", "height",
      "class", "style",
      "viewBox", "xmlns", "fill", "stroke", "stroke-width", "d", "cx", "cy", "r", "x", "y", "x1", "y1", "x2", "y2",
      "points", "transform", "text-anchor", "font-size", "font-weight", "opacity",
      "clip-path", "id",
    ],
  });
}
