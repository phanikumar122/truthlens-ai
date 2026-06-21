import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "TruthLens — verification desk",
  description:
    "AI-powered misinformation verification. Live classification, source attribution, and confidence scoring for claims moving across the wire.",
};

/**
 * Applies the saved theme before paint, so there's no flash of the wrong theme.
 * Reads localStorage 'tl-theme'; falls back to system preference; default dark.
 */
const noFlash = `(function(){try{var t=localStorage.getItem('tl-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlash }} />
      </head>
      <body className="min-h-screen bg-ink text-text flex flex-col selection:bg-signal/30">
        {children}
      </body>
    </html>
  );
}
