import type { Metadata, Viewport } from "next";
import "./globals.css";
import { profile } from "@/config/linktree";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: profile.title,
  description: profile.introDescription,
  openGraph: {
    title: profile.title,
    description: profile.introDescription,
    /* 카카오톡·페이스북 스크래퍼가 요구하는 최소 크기(200x200)를 넘겨야
       썸네일이 뜹니다. 1200x630 은 가로형 카드의 표준 비율입니다. */
    images: [{ url: "/assets/og-cover.png", width: 1200, height: 630, alt: profile.title }]
  },
  twitter: {
    card: "summary_large_image",
    title: profile.title,
    description: profile.introDescription,
    images: ["/assets/og-cover.png"]
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
