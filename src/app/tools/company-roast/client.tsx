"use client";

import { FREE_TOOLS } from "@/lib/free-tools";
import { ToolPage } from "@/components/tools/tool-page";
import { MarkdownResult } from "@/components/tools/markdown-result";
import { Input } from "@/components/ui/input";

const tool = FREE_TOOLS.find((t) => t.slug === "company-roast")!;

const EXAMPLE_ROAST = `# Artha -- The Roast

**Roast Score: 7/10**
"We'll build your entire company from one prompt" -- the AI equivalent of promising to assemble IKEA furniture with your eyes closed.

## What They Think They Do vs What They Actually Do
Artha's homepage reads like a fever dream of ambition: "Describe your idea. We build your company." Oh, just a whole company? Not a landing page, not an MVP -- a *company*. Their marketing copy promises website, email, outreach, and tasks "all running on autopilot." Because nothing says "serious business" like a company assembled by robots while you were making coffee. They even offer a "Surprise Me" button. Bold move for a tool that's supposed to be building people's livelihoods.

## The Competition Called...
In a space where Webflow, Squarespace, and literally every website builder exists, Artha decided the problem wasn't "building websites is hard" but "existing as a company is hard." Meanwhile, tools like Stripe Atlas will actually incorporate your business legally. Dorik and Framer will build your site without pretending they're your co-founder. Artha is essentially trying to be the everything-bagel of startup tools -- and we all know how those taste.

## What The Internet Really Thinks
Search results for Artha are... quiet. Like, *library-during-finals-week* quiet. The loudest signal is their own free tools page -- which, credit where it's due, is a smart growth play. But when your most visible presence online is a roast generator making fun of other companies, you know you're still in the "please notice us" phase. Glassdoor? Nothing. TechCrunch? Crickets. The company is so under-the-radar it might actually be in stealth mode by accident.

## The Final Burn
Here's the thing -- Artha is genuinely trying something interesting. Building an AI that doesn't just generate a landing page but actually orchestrates research, email, outreach, and tasks? That's ambitious. The execution shows real technical chops. The free tools are genuinely useful. But let's be honest: right now, Artha is a company that builds companies while still figuring out how to build its own. And honestly? That kind of self-aware audacity deserves at least a slow clap.

---
*Roasted with real data by [Artha](https://artha.run/tools/company-roast). Yes, we roasted ourselves. The burns are free. The therapy bill isn't.*`;

export function CompanyRoastTool() {
  return (
    <>
      <ToolPage
        tool={tool}
        apiEndpoint="/api/tools/company-roast"
        inputOverride={(value, onChange) => (
          <Input
            type="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={tool.placeholder}
            className="h-12 text-base"
          />
        )}
        renderResult={(data) => (
          <MarkdownResult content={data.content as string} />
        )}
      />

      {/* Example roast -- always visible */}
      <div className="max-w-2xl mx-auto px-6 pb-16">
        <div className="mt-2 mb-6">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">
            Example roast
          </p>
          <p className="text-sm text-foreground/50">
            We roasted ourselves first. Because if you can&apos;t take it, don&apos;t dish it.
          </p>
        </div>
        <MarkdownResult content={EXAMPLE_ROAST} />
      </div>
    </>
  );
}
