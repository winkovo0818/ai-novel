import React from "react";
import Link from "next/link";

interface NovelCardProps {
  id: string;
  title: string;
  chapterCount: number;
  doneCount: number;
  updatedAt: string;
  hasBible: boolean;
}

export function NovelCard({ id, title, chapterCount, doneCount, updatedAt, hasBible }: NovelCardProps) {
  const progress = chapterCount > 0 ? Math.round((doneCount / chapterCount) * 100) : 0;

  return (
    <Link
      href={`/novels/${id}`}
      className="group relative bg-white border border-border-subtle rounded-2xl overflow-hidden shadow-sm transition-all duration-300 hover:shadow-premium hover:border-primary/20 hover:-translate-y-1 flex flex-col h-full"
    >
      {/* Decorative Top Bar */}
      <div className={`h-1.5 transition-colors duration-500 ${hasBible ? 'bg-primary' : 'bg-amber-400'}`} />
      
      <div className="p-6 flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-bold text-text-dim uppercase tracking-wider font-mono">
            #{id.slice(0, 6).toUpperCase()}
          </span>
          {hasBible && (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-primary/5 rounded-full ring-1 ring-primary/20">
              <span className="text-[9px] font-bold text-primary uppercase tracking-tight">World Bible</span>
            </div>
          )}
        </div>
        
        <h3 className="text-lg font-serif font-bold text-text-primary group-hover:text-primary transition-colors leading-snug line-clamp-2 mb-6">
          {title}
        </h3>
        
        <div className="mt-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
               创作进度
            </span>
            <span className="text-[11px] font-bold text-primary">
              {progress}%
            </span>
          </div>
          
          <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-1000 ease-out" 
              style={{ width: `${progress}%` }}
            />
          </div>
          
          <div className="mt-3 flex items-center gap-2">
             <span className="text-xs font-bold text-text-secondary">
               {doneCount} <span className="text-text-dim font-medium uppercase text-[10px]">已完结</span>
             </span>
             <span className="text-text-dim">/</span>
             <span className="text-xs font-bold text-text-secondary">
               {chapterCount} <span className="text-text-dim font-medium uppercase text-[10px]">总章节</span>
             </span>
          </div>
        </div>
      </div>
      
      <div className="px-6 py-4 bg-secondary/20 border-t border-border-subtle flex items-center justify-between">
        <span className="text-[10px] text-text-dim font-bold uppercase tracking-wider flex items-center gap-1.5">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {new Date(updatedAt).toLocaleDateString()}
        </span>
        <div className="h-7 w-7 rounded-full bg-white border border-border-strong flex items-center justify-center text-text-dim group-hover:border-primary group-hover:text-primary transition-all">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </Link>
  );
}
