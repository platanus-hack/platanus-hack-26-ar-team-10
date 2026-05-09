import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "yieldOS - oracle-driven security harness",
  description:
    "yieldOS wraps AI coding agents with scoped pass, fail, and unknown oracles for risky repo actions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full scroll-smooth antialiased">
      <body className="min-h-full bg-background font-sans text-foreground">
        {children}
      </body>
    </html>
  );
}
