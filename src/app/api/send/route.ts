import { NextResponse } from "next/server";

const N8N_URL = process.env.N8N_WEBHOOK_URL || "https://adonis-revelatory-roy.ngrok-free.dev";

export async function POST(request: Request) {
  const body = await request.json();
  try {
    const resp = await fetch(`${N8N_URL}/webhook/wf-15-report-api`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "send",
        reportId: body.reportId,
        recipients: body.recipients,
        subject: body.subject,
        html: body.html,
      }),
    });
    const data = await resp.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to send report" }, { status: 500 });
  }
}
