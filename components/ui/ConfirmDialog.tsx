"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the primary action in destructive (red) styling. */
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface ActiveDialog extends ConfirmOptions {
  resolve(value: boolean): void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveDialog | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise((resolve) => {
      setActive({ ...options, resolve });
    });
  }, []);

  const close = useCallback((value: boolean) => {
    setActive((current) => {
      current?.resolve(value);
      return null;
    });
  }, []);

  // Focus management: Trap focus inside the dialog and return it on close.
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (active) {
      triggerRef.current = document.activeElement as HTMLElement;
      confirmBtnRef.current?.focus();
    } else {
      triggerRef.current?.focus();
    }
  }, [active]);

  // ESC closes as cancel; backdrop click also cancels.
  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close(false);
      if (e.key === "Tab") {
        // Simple 2-button focus trap
        if (e.shiftKey && document.activeElement === cancelBtnRef.current) {
          confirmBtnRef.current?.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === confirmBtnRef.current) {
          cancelBtnRef.current?.focus();
          e.preventDefault();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {active && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) close(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          aria-describedby={active.message ? "confirm-dialog-description" : undefined}
        >
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl border border-border-strong/40 overflow-hidden animate-fade-in">
            <div className="px-6 pt-5 pb-3">
              <h2
                id="confirm-dialog-title"
                className="text-lg font-bold text-text-primary tracking-tight"
              >
                {active.title}
              </h2>
              {active.message && (
                <p 
                  id="confirm-dialog-description"
                  className="mt-2 text-sm text-text-secondary leading-relaxed whitespace-pre-line max-h-[60vh] overflow-y-auto"
                >
                  {active.message}
                </p>
              )}
            </div>
            <div className="px-6 py-4 bg-secondary/30 flex justify-end gap-2 border-t border-border-strong/40">
              <button
                ref={cancelBtnRef}
                type="button"
                onClick={() => close(false)}
                className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary rounded-lg hover:bg-secondary transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
              >
                {active.cancelLabel ?? "取消"}
              </button>
              <button
                ref={confirmBtnRef}
                type="button"
                onClick={() => close(true)}
                className={`px-4 py-2 text-sm font-medium rounded-lg shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
                  active.danger
                    ? "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500"
                    : "bg-text-primary text-white hover:bg-text-primary/90"
                }`}
              >
                {active.confirmLabel ?? "确定"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

/**
 * Promise-based replacement for window.confirm. Returns true when the user
 * confirms, false on cancel / Esc / backdrop click.
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: "...", danger: true }))) return;
 */
export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) {
    throw new Error("useConfirm must be used inside <ConfirmProvider>");
  }
  return fn;
}
