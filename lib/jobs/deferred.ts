/** Resource waiting is not a failed provider attempt. */
export class JobDeferredError extends Error {
  constructor(public retryAt: Date | null, message: string) {
    super(message);
    this.name = "JobDeferredError";
  }
}
