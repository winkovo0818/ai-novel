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
      href={`/editor/${id}`}
      className="group relative bg-white border border-border-subtle rounded-xl overflow-hidden shadow-sm transition-all duration-500 hover:shadow-xl hover:border-primary/20 hover:-translate-y-1 flex flex-col min-h-[220px]"
    >
      {/* Book Spine Accent */}
      <div className={`absolute left-0 top-0 bottom-0 w-1.5 transition-colors duration-500 ${hasBible ? 'bg-primary' : 'bg-amber-400'}`} />
      
      <div className="p-8 pl-10 flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <span className="text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] font-mono">
            ID: {id.slice(0, 8)}
          </span>
          {hasBible && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/5 rounded-full border border-primary/10">
              <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[9px] font-bold text-primary uppercase tracking-wider">Bible Ready</span>
            </div>
          )}
        </div>
        
        <h3 className="text-xl font-serif font-bold text-text-primary group-hover:text-primary transition-colors leading-snug line-clamp-2 mt-2 mb-4">
          {title}
        </h3>
        
        <div className="mt-auto space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
               <svg className="w-3.5 h-3.5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
               </svg>
               <span className="text-xs font-bold text-text-secondary tracking-tight">
                 {doneCount} / {chapterCount} <span className="text-text-muted font-normal">章节</span>
               </span>
            </div>
            <span className="text-xs font-mono font-bold text-primary">
              {progress}%
            </span>
          </div>
          
          <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-700 cubic-bezier(0.16, 1, 0.3, 1)" 
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
      
      <div className="px-8 py-4 pl-10 bg-secondary/30 border-t border-border-subtle flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-3 h-3 text-text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider">
            {new Date(updatedAt).toLocaleDateString()}
          </span>
        </div>
        <span className="text-[10px] text-primary font-bold uppercase tracking-[0.1em] opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
          进入工作台 →
        </span>
      </div>
    </Link>
  );
}
