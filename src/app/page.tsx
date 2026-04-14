"use client";
import { useEffect, useState } from "react";
import { FileText, Clock, CheckCircle, AlertCircle } from "lucide-react";
import Link from "next/link";

interface Report {
  id: string;
  client_name: string;
  month_label: string;
  status: string;
  created_at: string;
  subject_line?: string;
}

export default function Home() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/reports")
      .then((r) => r.json())
      .then((d) => { setReports(d.reports || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const statusIcon = (status: string) => {
    if (status === "sent") return <CheckCircle size={16} className="text-green-500" />;
    if (status === "pending") return <Clock size={16} className="text-yellow-500" />;
    return <AlertCircle size={16} className="text-red-500" />;
  };

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-[#EEEEEE]">
      <header className="border-b border-[#333] px-6 py-4 flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="https://flyinggoatagency.com/wp-content/uploads/2025/11/image.webp" alt="FGA" className="h-8" />
        <h1 className="text-lg font-bold">Report Manager</h1>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-bold mb-6">Client Reports</h2>

        {loading ? (
          <div className="text-[#EEEEEE]/50 text-center py-20">Loading reports...</div>
        ) : reports.length === 0 ? (
          <div className="text-center py-20">
            <FileText size={48} className="mx-auto mb-4 text-[#EEEEEE]/20" />
            <p className="text-[#EEEEEE]/50">No reports yet. Trigger one with <code className="bg-[#313131] px-2 py-1 rounded text-sm">/report five_bucks</code> in Telegram.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <Link
                key={r.id}
                href={`/report/${r.id}`}
                className="flex items-center gap-4 bg-[#313131] rounded-xl p-5 border border-[#444] hover:border-[#FF0100]/50 transition-colors"
              >
                <FileText size={24} className="text-[#FF0100] shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[#EEEEEE] truncate">{r.client_name} — {r.month_label}</div>
                  <div className="text-[#EEEEEE]/40 text-sm truncate">{r.subject_line || "No subject"}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {statusIcon(r.status)}
                  <span className="text-xs text-[#EEEEEE]/50 capitalize">{r.status}</span>
                </div>
                <div className="text-xs text-[#EEEEEE]/30 shrink-0">
                  {new Date(r.created_at).toLocaleDateString()}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
