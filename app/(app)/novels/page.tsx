"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { NovelCard } from "@/components/ui/NovelCard";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/StatusStates";

interface NovelItem {
  id: string;
  title: string;
  created_at: string;
  chapter_count: number;
  done_count: number;
  has_bible: boolean;
}

export default function NovelsPage() {
  const [novels, setNovels] = useState<NovelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchNovels();
  }, []);

  async function fetchNovels() {
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/api/novels");
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const json = await res.json();
      if (!json.ok) {
        setError(json.error?.message ?? "加载失败");
        return;
      }
      setNovels(json.data);
    } catch {
      setError("网络连接异常，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  async function deleteNovel(id: string) {
    const res = await fetch(`/api/novels/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      setError(json?.error?.message ?? "删除失败，请稍后重试");
      return;
    }
    setNovels((prev) => prev.filter((n) => n.id !== id));
  }

  return (
    <div className="flex-1 overflow-y-auto bg-secondary/30 custom-scrollbar">
      <div className="p-8 md:p-12 lg:p-16 max-w-7xl mx-auto min-h-full pb-24">
        <PageHeader 
          title="我的创作书架" 
          description="在此管理您的所有文学项目，追踪进度并继续编织故事。"
          actions={
            <Link href="/new" className="btn-primary gap-2 px-6">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              初始化新作品
            </Link>
          }
        />

        <div className="mt-16">
          {loading ? (
            <div className="py-20">
              <LoadingState message="正在整理您的书架…" />
            </div>
          ) : error ? (
            <ErrorState 
              title="暂时无法访问书架" 
              message={error} 
              onRetry={fetchNovels} 
            />
          ) : novels.length === 0 ? (
            <EmptyState 
              title="书架目前空无一物" 
              description="优秀的文学作品往往源于一个不经意的灵感。现在就开始您的创作之旅。"
              icon={
                <div className="h-20 w-20 bg-white rounded-3xl flex items-center justify-center shadow-premium border border-border-subtle relative overflow-hidden group">
                  <div className="absolute inset-0 bg-primary/5 group-hover:scale-150 transition-transform duration-300" />
                  <svg aria-hidden="true" className="w-8 h-8 text-primary relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
              }
              action={
                <Link href="/new" className="btn-primary px-10 h-11 text-sm shadow-xl shadow-text-primary/10">
                  开启首个文学项目
                </Link>
              }
            />
          ) : (
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 animate-fade-in-up">
              {novels.map((novel) => (
                <NovelCard
                  key={novel.id}
                  id={novel.id}
                  title={novel.title}
                  chapterCount={novel.chapter_count}
                  doneCount={novel.done_count}
                  updatedAt={novel.created_at}
                  hasBible={novel.has_bible}
                  onDelete={deleteNovel}
                />
              ))}
              
              {/* Add a decorative "New Project" placeholder card at the end */}
              <Link
                href="/new"
                className="group border-2 border-dashed border-border-strong rounded-2xl flex flex-col items-center justify-center p-8 min-h-[260px] hover:border-primary/40 hover:bg-white transition duration-300 bg-white/40"
              >
                <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center group-hover:bg-primary/10 group-hover:scale-110 transition duration-300 mb-4">
                  <svg className="w-5 h-5 text-text-dim group-hover:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <span className="text-[13px] font-bold text-text-dim group-hover:text-primary transition-colors">初始化新项目</span>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}