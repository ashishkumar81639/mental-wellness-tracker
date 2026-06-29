import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Yaar - Your Study Companion",
  description:
    "An empathetic AI companion for students navigating exam stress, self-doubt, and the pressure of competitive exams.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
