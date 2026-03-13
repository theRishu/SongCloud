import type { Metadata } from "next";
import "./globals.css";
import { MusicProvider } from "@/context/MusicContext";

export const metadata: Metadata = {
  title: "SongCloud | Premium Music",
  description: "High-quality music streaming experience.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="custom-scrollbar">
        <MusicProvider>{children}</MusicProvider>
      </body>
    </html>
  );
}
