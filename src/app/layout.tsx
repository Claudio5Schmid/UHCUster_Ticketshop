import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "UHC Uster Ticketshop",
  description: "Saisonkarten und Red Castle Club für den UHC Uster.",
};

// Deliberately minimal: the public shop's Header/Footer/Cart/Toast providers live
// in (shop)/layout.tsx, not here, so the admin area gets its own clean shell
// (AdminNav, no cart icon or shop navigation) instead of the shop chrome
// bracketing every admin page.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de-CH" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
