"use client";

import { useState, useRef, useEffect } from "react";

interface ExportMenuProps {
  novelId: string;
}

export function ExportMenu({ novelId }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function handleExport(format: "markdown" | "txt") {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/novels/${novelId}/export?format=${format}`);
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        alert(json?.error?.message ?? "导出失败，请稍后重试");
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/);
      const filename = match ? decodeURIComponent(match[1]) : `novel${format === "markdown" ? ".md" : ".txt"}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("导出失败，请检查网络连接");
    } finally {
      setExporting(false);
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        disabled={exporting}
        className="p-2 rounded-lg transition-all text-text-muted hover:bg-secondary hover:text-text-primary disabled:opacity-40"
        title="导出小说"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-40 bg-white rounded-lg shadow-xl border border-border-strong z-50 overflow-hidden animate-fade-in-up">
          <button
            onClick={() => handleExport("markdown")}
            disabled={exporting}
            className="w-full px-4 py-3 text-left text-sm font-medium text-text-primary hover:bg-primary/5 transition-colors flex items-center gap-2 disabled:opacity-40"
          >
            <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Markdown (.md)
          </button>
          <div className="h-px bg-border-strong mx-3" />
          <button
            onClick={() => handleExport("txt")}
            disabled={exporting}
            className="w-full px-4 py-3 text-left text-sm font-medium text-text-primary hover:bg-primary/5 transition-colors flex items-center gap-2 disabled:opacity-40"
          >
            <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            纯文本 (.txt)
          </button>
        </div>
      )}
    </div>
  );
}