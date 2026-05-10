import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "yieldOS - executable security contracts",
  description:
    "yieldOS turns risky AI coding-agent changes into executable security contracts, counterexamples, and oracle-verified proof.",
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
