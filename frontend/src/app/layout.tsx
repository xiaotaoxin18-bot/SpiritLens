import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./spiritlens-hero.css";
import AppShell from "@/components/layout/AppShell";
import { ThemeServerInit } from "@/components/layout/ThemeServerInit";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SpiritLens — 一站式 AI 创意创作平台",
  description: "灵境 SpiritLens，释放你的无限想象力。AI 图片生成、视频生成、智能画布，即点即用。",
  icons: {
    icon: "/spiritlens/sparkles-favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <ThemeServerInit />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
