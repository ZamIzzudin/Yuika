import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { YuiToaster } from "@/components/ui";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Yuika | Studio Persona",
  description:
    "Platform agent multi-persona: proyek, delegasi, skill, dan MCP dalam satu studio.",
  manifest: "/site.webmanifest",
  icons: {
    // favicon.ico & apple-icon.png di src/app/ di-serve otomatis oleh Next (file convention);
    // PNG tambahan untuk browser yang lebih suka raster daripada .ico.
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className={inter.variable}>
      <body>
        {children}
        <YuiToaster />
      </body>
    </html>
  );
}
