// Request-boundary validation schemas. Pure (zod only) so they are shared by
// routes and unit-testable without touching the DB or env.

import { z } from "zod";

export const LoginInput = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const RegisterInput = z.object({
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9_]+$/, "Username must be lowercase letters, numbers, and underscores only"),
  name: z.string().min(1).max(100),
  password: z.string().min(6).max(128),
  exam_type: z.enum(["NEET", "JEE", "CUET", "CAT", "GATE", "UPSC", "boards", "other"]),
  exam_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD format")
    .refine(
      (d) => new Date(d) > new Date(),
      "Exam date must be in the future"
    )
    .optional(),
});

export const CheckInInput = z.object({
  body: z.string().min(10).max(5000),
  mood: z.number().int().min(1).max(5),
  energy: z.number().int().min(1).max(5),
  sleep_hrs: z.number().min(0).max(24).optional(),
});

export const ChatInput = z.object({
  message: z.string().min(1).max(3000),
});

export const ReframeInput = z.object({
  thought: z.string().min(5).max(2000),
});

export const JournalQuery = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const ChatHistoryQuery = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
