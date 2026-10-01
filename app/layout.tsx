import type { Metadata, Viewport } from "next";
import "./globals.css";

// The middleware creates a fresh CSP nonce per request. Cached HTML would
// carry a different nonce and prevent the browser from loading the app.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI Novel",
  description: "AI 协同写小说平台 — 专业创作工作台",
  applicationName: "AI Novel",
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Background matches --color-background (#fdfdfc); keeps Safari status bar
  // and Android Chrome top chrome aligned with the page.
  themeColor: "#fdfdfc",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
