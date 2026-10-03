import { NextResponse } from "next/server";
import { checkFreeToolLimit } from "@/lib/free-tools";
import { generateAgentCompletion } from "@/lib/ai/agent-model-router";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const limitResponse = await checkFreeToolLimit(
      "invoice-generator",
      request
    );
    if (limitResponse) return limitResponse;

    const { prompt } = await request.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { success: false, error: "prompt is required" },
        { status: 400 }
      );
    }

    const systemPrompt = `You are a professional invoicing specialist. Create a clean, professional invoice based on the user's details.

Parse the user's input to extract: business name, client name, line items, and any other details.

Generate the invoice in this format:

# INVOICE

**Invoice Number**: INV-[generate a random 6-digit number]
**Date**: [Today's date placeholder]
**Due Date**: Net 30 from invoice date

---

## From
[Business Name]
[Address placeholder]
[Email placeholder]
[Phone placeholder]

## Bill To
[Client Name]
[Client address placeholder]

---

## Line Items

| # | Description | Quantity | Rate | Amount |
|---|------------|---------|------|--------|
| 1 | [Item] | [Qty] | $[Rate] | $[Amount] |

---

| | |
|---|---|
| **Subtotal** | $[Subtotal] |
| **Tax (0%)** | $0.00 |
| **Total Due** | **$[Total]** |

---

## Payment Details
- **Payment Methods**: Bank Transfer, PayPal, or Check
- **Bank Details**: [Placeholder for bank name, routing, account]
- **PayPal**: [Placeholder]

## Notes
Thank you for your business. Please make payment within 30 days.

---

*This invoice was generated with Artha's free invoice generator.*

Make the math correct. If quantities aren't specified, assume 1. Format as clean markdown. Use proper number formatting with commas for thousands.`;

    const content = await generateAgentCompletion(
      "free_tool",
      systemPrompt,
      prompt
    );

    return NextResponse.json({
      success: true,
      title: "Your Invoice",
      content,
    });
  } catch (error) {
    console.error("[free-tool] invoice-generator error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate invoice" },
      { status: 500 }
    );
  }
}
