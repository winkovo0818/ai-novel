"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

const navItems = [
  { name: "我的书架", href: "/novels", icon: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  )},
  { name: "新建作品", href: "/new", icon: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  )},
  { name: "模型配置", href: "/models", icon: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )},
];

export function Sidebar() {
  const pathname = usePathname();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <aside className="w-[var(--width-sidebar)] h-screen bg-secondary/30 border-r border-border-strong flex flex-col fixed left-0 top-0 z-50">
      <div className="p-8 pb-10 flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-text-primary flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-text-primary/20">A</div>
        <div className="flex flex-col">
          <span className="text-[13px] font-bold tracking-tight text-text-primary leading-none uppercase">AI Novel</span>
          <span className="text-[9px] font-bold text-text-muted tracking-[0.2em] mt-1 uppercase opacity-60">Studio Core</span>
        </div>
      </div>

      <nav className="flex-1 p-4 flex flex-col gap-1.5">
        <div className="px-4 py-3 text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] opacity-50">主要导航</div>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex items-center gap-3.5 px-4 py-3 rounded-lg transition-all duration-300 group ${
                isActive 
                  ? "bg-white text-primary shadow-sm border border-border-strong" 
                  : "text-text-secondary hover:bg-white/60 hover:text-text-primary"
              }`}
            >
              {isActive && (
                <div className="absolute left-0 top-3 bottom-3 w-1 bg-primary rounded-full" />
              )}
              <span className={`${isActive ? "text-primary" : "text-text-muted group-hover:text-text-secondary"} transition-colors`}>
                {item.icon}
              </span>
              <span className="text-[13px] font-semibold tracking-tight">{item.name}</span>
              {isActive && (
                <div className="ml-auto w-1 h-1 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border-strong/50">
        <div className="bg-white/40 rounded-xl p-4 border border-border-subtle shadow-inner mb-4">
           <div className="flex items-center gap-3 mb-1">
             <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
             <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">系统状态</span>
           </div>
           <p className="text-[11px] text-text-muted leading-tight">AI 引擎连接就绪，所有创作服务已在线。</p>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-3.5 px-4 py-3 rounded-lg text-text-secondary hover:bg-red-50 hover:text-red-600 transition-all duration-300 w-full text-left font-semibold text-[13px]"
        >
          <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          退出当前会话
        </button>
      </div>
    </aside>
  );
}
