import type { Metadata } from "next";
import { Shippori_Mincho, Sometype_Mono } from "next/font/google";
import "./globals.css";

const shipporiMincho = Shippori_Mincho({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-shippori",
  display: "swap",
});

const sometypeMono = Sometype_Mono({
  subsets: ["latin"],
  weight: "variable",
  variable: "--font-sometype",
  display: "swap",
});

export const metadata: Metadata = {
  title: "oriyomi",
  description:
    "ori—to fold, yomi—to read. Sentence-sync read-along that folds a document into speech.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${shipporiMincho.variable} ${sometypeMono.variable} h-full antialiased`}
    >
      <body className="h-full">{children}</body>
    </html>
  );
}
