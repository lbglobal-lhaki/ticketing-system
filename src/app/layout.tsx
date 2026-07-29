import type { Metadata, Viewport } from "next";
import { Geist_Mono, Manrope, Syne } from "next/font/google";
import { SiteHeaderShell } from "@/components/SiteHeaderShell";
import { getBrand } from "@/lib/branding";
import "./globals.css";

const brand = getBrand();

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${brand.issuingAgent} | ${brand.airlineName} Flight Bookings`,
  description: `Book ${brand.airlineName} charter flights with ${brand.issuingAgent} — fixed fares, e-tickets, and tax invoices in AUD`,
  icons: {
    icon: brand.logoPath,
    apple: brand.logoPath,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en-AU"
      className={`${manrope.variable} ${syne.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <SiteHeaderShell />
        <div className="flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
