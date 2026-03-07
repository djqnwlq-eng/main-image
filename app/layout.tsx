import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "화장품 스마트스토어 썸네일 생성기",
  description: "상품 이미지와 레퍼런스로 전문적인 스마트스토어 썸네일을 자동 생성합니다",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
