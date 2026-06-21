/**
 * E2E auth bypass gate.
 *
 * Single source of truth for whether `E2E_AUTH_BYPASS` is honored. The
 * production hard-stop exists because CI/CD env leaking into production
 * config is a common deployment accident — and a leaked `E2E_AUTH_BYPASS=1`
 * would mean every request is silently authenticated as the test user.
 * Defense in depth: even with the env set, production never bypasses auth.
 */
export function isE2eBypassEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.E2E_AUTH_BYPASS === "1";
}
