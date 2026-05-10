"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/models", label: "Chat 节点" },
  { href: "/models/embeddings", label: "Embedding 节点" },
];

export function ModelsTabs() {
  const pathname = usePathname();
  return (
    <div className="mt-8 flex gap-1 border-b border-border-subtle">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.15em] border-b-2 -mb-px transition-colors ${
              isActive
                ? "text-primary border-primary"
                : "text-text-dim border-transparent hover:text-text-secondary"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
