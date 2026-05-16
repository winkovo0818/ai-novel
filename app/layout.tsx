import type { Metadata, Viewport } from "next";
import "./globals.css";

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
