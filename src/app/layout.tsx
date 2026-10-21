import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Archivo_Black } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/providers";

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
  title: "JamFinds — Live BeamNG Mods from Reddit, BeamFinds & BeamFree",
  description:
    "A live BeamNG.drive mod finder. Automatically syncs new releases from r/Beamng_Jamaica, r/BeamNGpiratemods, r/beamng_leakedmods, r/BeamNG_Leaked_M0ds, BeamFinds and BeamFree — and auto-decodes base64 download links in real time.",
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
    title: "JamFinds — Live BeamNG Mods, Multi-Source",
    description:
      "Live BeamNG mods auto-synced from 4 subreddits + BeamFinds + BeamFree, with decoded download links.",
    siteName: "JamFinds",
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
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
