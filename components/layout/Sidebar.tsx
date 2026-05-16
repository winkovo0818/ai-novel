"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { name: "工作台", href: "/dashboard", icon: (
    <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )},
  { name: "我的书架", href: "/novels", icon: (
    <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  )},
  { name: "新建作品", href: "/new", icon: (
    <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
    </svg>
  )},
  { name: "模型配置", href: "/models", icon: (
    <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )},
  { name: "用户与权限", href: "/admin/users", icon: (
    <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 11c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v3h16v-3c0-2.66-5.33-4-8-4z" />
    </svg>
  )},
  { name: "内容审核", href: "/admin/moderation", icon: (
    <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5-4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3 8 3z" />
    </svg>
  )},
];

export function Sidebar({ defaultCollapsed = false }: { defaultCollapsed?: boolean }) {
  const pathname = usePathname();
  // Seed from the SSR-derived cookie value so the very first paint already has
  // the correct width. No localStorage read in the initial render means no flash.
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  const toggleCollapse = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    // Persist for next SSR via cookie (server can read on next request) and
    // mirror to localStorage for any client-only legacy reads.
    document.cookie = `sidebar-collapsed=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    try {
      localStorage.setItem("sidebar-collapsed", String(next));
    } catch {
      // ignore quota/privacy errors
    }
    document.documentElement.style.setProperty("--width-sidebar", next ? "80px" : "260px");
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <aside className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-secondary border-r border-border-subtle transition-[width] duration-300 ease-in-out ${isCollapsed ? "w-20" : "w-[260px]"}`}>
      {/* Header Area */}
      <div className="h-24 flex-shrink-0 flex items-center px-6">
        <div className={`flex items-center transition-[justify-content,gap] duration-300 ${isCollapsed ? "w-full justify-center" : "gap-3.5"}`}>
          <div className="h-9 w-9 rounded-xl bg-text-primary flex items-center justify-center text-white font-bold text-lg shadow-premium shrink-0">A</div>
          {!isCollapsed && (
            <div className="flex flex-col animate-fade-in whitespace-nowrap overflow-hidden">
              <span className="text-[14px] font-bold tracking-tight text-text-primary leading-none">AI Novel</span>
              <span className="text-[10px] font-medium text-text-dim tracking-wider mt-1 uppercase">Studio Core</span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Area */}
      <nav className="flex-1 px-4 py-2 flex flex-col gap-1 overflow-y-auto custom-scrollbar">
        {!isCollapsed && <div className="px-4 py-3 text-[10px] font-bold text-text-dim uppercase tracking-[0.2em] animate-fade-in">主要导航</div>}
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex items-center rounded-xl transition-[background-color,color,box-shadow] duration-200 group ${isCollapsed ? "justify-center h-12" : "px-4 py-2.5 gap-3.5"} ${
                isActive 
                  ? "bg-white text-primary shadow-sm ring-1 ring-border-strong" 
                  : "text-text-secondary hover:bg-white/60 hover:text-text-primary"
              }`}
            >
              <span className={`${isActive ? "text-primary" : "text-text-dim group-hover:text-text-secondary"} transition-colors shrink-0`}>
                {item.icon}
              </span>
              {!isCollapsed && <span className="text-[13.5px] font-semibold tracking-tight animate-fade-in whitespace-nowrap overflow-hidden">{item.name}</span>}
              {isActive && !isCollapsed && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
              )}
              {isCollapsed && isActive && (
                <div className="absolute right-1 top-1/2 -translate-y-1/2 w-1 h-4 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer Area */}
      <div className="mt-auto flex-shrink-0 p-4 border-t border-border-subtle/30 bg-white">
        {!isCollapsed && (
          <div className="bg-secondary/30 rounded-2xl p-4 border border-border-subtle shadow-sm mb-4 animate-fade-in">
             <div className="flex items-center gap-2 mb-2">
               <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
               <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">系统就绪</span>
             </div>
             <p className="text-[11px] text-text-muted leading-relaxed">AI 协同引擎已连接，实时创作服务运行中。</p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button
            onClick={handleLogout}
            className={`flex items-center rounded-xl text-text-dim hover:bg-red-50 hover:text-red-500 transition-[background-color,color] duration-200 text-left font-semibold text-[13px] group ${isCollapsed ? "justify-center h-12" : "px-4 py-2.5 gap-3.5 w-full"}`}
          >
            <svg aria-hidden="true" className="w-5 h-5 opacity-50 group-hover:opacity-100 transition-opacity shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {!isCollapsed && <span className="animate-fade-in">退出登录</span>}
          </button>

          <button
            onClick={toggleCollapse}
            aria-label={isCollapsed ? "展开侧栏" : "收起侧栏"}
            aria-expanded={!isCollapsed}
            className={`flex items-center justify-center rounded-xl bg-white border border-border-subtle text-text-dim hover:text-text-primary transition-[background-color,color,box-shadow] duration-200 shadow-sm h-10 w-full ${!isCollapsed ? "gap-2" : ""}`}
            title={isCollapsed ? "展开侧栏" : "收起侧栏"}
          >
            <svg
              className={`w-4 h-4 transition-transform duration-500 ${isCollapsed ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
            {!isCollapsed && <span className="text-[11px] font-bold uppercase tracking-wider">收起侧栏</span>}
          </button>
        </div>
      </div>
    </aside>
  );
}
