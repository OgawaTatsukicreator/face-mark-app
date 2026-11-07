import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Face Mask Studio | 顔マスク",
  description: "写真の顔を検出・手動編集し、マスク画像を保存するツール。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ja"><body>{children}</body></html>;
}
