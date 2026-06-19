import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "短篇故事创作工作台",
  description: "本地单机版 AI 短篇故事创作工作台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <div className="min-h-screen">
          <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/92 backdrop-blur">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3">
              <a href="/dashboard" className="flex items-center gap-2 text-sm font-semibold text-zinc-950">
                <span className="h-2.5 w-2.5 rounded-full bg-teal-700" />
                <span>短篇故事工作台</span>
              </a>
              <nav className="flex items-center gap-1 text-sm">
                <a className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100" href="/dashboard">
                  项目
                </a>
                <a className="rounded-md px-3 py-2 text-zinc-700 hover:bg-zinc-100" href="/settings">
                  设置
                </a>
              </nav>
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
