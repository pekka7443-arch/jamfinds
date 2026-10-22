import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Archivo_Black } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/providers";
import { AmbientGlow } from "@/components/site/ambient-glow";
import { BRAND } from "@/lib/brand";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const archivoBlack = Archivo_Black({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${BRAND.name} — Live BeamNG Mods from Reddit, BeamFinds & BeamFree`,
  description: BRAND.description,
  keywords: [
    "BeamNG",
    "BeamNG.drive",
    "BeamNG mods",
    "r/Beamng_Jamaica",
    "r/BeamNGpiratemods",
    "r/beamng_leakedmods",
    "BeamFinds",
    "BeamFree",
    "mod finder",
    "live mods",
  ],
  openGraph: {
    title: `${BRAND.name} — Live BeamNG Mods, Multi-Source`,
    description:
      "Live BeamNG mods auto-synced from 4 subreddits + BeamFinds + BeamFree, with decoded download links.",
    siteName: BRAND.name,
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#070d0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${archivoBlack.variable} antialiased bg-background text-foreground min-h-screen flex flex-col`}
      >
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <AmbientGlow />
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
