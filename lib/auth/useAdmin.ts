"use client";

import { useEffect, useState } from "react";

interface MeData {
  id: string;
  email: string | null;
  isAdmin: boolean;
}

let cached: MeData | null = null;
let fetchPromise: Promise<MeData | null> | null = null;

async function fetchMe(): Promise<MeData | null> {
  if (cached) return cached;
  if (fetchPromise) return fetchPromise;
  fetchPromise = (async () => {
    try {
      const res = await fetch("/api/auth/me");
      const json = await res.json();
      if (json.ok && json.data) {
        cached = json.data;
        return cached;
      }
      return null;
    } catch {
      return null;
    } finally {
      fetchPromise = null;
    }
  })();
  return fetchPromise;
}

export function useAdmin(): { isAdmin: boolean; loading: boolean } {
  const [isAdmin, setIsAdmin] = useState(cached?.isAdmin ?? false);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let mounted = true;
    fetchMe().then((data) => {
      if (mounted) {
        setIsAdmin(data?.isAdmin ?? false);
        setLoading(false);
      }
    });
    return () => { mounted = false; };
  }, []);

  return { isAdmin, loading };
}