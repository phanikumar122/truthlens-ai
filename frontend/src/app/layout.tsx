import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "TruthLens AI — Premium Global Intelligence",
  description:
    "AI-powered misinformation detection dashboard using NLP classification, semantic fact retrieval, and source credibility analysis.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${outfit.variable} h-full antialiased`}
    >
      <body className="font-sans min-h-screen bg-[#09090B] text-[#FAFAFA] flex flex-col selection:bg-indigo-500/30">
        {children}
      </body>
    </html>
  );
}
