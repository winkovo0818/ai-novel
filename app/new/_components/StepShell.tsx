import type { ReactNode } from "react";

export function StepShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm">
      <p className="text-sm font-medium text-neutral-500">{eyebrow}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">{title}</h1>
      <p className="mt-3 max-w-2xl text-neutral-600">{description}</p>
      <div className="mt-8">{children}</div>
    </section>
  );
}
