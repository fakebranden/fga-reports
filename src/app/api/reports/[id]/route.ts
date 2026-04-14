import { NextResponse } from "next/server";

const N8N_URL = process.env.N8N_WEBHOOK_URL || "https://adonis-revelatory-roy.ngrok-free.dev";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const resp = await fetch(`${N8N_URL}/webhook/wf-13-report-api`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get", reportId: id }),
    });
    const data = await resp.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to fetch report" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  try {
    const resp = await fetch(`${N8N_URL}/webhook/wf-13-report-api`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", reportId: id, html: body.html, metadata: body.metadata }),
    });
    const data = await resp.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to save report" }, { status: 500 });
  }
}
