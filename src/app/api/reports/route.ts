import { NextResponse } from "next/server";

const N8N_URL = process.env.N8N_WEBHOOK_URL || "https://adonis-revelatory-roy.ngrok-free.dev";

export async function GET() {
  try {
    const resp = await fetch(`${N8N_URL}/webhook/wf-15-report-api`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list" }),
    });
    const data = await resp.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ reports: [] });
  }
}
