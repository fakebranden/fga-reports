import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const SUPPORTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];
const SUPPORTED_FILE_TYPES = [
  ...SUPPORTED_IMAGE_TYPES,
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/csv",
];

export async function POST(request: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
    }

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const reportHtml = formData.get("reportHtml") as string;
    const brandColor = formData.get("brandColor") as string || "#800020";

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    // Validate files
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File "${file.name}" exceeds 10MB limit` },
          { status: 400 }
        );
      }
      if (!SUPPORTED_FILE_TYPES.includes(file.type)) {
        return NextResponse.json(
          { error: `File type "${file.type}" for "${file.name}" is not supported. Supported: PDF, PNG, JPG, CSV, TXT` },
          { status: 400 }
        );
      }
    }

    // Build content blocks for Claude
    const contentBlocks: Anthropic.Messages.ContentBlockParam[] = [];

    // Add the system context about the report
    contentBlocks.push({
      type: "text",
      text: `You are analyzing uploaded documents to generate a section for a client performance report.

Here is the current report HTML for context — use the metrics, language style, and tone from this report as your reference:

<current_report>
${reportHtml}
</current_report>

IMPORTANT RULES:
- Write in plain English, layman's terms — no jargon or acronyms
- Use relational metrics (comparisons like "up 23% from last month", "nearly double the industry average")
- Match the exact inline style patterns from the report (no CSS classes, all inline styles)
- Use the brand color ${brandColor} for any section headers
- Keep analysis concise and actionable — focus on what matters to the business owner
- Use the same font sizes, line heights, colors, and spacing as the existing report sections
- Output ONLY the HTML for the new section(s) — no markdown, no code fences, no explanation
- The HTML should be one or more div elements that can be inserted directly into the report
- Start with a section header using this exact pattern:
  <div style="padding:0 40px 16px;">
    <div style="background:${brandColor};border-radius:8px;padding:14px 20px;">
      <div style="color:#fff;font-size:18px;font-weight:700;">Section Title Here</div>
    </div>
  </div>
- Follow with content blocks using this pattern:
  <div style="padding:8px 40px 16px;font-size:15px;line-height:1.7;color:#333;">
    Content here...
  </div>
- For metric callouts, use this pattern:
  <div style="padding:0 40px 16px;">
    <div style="background:#f8f9fa;border-radius:8px;padding:16px 20px;border-left:4px solid ${brandColor};">
      <div style="font-size:14px;color:#333;line-height:1.6;">Metric content</div>
    </div>
  </div>

Now analyze the following uploaded documents and generate report content:`,
    });

    // Process each file
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");

      if (SUPPORTED_IMAGE_TYPES.includes(file.type)) {
        // Image files — send as image content blocks
        contentBlocks.push({
          type: "text",
          text: `\n\nUploaded image file: "${file.name}"`,
        });
        contentBlocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: file.type as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
            data: base64,
          },
        });
      } else if (file.type === "application/pdf") {
        // PDF files — send as document content blocks
        contentBlocks.push({
          type: "text",
          text: `\n\nUploaded PDF file: "${file.name}"`,
        });
        contentBlocks.push({
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: base64,
          },
        } as Anthropic.Messages.ContentBlockParam);
      } else {
        // Text/CSV files — decode and send as text
        const textContent = Buffer.from(arrayBuffer).toString("utf-8");
        contentBlocks.push({
          type: "text",
          text: `\n\nUploaded file: "${file.name}" (${file.type})\n\nFile contents:\n${textContent}`,
        });
      }
    }

    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: contentBlocks,
        },
      ],
    });

    // Extract text response
    const textBlock = response.content.find((block) => block.type === "text");
    const generatedHtml = textBlock && "text" in textBlock ? textBlock.text : "";

    // Clean up any markdown code fences if Claude added them
    const cleaned = generatedHtml
      .replace(/^```html?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();

    return NextResponse.json({ html: cleaned });
  } catch (error: unknown) {
    console.error("Analyze error:", error);
    const message = error instanceof Error ? error.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
