import type { Metadata } from "next";
import { Unna, Merriweather_Sans, Libertinus_Serif_Display, Libertinus_Sans } from "next/font/google";
import "./globals.css";

const unna = Unna({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-unna",
  display: "swap",
});

const merriweatherSans = Merriweather_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ui-sans",
  display: "swap",
});

const libertiusSerifDisplay = Libertinus_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  style: "normal",
  variable: "--font-body-serif",
  display: "swap",
});

const libertiusSans = Libertinus_Sans({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-data-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Text Reader",
  description: "Sentence-sync read-along — fold a document into speech.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${unna.variable} ${merriweatherSans.variable} ${libertiusSerifDisplay.variable} ${libertiusSans.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
