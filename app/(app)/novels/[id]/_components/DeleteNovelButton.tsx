"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteNovelButton({ novelId, novelTitle }: { novelId: string; novelTitle: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    if (!confirming) {
      setConfirming(true);
      setError("");
      return;
    }
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/novels/${novelId}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error?.message ?? "删除失败");
        setDeleting(false);
        setConfirming(false);
        return;
      }
      router.push("/novels");
    } catch {
      setError("网络连接异常");
      setDeleting(false);
      setConfirming(false);
    }
  }

  function handleCancel() {
    setConfirming(false);
    setError("");
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-red-600 font-medium">确认删除「{novelTitle}」？此操作不可撤销。</span>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="h-8 px-4 rounded-full bg-red-500 text-white text-[11px] font-bold shadow-sm hover:bg-red-600 transition-colors active:scale-95 disabled:opacity-40"
        >
          {deleting ? "删除中…" : "删除"}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={deleting}
          className="h-8 px-4 rounded-full border border-border-strong text-text-secondary text-[11px] font-bold hover:bg-secondary transition-colors active:scale-95 disabled:opacity-40"
        >
          取消
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-[11px] text-red-600 font-medium">{error}</span>}
      <button
        type="button"
        onClick={handleDelete}
        className="group flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-text-dim hover:text-red-500 transition-colors duration-300"
      >
        <div className="h-7 w-7 rounded-full border border-border-strong flex items-center justify-center group-hover:border-red-200 group-hover:bg-red-50 transition-colors">
          <svg aria-hidden="true" className="w-3 h-3 transition-transform duration-300 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </div>
        删除作品
      </button>
    </div>
  );
}