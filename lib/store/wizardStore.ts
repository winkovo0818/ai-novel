"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { BibleDraft, NovelProfile, Question } from "@/lib/validation/schemas";

export type WizardStep = 1 | 2 | 3 | 4 | 5;
export type WizardStatus = "idle" | "loading" | "streaming" | "error" | "done";

interface WizardInputs {
  title?: string;
  genre_main?: NovelProfile["genre_main"];
  genre_sub?: string;
  logline?: string;
  logline_suggestions?: string[];
  questions?: Question[];
  answers?: Record<string, string | string[]>;
}

interface WizardError {
  step: number;
  message: string;
  retryable: boolean;
}

interface WizardState {
  step: WizardStep;
  session_id?: string;
  default_profile?: NovelProfile;
  inputs: WizardInputs;
  bible_draft?: Partial<BibleDraft>;
  regeneration_count: number;
  status: WizardStatus;
  error?: WizardError;
  setStep: (step: WizardStep) => void;
  setSession: (sessionId: string, profile: NovelProfile) => void;
  patchInputs: (inputs: Partial<WizardInputs>) => void;
  setAnswer: (key: string, value: string | string[]) => void;
  setStatus: (status: WizardStatus) => void;
  setError: (error?: WizardError) => void;
  setBibleDraft: (draft?: Partial<BibleDraft>) => void;
  setRegenerationCount: (count: number) => void;
  reset: () => void;
}

const initialState = {
  step: 1 as WizardStep,
  session_id: undefined,
  default_profile: undefined,
  inputs: {},
  bible_draft: undefined,
  regeneration_count: 0,
  status: "idle" as WizardStatus,
  error: undefined,
};

export const useWizardStore = create<WizardState>()(
  persist(
    (set) => ({
      ...initialState,
      setStep: (step) => set({ step, status: "idle", error: undefined }),
      setSession: (session_id, default_profile) => set({ session_id, default_profile }),
      patchInputs: (inputs) =>
        set((state) => ({ inputs: { ...state.inputs, ...inputs } })),
      setAnswer: (key, value) =>
        set((state) => ({
          inputs: {
            ...state.inputs,
            answers: { ...state.inputs.answers, [key]: value },
          },
        })),
      setStatus: (status) => set({ status }),
      setError: (error) => set({ error, status: error ? "error" : "idle" }),
      setBibleDraft: (bible_draft) => set({ bible_draft }),
      setRegenerationCount: (regeneration_count) => set({ regeneration_count }),
      reset: () => set(initialState),
    }),
    {
      name: "ai-novel-onboarding-wizard",
      partialize: (state) => ({
        step: state.step,
        session_id: state.session_id,
        default_profile: state.default_profile,
        inputs: state.inputs,
        regeneration_count: state.regeneration_count,
      }),
    },
  ),
);
