// Request-boundary validation schemas. Pure (zod only) so they are shared by
// routes and unit-testable without touching the DB or env.

import { z } from "zod";

const emailField = z.string().email().max(254).transform((s) => s.toLowerCase().trim());

export const LoginInput = z.object({
  email: emailField,
  password: z.string().min(1),
});

export const RegisterInput = z.object({
  email: emailField,
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

export const OtpRequestInput = z.object({
  email: emailField,
  purpose: z.enum(["signup", "reset"]),
});

export const OtpVerifyInput = z.object({
  email: emailField,
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
  purpose: z.enum(["signup", "reset"]),
});

export const ResetPasswordInput = z.object({
  email: emailField,
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
  password: z.string().min(6).max(128),
});

export const WaitlistInput = z.object({
  email: emailField,
  reason: z.enum(["voice", "chat", "general"]).default("general"),
  note: z.string().max(500).optional(),
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

export const TTSInput = z.object({
  text: z.string().min(1).max(1000),
  language: z.enum(["en", "hi"]).default("en"),
  tone: z
    .enum(["warm", "gentle", "calm", "encouraging", "cheerful", "serious", "sad"])
    .optional(),
});
