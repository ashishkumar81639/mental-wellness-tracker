import { Resend } from "resend";
import { RESEND_API_KEY, EMAIL_FROM, APP_BASE_URL } from "@/lib/env";

// Lazily created so the app still boots without RESEND_API_KEY (email routes
// will throw a clear error instead). Avoids crashing unrelated routes.
let client: Resend | null = null;
function resend(): Resend {
  if (!RESEND_API_KEY) {
    throw new Error(
      "RESEND_API_KEY is not set. Add it in .env (get one at https://resend.com/api-keys)."
    );
  }
  if (!client) client = new Resend(RESEND_API_KEY);
  return client;
}

const OTP_TTL_MINUTES = 10;

// Design tokens mirrored from tailwind.config.ts so email matches the site.
// Inline styles only - most email clients ignore <style> and external CSS.
const T = {
  primary: "#cc785c",
  primaryActive: "#a9583e",
  ink: "#141413",
  body: "#3d3d3a",
  muted: "#6c6a64",
  canvas: "#faf9f5",
  card: "#ffffff",
  hairline: "#e6dfd8",
  surfaceSoft: "#f5f0e8",
  amber: "#e8a55a",
  surfaceDark: "#181715",
  onDark: "#faf9f5",
  onDarkSoft: "#a09d96",
};

const FONT_DISPLAY =
  'Georgia, "Cormorant Garamond", "EB Garamond", Garamond, serif';
const FONT_SANS =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

function shell(inner: string): string {
  return [
    `<!DOCTYPE html>`,
    `<html lang="en">`,
    `<head>`,
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width,initial-scale=1">`,
    `<title>Yaar</title>`,
    `</head>`,
    `<body style="margin:0;padding:0;background:${T.canvas};font-family:${FONT_SANS};color:${T.body};line-height:1.6;-webkit-font-smoothing:antialiased">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${T.canvas}">`,
    `<tr><td align="center" style="padding:40px 16px">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:${T.card};border-radius:12px;border:1px solid ${T.hairline};overflow:hidden">`,
    `<tr><td style="padding:0">`,
    inner,
    `</td></tr>`,
    `</table>`,
    `<p style="margin:24px 0 0;font-size:12px;color:${T.muted};font-family:${FONT_SANS}">`,
    `Yaar · यार &nbsp;·&nbsp; Your companion through the exam journey`,
    `</p>`,
    `</td></tr>`,
    `</table>`,
    `</body>`,
    `</html>`,
  ].join("");
}

function header(): string {
  return [
    `<div style="background:${T.surfaceSoft};padding:28px 32px;text-align:center;border-bottom:1px solid ${T.hairline}">`,
    `<p style="margin:0;font-family:${FONT_SANS};font-size:11px;font-weight:500;letter-spacing:2px;text-transform:uppercase;color:${T.amber}">Yaar · यार</p>`,
    `</div>`,
  ].join("");
}

function codeBlock(code: string): string {
  return [
    `<div style="margin:24px 0;padding:24px;background:${T.surfaceSoft};border-radius:8px;text-align:center;border:1px solid ${T.hairline}">`,
    `<p style="margin:0;font-family:${FONT_SANS};font-size:11px;font-weight:500;letter-spacing:2px;text-transform:uppercase;color:${T.muted}">Your code</p>`,
    `<p style="margin:10px 0 0;font-family:${FONT_SANS};font-size:36px;font-weight:600;letter-spacing:10px;color:${T.primary};">${code}</p>`,
    `</div>`,
  ].join("");
}

function body(
  heading: string,
  intro: string,
  code: string,
  outro: string
): string {
  return [
    header(),
    `<div style="padding:32px">`,
    `<h1 style="margin:0 0 12px;font-family:${FONT_DISPLAY};font-size:26px;font-weight:500;color:${T.ink};line-height:1.2">${heading}</h1>`,
    `<p style="margin:0 0 4px;font-family:${FONT_SANS};font-size:15px;color:${T.body}">${intro}</p>`,
    codeBlock(code),
    `<p style="margin:0;font-family:${FONT_SANS};font-size:13px;color:${T.muted}">${outro}</p>`,
    `<p style="margin:16px 0 0;font-family:${FONT_SANS};font-size:12px;color:${T.muted}">This code expires in ${OTP_TTL_MINUTES} minutes.</p>`,
    `</div>`,
  ].join("");
}

function signupHtml(code: string): string {
  return shell(
    body(
      "Welcome to Yaar",
      "Use this code to verify your email and finish creating your account.",
      code,
      "If you did not create an account, you can safely ignore this email."
    )
  );
}

function resetHtml(code: string): string {
  return shell(
    body(
      "Reset your password",
      "Use this code to set a new password for your Yaar account.",
      code,
      "If you did not request a password reset, your account is safe - ignore this email."
    )
  );
}

function brandFooter(): string {
  return [
    "",
    "",
    "Yaar · यार",
    "Your companion through the exam journey.",
    APP_BASE_URL,
  ].join("\n");
}

export async function sendOtpEmail(
  email: string,
  code: string,
  purpose: "signup" | "reset"
): Promise<void> {
  const subject =
    purpose === "signup"
      ? `Yaar: verify your email (${code})`
      : `Yaar: password reset code (${code})`;
  const html = purpose === "signup" ? signupHtml(code) : resetHtml(code);
  const text = `${subject}\n\nYour code: ${code}\nExpires in ${OTP_TTL_MINUTES} minutes.${brandFooter()}`;

  const { error } = await resend().emails.send({
    from: EMAIL_FROM,
    to: email,
    subject,
    html,
    text,
  });

  if (error) {
    console.error("[email] resend send failed:", error);
    throw new Error("Failed to send OTP email. Try again.");
  }
}

export const OTP_TTL_MS = OTP_TTL_MINUTES * 60 * 1000;
