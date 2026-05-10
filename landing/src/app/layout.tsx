import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://landing-yield.vercel.app/"),
  title: "yieldOS — security suite for your AI agent",
  description:
    "yieldOS turns risky AI coding-agent changes into executable security contracts, counterexamples, and oracle-verified proof.",
  openGraph: {
    title: "yieldOS — security suite for your AI agent",
    description:
      "Deterministic checks before risky changes touch your repo. The model can propose. The oracle decides.",
    url: "https://landing-yield.vercel.app/",
    siteName: "yieldOS",
    type: "website",
  },
  alternates: {
    canonical: "https://landing-yield.vercel.app/",
  },
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
