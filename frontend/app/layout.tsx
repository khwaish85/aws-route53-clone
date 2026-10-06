import type { Metadata } from "next";
import { ThemeBootstrap } from "@/components/ThemeBootstrap";
import "./globals.css";

export const metadata: Metadata = {
  title: "Route 53 Console | Khwaish Yadav",
  description: "Khwaish Yadav's full-stack AWS Route 53 console clone",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body><ThemeBootstrap />{children}</body>
    </html>
  );
}
