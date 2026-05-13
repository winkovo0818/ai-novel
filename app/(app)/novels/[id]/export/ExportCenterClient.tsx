"use client";

import { useState } from "react";

type Format = "markdown" | "txt" | "docx" | "epub";

interface FormatMeta {
  id: Format;
  label: string;
  extension: string;
  description: string;
  useCase: string;
  icon: React.ReactNode;
}

const FORMATS: FormatMeta[] = [
  {
    id: "markdown",
    label: "Markdown",
    extension: ".md",
    description: "纯文本，保留章节层级与硬换行。",
    useCase: "适合二次编辑、版本控制、上传到博客或文档站。",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    id: "txt",
    label: "纯文本",
    extension: ".txt",
    description: "无格式纯文本，章节标题前有空行分隔。",
    useCase: "适合上传到部分网络小说平台、做朗读 / 校对原稿。",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
      </svg>
    ),
  },
  {
    id: "docx",
    label: "Word 文档",
    extension: ".docx",
    description: "标准 Word 格式，章节为一级标题。",
    useCase: "适合发给责编、打印、做线下排版与批注。",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-6 4h4m1-13H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-4z" />
      </svg>
    ),
  },
  {
    id: "epub",
    label: "电子书",
    extension: ".epub",
    description: "EPUB 3，可在主流阅读器分章浏览。",
    useCase: "适合在 Kindle / Apple Books / 微信读书等设备试读全本。",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
];

interface ExportCenterClientProps {
  novelId: string;
  disabled?: boolean;
}

export function ExportCenterClient({ novelId, disabled = false }: ExportCenterClientProps) {
  const [pending, setPending] = useState<Format | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastDownload, setLastDownload] = useState<{ format: Format; filename: string } | null>(null);
  const [range, setRange] = useState("");
  const [includeBible, setIncludeBible] = useState(false);

  async function handleExport(format: Format) {
    if (pending || disabled) return;
    setPending(format);
    setError(null);
    try {
      const params = new URLSearchParams({ format });
      if (range.trim()) params.set("range", range.trim());
      if (includeBible) params.set("include_bible", "true");
      const res = await fetch(`/api/novels/${novelId}/export?${params.toString()}`);
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError(json?.error?.message ?? "导出失败，请稍后重试");
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/);
      const meta = FORMATS.find((f) => f.id === format)!;
      const filename = match ? decodeURIComponent(match[1]) : `novel${meta.extension}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setLastDownload({ format, filename });
    } catch {
      setError("导出失败，请检查网络连接");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700"
        >
          {error}
        </div>
      )}

      {lastDownload && !error && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700"
        >
          已下载 <span className="font-semibold">{lastDownload.filename}</span>。如未自动保存，请检查浏览器下载栏。
        </div>
      )}

      <div className="card bg-white p-5">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <label className="block">
            <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-text-dim mb-2">
              章节范围
            </span>
            <input
              value={range}
              onChange={(event) => setRange(event.target.value)}
              placeholder="全部章节，或输入 1-10 / 1,3,5-8"
              disabled={disabled || pending !== null}
              className="w-full rounded-xl border border-border-strong bg-secondary/30 px-4 py-3 text-sm text-text-primary outline-none transition focus:border-primary disabled:opacity-50"
            />
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-border-strong bg-secondary/30 px-4 py-3 text-sm text-text-muted">
            <input
              type="checkbox"
              checked={includeBible}
              onChange={(event) => setIncludeBible(event.target.checked)}
              disabled={disabled || pending !== null}
              className="h-4 w-4 rounded border-border-strong text-primary focus:ring-primary"
            />
            附带作品 Bible
          </label>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {FORMATS.map((meta) => {
          const isPending = pending === meta.id;
          return (
            <div
              key={meta.id}
              className="card bg-white flex flex-col gap-5 p-6 transition-all hover:shadow-premium hover:border-primary/20"
            >
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center text-text-secondary">
                  {meta.icon}
                </div>
                <div className="flex flex-col">
                  <h3 className="text-[15px] font-bold text-text-primary">{meta.label}</h3>
                  <p className="text-[11px] font-mono text-text-dim uppercase tracking-wider">
                    {meta.extension}
                  </p>
                </div>
              </div>
              <div className="flex-1 space-y-2">
                <p className="text-sm text-text-muted leading-relaxed">{meta.description}</p>
                <p className="text-[12px] text-text-dim leading-relaxed">{meta.useCase}</p>
              </div>
              <button
                type="button"
                onClick={() => handleExport(meta.id)}
                disabled={disabled || pending !== null}
                className="btn-primary w-full justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isPending ? (
                  <>
                    <svg
                      className="w-4 h-4 animate-spin"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <circle cx="12" cy="12" r="10" strokeWidth={3} opacity="0.25" />
                      <path strokeLinecap="round" strokeWidth={3} d="M22 12a10 10 0 01-10 10" />
                    </svg>
                    正在打包…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    下载 {meta.extension}
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
