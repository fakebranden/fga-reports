"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Save, Undo2, Redo2, Send, Plus, Type, Eye, Pencil, Check, X, Loader2, ImagePlus, Heading, GripVertical, ChevronUp, ChevronDown, Trash2, FileUp, Upload, Download } from "lucide-react";

export default function ReportEditor() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const htmlRef = useRef("");
  const loadedRef = useRef(false);

  const [originalHtml, setOriginalHtml] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [subject, setSubject] = useState("");
  const [recipients, setRecipients] = useState<string[]>([""]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [showSendPanel, setShowSendPanel] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showImageInput, setShowImageInput] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [status, setStatus] = useState("");
  const [metadata, setMetadata] = useState<Record<string, string>>({});
  const [, setDirtyFlag] = useState(0);
  const [sections, setSections] = useState<{ id: string; label: string; el?: string }[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [showReorder, setShowReorder] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const brandColor = metadata.brand_color || "#800020";

  useEffect(() => {
    fetch(`/api/reports/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.html) {
          htmlRef.current = d.html;
          setOriginalHtml(d.html);
          setHistory([d.html]);
          setHistoryIndex(0);
        }
        if (d.subject_line) setSubject(d.subject_line);
        if (d.client_email) setRecipients([d.client_email]);
        if (d.status === "sent") setSent(true);
        setMetadata(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  const extractHtmlFromIframe = useCallback((): string => {
    // Try multiple methods to read iframe content
    try {
      const iframe = iframeRef.current;
      if (!iframe) return htmlRef.current;

      // Method 1: contentDocument
      let doc = iframe.contentDocument;
      // Method 2: contentWindow.document
      if (!doc) doc = iframe.contentWindow?.document || null;
      if (!doc || !doc.body) return htmlRef.current;

      // Use XMLSerializer for more reliable serialization
      const serializer = new XMLSerializer();
      let raw = serializer.serializeToString(doc);

      // Strip editor artifacts from the serialized string
      raw = raw.replace(/\s*contenteditable="true"/gi, "");
      raw = raw.replace(/\s*contenteditable=""/gi, "");
      raw = raw.replace(/\s*contentEditable="true"/gi, "");
      raw = raw.replace(/<style[^>]*data-editor[^>]*>[\s\S]*?<\/style>/gi, "");
      raw = raw.replace(/\s*data-section-id="[^"]*"/gi, "");

      // XMLSerializer wraps in xmlns — strip it for clean HTML
      raw = raw.replace(/\s*xmlns="[^"]*"/gi, "");

      // Ensure it starts with DOCTYPE
      if (!raw.startsWith("<!DOCTYPE")) {
        raw = "<!DOCTYPE html>" + raw;
      }

      return raw;
    } catch {
      return htmlRef.current;
    }
  }, []);

  const getCurrentHtml = useCallback(() => {
    const html = extractHtmlFromIframe();
    htmlRef.current = html;
    return html;
  }, [extractHtmlFromIframe]);

  const parseSections = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const container = doc.querySelector("body > div");
    if (!container) return;
    const kids = Array.from(container.children) as HTMLElement[];
    const secs: { id: string; label: string }[] = [];
    kids.forEach((el, i) => {
      const sid = "section-" + i;
      el.setAttribute("data-section-id", sid);
      let label = el.textContent?.substring(0, 50)?.trim() || "Section " + (i + 1);
      const header = el.querySelector('div[style*="font-weight:700"], div[style*="font-weight:900"]');
      if (header) label = header.textContent?.substring(0, 50)?.trim() || label;
      secs.push({ id: sid, label });
    });
    setSections(secs);
  }, []);

  // Helper: strip controls from DOM, extract clean HTML, then re-add controls
  const getCleanHtml = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (doc) doc.querySelectorAll(".section-controls").forEach((el) => el.remove());
    const html = extractHtmlFromIframe();
    return html;
  }, [extractHtmlFromIframe]);

  // Add floating control buttons to each section in the iframe
  const addSectionControls = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const container = doc.querySelector("body > div");
    if (!container) return;

    // Remove existing controls
    doc.querySelectorAll(".section-controls").forEach((el) => el.remove());

    const kids = Array.from(container.children) as HTMLElement[];
    const total = kids.length;

    // Find footer indices to protect them from move-down and to skip controls
    const footerIndices = new Set<number>();
    kids.forEach((el, i) => {
      const bg = el.style.background || el.style.backgroundColor || "";
      if (bg.includes("1a2332") || bg.includes("rgb(26, 35, 50)")) footerIndices.add(i);
    });
    // First editable section index (after header)
    let firstEditable = 0;
    for (let i = 0; i < kids.length; i++) {
      if (!footerIndices.has(i)) { firstEditable = i; break; }
    }
    // Last editable section index (before footer)
    let lastEditable = total - 1;
    for (let i = total - 1; i >= 0; i--) {
      if (!footerIndices.has(i)) { lastEditable = i; break; }
    }

    kids.forEach((section, i) => {
      // Skip dark header/footer
      if (footerIndices.has(i)) return;

      section.style.position = "relative";

      const controls = doc.createElement("div");
      controls.className = "section-controls";
      controls.style.cssText = "position:absolute;top:4px;right:4px;display:flex;gap:2px;opacity:0;transition:opacity 0.15s;z-index:999;";

      const makeBtn = (label: string, title: string) => {
        const btn = doc.createElement("button");
        btn.innerHTML = label;
        btn.title = title;
        btn.style.cssText = "width:26px;height:26px;border:none;border-radius:4px;background:rgba(0,0,0,0.7);color:#fff;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;padding:0;line-height:1;";
        btn.onmouseenter = () => { btn.style.background = "rgba(255,1,0,0.9)"; };
        btn.onmouseleave = () => { btn.style.background = "rgba(0,0,0,0.7)"; };
        return btn;
      };

      // Up button (not on first editable section)
      if (i > firstEditable) {
        const upBtn = makeBtn("&#9650;", "Move up");
        upBtn.onclick = (e) => {
          e.stopPropagation();
          pushHistory();
          const prevSibling = section.previousElementSibling;
          if (prevSibling) container.insertBefore(section, prevSibling);
          // Re-extract clean HTML and re-inject to prevent DOM corruption
          const clean = getCleanHtml();
          htmlRef.current = clean;
          injectHtml(clean, true);
          setDirtyFlag((n) => n + 1);
        };
        controls.appendChild(upBtn);
      }

      // Down button (not on last editable section — don't move into footer)
      if (i < lastEditable) {
        const downBtn = makeBtn("&#9660;", "Move down");
        downBtn.onclick = (e) => {
          e.stopPropagation();
          pushHistory();
          const nextSibling = section.nextElementSibling;
          // Don't move into footer
          const nextBg = (nextSibling as HTMLElement)?.style?.background || "";
          if (nextSibling && !nextBg.includes("1a2332")) {
            if (nextSibling.nextSibling) {
              container.insertBefore(section, nextSibling.nextSibling);
            } else {
              container.appendChild(section);
            }
          }
          const clean = getCleanHtml();
          htmlRef.current = clean;
          injectHtml(clean, true);
          setDirtyFlag((n) => n + 1);
        };
        controls.appendChild(downBtn);
      }

      // Delete button
      const delBtn = makeBtn("&#10005;", "Delete section");
      delBtn.onclick = (e) => {
        e.stopPropagation();
        pushHistory();
        section.remove();
        // Re-inject from clean HTML to prevent footer merging
        const clean = getCleanHtml();
        htmlRef.current = clean;
        injectHtml(clean, true);
        setDirtyFlag((n) => n + 1);
      };
      controls.appendChild(delBtn);

      section.appendChild(controls);

      // Show on hover
      section.onmouseenter = () => { controls.style.opacity = "1"; };
      section.onmouseleave = () => { controls.style.opacity = "0"; };
    });
  }, [extractHtmlFromIframe]);

  const injectHtml = useCallback((htmlContent: string, editable: boolean) => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;

    doc.open();
    doc.write(
      (editable
        ? `<style data-editor>
            [contenteditable="true"]:hover { outline: 2px dashed #FEFE04; outline-offset: 2px; cursor: text; }
            [contenteditable="true"]:focus { outline: 2px solid #FF0100; outline-offset: 2px; background: rgba(255,1,0,0.03); }
            body { margin: 0; }
            [data-section-id] { position: relative; }
            .section-controls { pointer-events: auto; }
          </style>`
        : "") + htmlContent
    );
    doc.close();

    if (editable) {
      // Make elements editable via DOM — skip header/footer
      const container = doc.querySelector("body > div");
      if (container) {
        const kids = Array.from(container.children) as HTMLElement[];
        kids.forEach((section) => {
          const bg = section.style.background || section.style.backgroundColor || "";
          if (bg.includes("1a2332") || bg.includes("rgb(26, 35, 50)")) return;
          const editables = section.querySelectorAll("div, p, span, h1, h2, h3, h4, h5, h6, li, td, th");
          editables.forEach((el) => {
            const elBg = (el as HTMLElement).style.background || (el as HTMLElement).style.backgroundColor || "";
            if (elBg.includes("1a2332") || elBg.includes("rgb(26, 35, 50)")) return;
            if (el.children.length === 0 || el.textContent?.trim()) {
              (el as HTMLElement).contentEditable = "true";
            }
          });
        });
      }

      doc.addEventListener("input", () => {
        htmlRef.current = extractHtmlFromIframe();
        setDirtyFlag((n) => n + 1);
      });

      setTimeout(() => {
        parseSections();
        addSectionControls();
      }, 100);
    }
  }, [extractHtmlFromIframe, parseSections, addSectionControls]);

  useEffect(() => {
    if (!htmlRef.current || loading) return;
    if (!loadedRef.current || mode) {
      injectHtml(htmlRef.current, mode === "edit");
      loadedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, mode]);

  const pushHistory = useCallback(() => {
    const current = extractHtmlFromIframe();
    // Truncate any redo history beyond current index
    setHistory((prev) => {
      const truncated = prev.slice(0, historyIndex + 1);
      const next = [...truncated, current];
      setHistoryIndex(next.length - 1);
      return next;
    });
  }, [extractHtmlFromIframe, historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const restored = history[newIndex];
      setHistoryIndex(newIndex);
      htmlRef.current = restored;
      injectHtml(restored, mode === "edit");
    }
  }, [history, historyIndex, mode, injectHtml]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      const restored = history[newIndex];
      setHistoryIndex(newIndex);
      htmlRef.current = restored;
      injectHtml(restored, mode === "edit");
    }
  }, [history, historyIndex, mode, injectHtml]);

  const save = async () => {
    // Extract HTML from iframe BEFORE any state changes (re-renders can reset iframe)
    const htmlToSave = extractHtmlFromIframe();
    htmlRef.current = htmlToSave;
    pushHistory();
    setSaving(true);
    try {
      const resp = await fetch(`/api/reports/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: htmlToSave, metadata: { subject_line: subject } }),
      });
      const data = await resp.json();
      if (data.success !== false) {
        setOriginalHtml(htmlToSave);
        setStatus(`Saved! (${Math.round(htmlToSave.length / 1024)}KB)`);
      } else {
        setStatus("Save failed: " + (data.error || "unknown"));
      }
      setTimeout(() => setStatus(""), 3000);
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
    // Extract HTML BEFORE state changes
    const currentHtml = extractHtmlFromIframe();
    htmlRef.current = currentHtml;
    setSending(true);
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

  const insertBeforeFooter = (el: HTMLElement) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const body = doc.querySelector("body > div") || doc.body;
    const footer = body.querySelector('div[style*="1a2332"]:last-of-type');
    if (footer) body.insertBefore(el, footer);
    else body.appendChild(el);
    htmlRef.current = getCurrentHtml();
    setDirtyFlag((n) => n + 1);
    parseSections();
  };

  const addTextBlock = () => {
    pushHistory();
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const div = doc.createElement("div");
    div.style.cssText = "padding:16px 40px;font-size:15px;line-height:1.7;color:#333;";
    div.setAttribute("contenteditable", "true");
    div.textContent = "Click to edit this text...";
    insertBeforeFooter(div);
    setShowAddMenu(false);
  };

  const addHeaderBlock = () => {
    pushHistory();
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const wrapper = doc.createElement("div");
    wrapper.style.cssText = "padding:0 40px 16px;";
    const header = doc.createElement("div");
    header.style.cssText = `background:${brandColor};border-radius:8px;padding:14px 20px;`;
    header.setAttribute("contenteditable", "true");
    const title = doc.createElement("div");
    title.style.cssText = "color:#fff;font-size:18px;font-weight:700;";
    title.textContent = "New Section Title";
    header.appendChild(title);
    wrapper.appendChild(header);
    insertBeforeFooter(wrapper);
    setShowAddMenu(false);
  };

  const addImageBlock = () => {
    if (!imageUrl.trim()) return;
    pushHistory();
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const wrapper = doc.createElement("div");
    wrapper.style.cssText = "padding:0 40px 16px;text-align:center;";
    const img = doc.createElement("img");
    img.src = imageUrl.trim();
    img.alt = "Report image";
    img.style.cssText = "max-width:100%;border-radius:8px;";
    wrapper.appendChild(img);
    insertBeforeFooter(wrapper);
    setShowAddMenu(false);
    setShowImageInput(false);
    setImageUrl("");
  };

  const moveSection = (index: number, direction: "up" | "down") => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const container = doc.querySelector("body > div");
    if (!container) return;
    const kids = Array.from(container.children);
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= kids.length) return;

    pushHistory();
    const el = kids[index];
    const ref = direction === "up" ? kids[targetIdx] : kids[targetIdx].nextSibling;
    container.insertBefore(el, ref);
    htmlRef.current = getCurrentHtml();
    setDirtyFlag((n) => n + 1);
    parseSections();
  };

  const deleteSection = (index: number) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const container = doc.querySelector("body > div");
    if (!container) return;
    const kids = Array.from(container.children);
    if (index < 0 || index >= kids.length) return;
    pushHistory();
    kids[index].remove();
    htmlRef.current = getCurrentHtml();
    setDirtyFlag((n) => n + 1);
    parseSections();
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files).filter((f) => {
      const valid = ["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp", "text/plain", "text/csv", "application/csv"];
      return valid.includes(f.type) && f.size <= 10 * 1024 * 1024;
    });
    setUploadFiles((prev) => [...prev, ...droppedFiles]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const selected = Array.from(e.target.files).filter((f) => f.size <= 10 * 1024 * 1024);
    setUploadFiles((prev) => [...prev, ...selected]);
    e.target.value = "";
  };

  const removeUploadFile = (index: number) => {
    setUploadFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const analyzeFiles = async () => {
    if (uploadFiles.length === 0) return;
    setAnalyzing(true);
    setStatus("Analyzing documents...");

    try {
      const formData = new FormData();
      uploadFiles.forEach((f) => formData.append("files", f));
      formData.append("reportHtml", getCurrentHtml());
      formData.append("brandColor", brandColor);

      const resp = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      const data = await resp.json();
      if (!resp.ok) {
        setStatus("Analysis failed: " + (data.error || "unknown error"));
        setAnalyzing(false);
        return;
      }

      if (data.html) {
        pushHistory();
        // Merge the analysis HTML directly into htmlRef, then re-inject
        const currentHtml = htmlRef.current;
        // Insert before the last dark footer section
        const footerMatch = currentHtml.lastIndexOf('background:#1a2332');
        let mergedHtml: string;
        if (footerMatch > 0) {
          // Find the opening <div of the footer section
          const divStart = currentHtml.lastIndexOf('<div', footerMatch);
          mergedHtml = currentHtml.substring(0, divStart) + data.html + currentHtml.substring(divStart);
        } else {
          // No footer found, append before </div></body>
          const bodyClose = currentHtml.lastIndexOf('</div></body>');
          if (bodyClose > 0) {
            mergedHtml = currentHtml.substring(0, bodyClose) + data.html + currentHtml.substring(bodyClose);
          } else {
            mergedHtml = currentHtml + data.html;
          }
        }
        htmlRef.current = mergedHtml;
        injectHtml(mergedHtml, mode === "edit");
        setDirtyFlag((n) => n + 1);
        setStatus("Analysis complete! Content added.");
        setTimeout(() => setStatus(""), 3000);
      }
    } catch {
      setStatus("Analysis failed");
    }

    setAnalyzing(false);
    setShowUploadModal(false);
    setUploadFiles([]);
    setShowAddMenu(false);
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
      <header className="border-b border-[#333] px-4 py-3 flex items-center gap-2 bg-[#1a1a1a] sticky top-0 z-50 flex-wrap">
        <button onClick={() => router.push("/")} className="p-2 hover:bg-[#313131] rounded-lg transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{metadata.client_name} — {metadata.month_label}</div>
          {sent && <div className="text-xs text-green-500">Sent</div>}
        </div>

        <div className="flex bg-[#313131] rounded-lg p-0.5">
          <button onClick={() => { if (mode === "edit") htmlRef.current = getCurrentHtml(); setMode("preview"); setShowReorder(false); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${mode === "preview" ? "bg-[#FF0100] text-white" : "text-[#EEEEEE]/60 hover:text-[#EEEEEE]"}`}>
            <Eye size={14} /> Preview
          </button>
          <button onClick={() => { pushHistory(); setMode("edit"); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${mode === "edit" ? "bg-[#FF0100] text-white" : "text-[#EEEEEE]/60 hover:text-[#EEEEEE]"}`}>
            <Pencil size={14} /> Edit
          </button>
        </div>

        {mode === "edit" && (
          <>
            {/* Add menu */}
            <div className="relative">
              <button onClick={() => { setShowAddMenu(!showAddMenu); setShowImageInput(false); }}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#313131] rounded-lg text-xs font-medium hover:bg-[#444] transition-colors border border-[#444]">
                <Plus size={14} /> Add
              </button>
              {showAddMenu && (
                <div className="absolute top-full mt-1 left-0 bg-[#313131] border border-[#444] rounded-lg shadow-xl z-50 w-48">
                  <button onClick={addHeaderBlock} className="flex items-center gap-2 w-full px-3 py-2.5 text-xs hover:bg-[#444] transition-colors rounded-t-lg">
                    <Heading size={14} className="text-[#FF0100]" /> Section Header
                  </button>
                  <button onClick={addTextBlock} className="flex items-center gap-2 w-full px-3 py-2.5 text-xs hover:bg-[#444] transition-colors">
                    <Type size={14} className="text-[#FEFE04]" /> Text Block
                  </button>
                  <button onClick={() => setShowImageInput(!showImageInput)} className="flex items-center gap-2 w-full px-3 py-2.5 text-xs hover:bg-[#444] transition-colors">
                    <ImagePlus size={14} className="text-green-400" /> Image
                  </button>
                  <button onClick={() => { setShowUploadModal(true); setShowAddMenu(false); }} className="flex items-center gap-2 w-full px-3 py-2.5 text-xs hover:bg-[#444] transition-colors rounded-b-lg border-t border-[#444]">
                    <FileUp size={14} className="text-blue-400" /> Upload &amp; Analyze
                  </button>
                  {showImageInput && (
                    <div className="p-2 border-t border-[#444]">
                      <input type="text" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Paste image URL..."
                        className="w-full bg-[#1a1a1a] border border-[#444] rounded px-2 py-1.5 text-xs text-[#EEEEEE] focus:outline-none focus:border-[#FF0100] mb-1.5" />
                      <button onClick={addImageBlock} disabled={!imageUrl.trim()}
                        className="w-full bg-[#FF0100] text-white text-xs py-1.5 rounded font-medium disabled:opacity-30">
                        Insert Image
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button onClick={undo} disabled={historyIndex <= 0}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#313131] rounded-lg text-xs font-medium hover:bg-[#444] transition-colors border border-[#444] disabled:opacity-30">
              <Undo2 size={14} /> Undo
            </button>
            <button onClick={redo} disabled={historyIndex >= history.length - 1}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#313131] rounded-lg text-xs font-medium hover:bg-[#444] transition-colors border border-[#444] disabled:opacity-30">
              <Redo2 size={14} /> Redo
            </button>
          </>
        )}

        <button onClick={save} disabled={saving || !hasChanges}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#313131] rounded-lg text-xs font-semibold hover:bg-[#444] transition-colors border border-[#444] disabled:opacity-30">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
        </button>
        <button onClick={() => {
          const html = extractHtmlFromIframe();
          const blob = new Blob([html], { type: "text/html" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${(metadata.client_name || "report").replace(/\s+/g, "-")}-${(metadata.month_label || "report").replace(/\s+/g, "-")}.html`;
          a.click();
          URL.revokeObjectURL(url);
        }}
          className="flex items-center gap-1.5 px-3 py-2 bg-[#313131] rounded-lg text-xs font-medium hover:bg-[#444] transition-colors border border-[#444]">
          <Download size={14} /> Download
        </button>
        <button onClick={() => setShowSendPanel(!showSendPanel)}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#FF0100] rounded-lg text-xs font-semibold text-white hover:bg-[#FF0100]/80 transition-colors">
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
              <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#444] rounded-lg px-4 py-2.5 text-sm text-[#EEEEEE] focus:outline-none focus:border-[#FF0100]" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#EEEEEE]/60 block mb-1">Recipients</label>
              {recipients.map((r, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input type="email" value={r} onChange={(e) => updateRecipient(i, e.target.value)} placeholder="email@example.com"
                    className="flex-1 bg-[#1a1a1a] border border-[#444] rounded-lg px-4 py-2.5 text-sm text-[#EEEEEE] focus:outline-none focus:border-[#FF0100]" />
                  {recipients.length > 1 && (
                    <button onClick={() => removeRecipient(i)} className="p-2 text-[#EEEEEE]/40 hover:text-[#FF0100]"><X size={16} /></button>
                  )}
                </div>
              ))}
              <button onClick={addRecipient} className="text-xs text-[#FF0100] hover:text-[#FF0100]/80 font-medium">+ Add recipient</button>
            </div>
            <div className="flex gap-3">
              <button onClick={sendReport} disabled={sending}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#FF0100] rounded-lg text-sm font-semibold text-white hover:bg-[#FF0100]/80 transition-colors disabled:opacity-50">
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {sending ? "Sending..." : "Send Report"}
              </button>
              <button onClick={() => setShowSendPanel(false)} className="px-4 py-2.5 text-sm text-[#EEEEEE]/60 hover:text-[#EEEEEE]">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Upload & Analyze Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4" onClick={() => { if (!analyzing) { setShowUploadModal(false); setUploadFiles([]); } }}>
          <div className="bg-[#252525] rounded-xl border border-[#444] shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#444]">
              <div className="flex items-center gap-2">
                <FileUp size={18} className="text-blue-400" />
                <span className="font-semibold text-sm">Upload &amp; Analyze</span>
              </div>
              <button onClick={() => { if (!analyzing) { setShowUploadModal(false); setUploadFiles([]); } }} className="p-1 hover:bg-[#444] rounded transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  dragOver ? "border-blue-400 bg-blue-400/10" : "border-[#555] hover:border-[#777]"
                }`}
              >
                <Upload size={32} className="mx-auto mb-3 text-[#EEEEEE]/40" />
                <div className="text-sm text-[#EEEEEE]/70 mb-1">Drop files here or click to browse</div>
                <div className="text-xs text-[#EEEEEE]/40">PDF, PNG, JPG, CSV, TXT -- Max 10MB per file</div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.csv,.txt,.gif,.webp"
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* File list */}
              {uploadFiles.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-[#EEEEEE]/50 uppercase tracking-wider">
                    {uploadFiles.length} file{uploadFiles.length > 1 ? "s" : ""} selected
                  </div>
                  {uploadFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 bg-[#313131] rounded-lg px-3 py-2 border border-[#444]">
                      <FileUp size={14} className="text-blue-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-[#EEEEEE]/80 truncate">{f.name}</div>
                        <div className="text-[10px] text-[#EEEEEE]/40">{(f.size / 1024).toFixed(0)} KB</div>
                      </div>
                      {!analyzing && (
                        <button onClick={() => removeUploadFile(i)} className="p-1 hover:bg-[#444] rounded text-[#EEEEEE]/40 hover:text-[#FF0100]">
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Analyze button */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={analyzeFiles}
                  disabled={uploadFiles.length === 0 || analyzing}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 rounded-lg text-sm font-semibold text-white hover:bg-blue-500 transition-colors disabled:opacity-40"
                >
                  {analyzing ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <FileUp size={16} />
                      Analyze &amp; Insert
                    </>
                  )}
                </button>
                {!analyzing && (
                  <button
                    onClick={() => { setShowUploadModal(false); setUploadFiles([]); }}
                    className="px-4 py-2.5 text-sm text-[#EEEEEE]/60 hover:text-[#EEEEEE]"
                  >
                    Cancel
                  </button>
                )}
              </div>

              {analyzing && (
                <div className="text-xs text-[#EEEEEE]/50 text-center animate-pulse">
                  Claude is analyzing your documents and writing report content...
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex gap-0">
        {/* Report Preview/Editor */}
        <div className="flex-1 flex justify-center p-6">
          <div className="w-full max-w-[720px] bg-white rounded-xl overflow-hidden shadow-2xl">
            <iframe ref={iframeRef} className="w-full border-0" style={{ minHeight: "calc(100vh - 200px)" }} title="Report Preview" />
          </div>
        </div>
      </div>
    </div>
  );
}
