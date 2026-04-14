"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Save, Undo2, Send, Plus, Type, Eye, Pencil, Check, X, Loader2 } from "lucide-react";

export default function ReportEditor() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const htmlRef = useRef(""); // Track current HTML without re-renders
  const loadedRef = useRef(false);

  const [originalHtml, setOriginalHtml] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [recipients, setRecipients] = useState<string[]>([""]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [showSendPanel, setShowSendPanel] = useState(false);
  const [status, setStatus] = useState("");
  const [metadata, setMetadata] = useState<Record<string, string>>({});
  const [, setDirtyFlag] = useState(0); // Force re-render for hasChanges check

  // Load report
  useEffect(() => {
    fetch(`/api/reports/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.html) {
          htmlRef.current = d.html;
          setOriginalHtml(d.html);
          setHistory([d.html]);
        }
        if (d.subject_line) setSubject(d.subject_line);
        if (d.client_email) setRecipients([d.client_email]);
        if (d.status === "sent") setSent(true);
        setMetadata(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  // Read current HTML from iframe (for save/send/undo)
  const getCurrentHtml = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return htmlRef.current;
    // Strip contenteditable attributes before extracting
    const clone = doc.documentElement.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("[contenteditable]").forEach((el) => {
      el.removeAttribute("contenteditable");
    });
    // Remove the injected style tag
    clone.querySelectorAll("style[data-editor]").forEach((el) => el.remove());
    return "<!DOCTYPE html><html>" + clone.innerHTML + "</html>";
  }, []);

  // Inject HTML into iframe — ONLY on initial load or mode change
  const injectHtml = useCallback((htmlContent: string, editable: boolean) => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;

    doc.open();
    if (editable) {
      const editableHtml = htmlContent.replace(
        /(<(?:div|p|span|h[1-6]|li|td|th|strong|em|a)(?:\s[^>]*)?)>/gi,
        '$1 contenteditable="true">'
      );
      doc.write(
        `<style data-editor>
          [contenteditable="true"]:hover { outline: 2px dashed #FEFE04; outline-offset: 2px; cursor: text; }
          [contenteditable="true"]:focus { outline: 2px solid #FF0100; outline-offset: 2px; background: rgba(255,1,0,0.03); }
          body { margin: 0; }
        </style>` + editableHtml
      );
    } else {
      doc.write(htmlContent);
    }
    doc.close();

    if (editable) {
      // Track edits via ref (no re-render, no cursor jump)
      doc.addEventListener("input", () => {
        htmlRef.current = getCurrentHtml();
        setDirtyFlag((n) => n + 1); // Trigger re-render for Save button state
      });
    }
  }, [getCurrentHtml]);

  // Inject on load + mode switch
  useEffect(() => {
    if (!htmlRef.current || loading) return;
    if (!loadedRef.current || mode) {
      injectHtml(htmlRef.current, mode === "edit");
      loadedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, mode]);

  const pushHistory = useCallback(() => {
    const current = getCurrentHtml();
    setHistory((prev) => [...prev, current]);
  }, [getCurrentHtml]);

  const undo = useCallback(() => {
    if (history.length > 1) {
      const prev = [...history];
      prev.pop();
      setHistory(prev);
      const restored = prev[prev.length - 1];
      htmlRef.current = restored;
      injectHtml(restored, mode === "edit");
    }
  }, [history, mode, injectHtml]);

  const save = async () => {
    setSaving(true);
    pushHistory();
    const currentHtml = getCurrentHtml();
    try {
      await fetch(`/api/reports/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: currentHtml, metadata: { ...metadata, subject_line: subject } }),
      });
      setOriginalHtml(currentHtml);
      setStatus("Saved!");
      setTimeout(() => setStatus(""), 2000);
    } catch {
      setStatus("Save failed");
    }
    setSaving(false);
  };

  const addRecipient = () => setRecipients((prev) => [...prev, ""]);
  const removeRecipient = (i: number) => setRecipients((prev) => prev.filter((_, idx) => idx !== i));
  const updateRecipient = (i: number, val: string) =>
    setRecipients((prev) => prev.map((r, idx) => (idx === i ? val : r)));

  const sendReport = async () => {
    const validRecipients = recipients.filter((r) => r.includes("@"));
    if (validRecipients.length === 0) { setStatus("Add at least one email"); return; }
    if (!subject.trim()) { setStatus("Add a subject line"); return; }

    setSending(true);
    const currentHtml = getCurrentHtml();
    try {
      const resp = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: id, recipients: validRecipients, subject, html: currentHtml }),
      });
      const data = await resp.json();
      if (data.success) {
        setSent(true);
        setShowSendPanel(false);
        setStatus("Report sent!");
      } else {
        setStatus("Send failed: " + (data.error || "unknown"));
      }
    } catch {
      setStatus("Send failed");
    }
    setSending(false);
  };

  const addTextBlock = () => {
    pushHistory();
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const newDiv = doc.createElement("div");
    newDiv.style.cssText = "padding:16px 40px;font-size:15px;color:#333;";
    newDiv.setAttribute("contenteditable", "true");
    newDiv.textContent = "Click to edit this text...";
    const body = doc.querySelector("body > div") || doc.body;
    const footer = body.querySelector('div[style*="1a2332"]:last-of-type');
    if (footer) body.insertBefore(newDiv, footer);
    else body.appendChild(newDiv);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center">
        <Loader2 className="animate-spin text-[#FF0100]" size={32} />
      </div>
    );
  }

  const hasChanges = htmlRef.current !== originalHtml;

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-[#EEEEEE] flex flex-col">
      {/* Toolbar */}
      <header className="border-b border-[#333] px-4 py-3 flex items-center gap-3 bg-[#1a1a1a] sticky top-0 z-50">
        <button onClick={() => router.push("/")} className="p-2 hover:bg-[#313131] rounded-lg transition-colors">
          <ArrowLeft size={18} />
        </button>

        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{metadata.client_name} — {metadata.month_label}</div>
          {sent && <div className="text-xs text-green-500">Sent</div>}
        </div>

        {/* Mode toggle */}
        <div className="flex bg-[#313131] rounded-lg p-0.5">
          <button
            onClick={() => { if (mode === "edit") { htmlRef.current = getCurrentHtml(); } setMode("preview"); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${mode === "preview" ? "bg-[#FF0100] text-white" : "text-[#EEEEEE]/60 hover:text-[#EEEEEE]"}`}
          >
            <Eye size={14} /> Preview
          </button>
          <button
            onClick={() => { pushHistory(); setMode("edit"); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${mode === "edit" ? "bg-[#FF0100] text-white" : "text-[#EEEEEE]/60 hover:text-[#EEEEEE]"}`}
          >
            <Pencil size={14} /> Edit
          </button>
        </div>

        {mode === "edit" && (
          <>
            <button onClick={addTextBlock} className="flex items-center gap-1.5 px-3 py-2 bg-[#313131] rounded-lg text-xs font-medium hover:bg-[#444] transition-colors border border-[#444]">
              <Plus size={14} /><Type size={14} />
            </button>
            <button onClick={undo} disabled={history.length <= 1} className="flex items-center gap-1.5 px-3 py-2 bg-[#313131] rounded-lg text-xs font-medium hover:bg-[#444] transition-colors border border-[#444] disabled:opacity-30">
              <Undo2 size={14} /> Undo
            </button>
          </>
        )}

        <button onClick={save} disabled={saving || !hasChanges} className="flex items-center gap-1.5 px-4 py-2 bg-[#313131] rounded-lg text-xs font-semibold hover:bg-[#444] transition-colors border border-[#444] disabled:opacity-30">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
        </button>

        <button onClick={() => setShowSendPanel(!showSendPanel)} className="flex items-center gap-1.5 px-4 py-2 bg-[#FF0100] rounded-lg text-xs font-semibold text-white hover:bg-[#FF0100]/80 transition-colors">
          <Send size={14} /> Send
        </button>

        {status && <div className="text-xs text-[#FEFE04] font-medium animate-pulse">{status}</div>}
      </header>

      {/* Send Panel */}
      {showSendPanel && (
        <div className="border-b border-[#333] bg-[#252525] px-6 py-4">
          <div className="max-w-3xl mx-auto space-y-4">
            <div>
              <label className="text-xs font-semibold text-[#EEEEEE]/60 block mb-1">Email Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#444] rounded-lg px-4 py-2.5 text-sm text-[#EEEEEE] focus:outline-none focus:border-[#FF0100]"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#EEEEEE]/60 block mb-1">Recipients</label>
              {recipients.map((r, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input
                    type="email"
                    value={r}
                    onChange={(e) => updateRecipient(i, e.target.value)}
                    placeholder="email@example.com"
                    className="flex-1 bg-[#1a1a1a] border border-[#444] rounded-lg px-4 py-2.5 text-sm text-[#EEEEEE] focus:outline-none focus:border-[#FF0100]"
                  />
                  {recipients.length > 1 && (
                    <button onClick={() => removeRecipient(i)} className="p-2 text-[#EEEEEE]/40 hover:text-[#FF0100]">
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
              <button onClick={addRecipient} className="text-xs text-[#FF0100] hover:text-[#FF0100]/80 font-medium">
                + Add recipient
              </button>
            </div>
            <div className="flex gap-3">
              <button
                onClick={sendReport}
                disabled={sending}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#FF0100] rounded-lg text-sm font-semibold text-white hover:bg-[#FF0100]/80 transition-colors disabled:opacity-50"
              >
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {sending ? "Sending..." : "Send Report"}
              </button>
              <button onClick={() => setShowSendPanel(false)} className="px-4 py-2.5 text-sm text-[#EEEEEE]/60 hover:text-[#EEEEEE]">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Preview/Editor */}
      <div className="flex-1 flex justify-center p-6">
        <div className="w-full max-w-[720px] bg-white rounded-xl overflow-hidden shadow-2xl">
          <iframe
            ref={iframeRef}
            className="w-full border-0"
            style={{ minHeight: "calc(100vh - 200px)" }}
            title="Report Preview"
          />
        </div>
      </div>
    </div>
  );
}
