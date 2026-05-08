"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { NovelCard } from "@/components/ui/NovelCard";
import { LoadingState, EmptyState } from "@/components/ui/StatusStates";

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
      const res = await fetch("/api/novels");
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const json = await res.json();
      if (!json.ok) {
        setError(json.error?.message ?? "加载失败");
        setLoading(false);
        return;
      }
      setNovels(json.data);
    } catch (err) {
      setError("网络连接异常，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-secondary/20 custom-scrollbar">
      <div className="p-8 md:p-12 lg:p-16 max-w-7xl mx-auto min-h-full">
        <PageHeader 
          title="我的创作书架" 
          description="在此管理您的所有文学项目，追踪进度并继续编织故事。"
          actions={
            <a href="/new" className="btn-primary gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              初始化新作品
            </a>
          }
        />

        <div className="mt-12">
          {loading ? (
            <div className="py-32">
              <LoadingState message="正在同步您的创作云端数据..." />
            </div>
          ) : error ? (
            <div className="card border-red-100 bg-red-50 p-12 text-center animate-fade-in-up">
              <div className="h-12 w-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-sm font-bold text-red-700 mb-6">检测到连接故障</p>
              <p className="text-xs text-red-600 mb-10 opacity-80">{error}</p>
              <button onClick={fetchNovels} className="btn-secondary">尝试重新连接</button>
            </div>
          ) : novels.length === 0 ? (
            <div className="animate-fade-in-up">
              <EmptyState 
                title="书架目前空无一物" 
                description="优秀的文学作品往往源于一个不经意的灵感。现在就开始您的创作之旅。"
                icon={
                  <div className="h-24 w-24 bg-white rounded-full flex items-center justify-center shadow-lg border border-border-subtle relative overflow-hidden group">
                    <div className="absolute inset-0 bg-primary/5 group-hover:scale-150 transition-transform duration-700" />
                    <svg className="w-10 h-10 text-primary relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                }
                action={
                  <a href="/new" className="btn-primary px-10 h-12 text-base shadow-xl shadow-text-primary/10">
                    开启首个文学项目
                  </a>
                }
              />
            </div>
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
                />
              ))}
              
              {/* Add a decorative "New Project" placeholder card at the end */}
              <a 
                href="/new" 
                className="group border-2 border-dashed border-border-strong rounded-xl flex flex-col items-center justify-center p-8 min-h-[220px] hover:border-primary/40 hover:bg-white transition-all duration-500"
              >
                <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center group-hover:bg-primary/10 group-hover:scale-110 transition-all duration-500 mb-4">
                  <svg className="w-6 h-6 text-text-muted group-hover:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <span className="text-sm font-bold text-text-muted group-hover:text-primary transition-colors">初始化新项目</span>
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
