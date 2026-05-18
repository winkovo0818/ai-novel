"use client";

import { useState } from "react";

export function EditableTitle({ novelId, initialTitle }: { novelId: string; initialTitle: string }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function startEdit() {
    setEditing(true);
    setError("");
  }

  async function save() {
    const trimmed = title.trim();
    if (!trimmed) {
      setError("标题不能为空");
      return;
    }
    if (trimmed === initialTitle) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/novels/${novelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error?.message ?? "保存失败");
        return;
      }
      setTitle(trimmed);
      setEditing(false);
    } catch {
      setError("网络连接异常");
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setTitle(initialTitle);
    setEditing(false);
    setError("");
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
            maxLength={120}
            autoFocus
            className="text-3xl md:text-4xl font-bold tracking-tight text-text-primary bg-white border border-accent/40 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/30 w-full max-w-2xl"
            disabled={saving}
          />
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="h-10 px-4 rounded-full bg-text-primary text-white text-[12px] font-bold hover:bg-accent shadow-sm hover:shadow-md transition-[background-color,box-shadow] active:scale-95 disabled:opacity-40 shrink-0"
          >
            {saving ? "保存中…" : "保存"}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={saving}
            className="h-10 px-4 rounded-full border border-border-strong text-text-secondary text-[12px] font-bold hover:bg-secondary transition-colors active:scale-95 disabled:opacity-40 shrink-0"
          >
            取消
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="group/title inline-flex items-center gap-2">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-text-primary">
        {title}
      </h1>
      <button
        type="button"
        onClick={startEdit}
        className="opacity-0 group-hover/title:opacity-100 transition-opacity duration-200 h-7 w-7 rounded-full flex items-center justify-center text-text-dim hover:text-primary hover:bg-secondary"
        aria-label="编辑标题"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </button>
    </div>
  );
}