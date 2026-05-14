import { z } from "zod";

export const MODERATION_REVIEW_STATUSES = [
  "pending",
  "confirmed",
  "false_positive",
  "ignored",
] as const;

export const ModerationReviewStatusSchema = z.enum(MODERATION_REVIEW_STATUSES);

export const UpdateModerationReviewSchema = z.object({
  review_status: ModerationReviewStatusSchema,
  review_note: z.string().max(1000).optional(),
});

export type ModerationReviewStatus = z.infer<typeof ModerationReviewStatusSchema>;
