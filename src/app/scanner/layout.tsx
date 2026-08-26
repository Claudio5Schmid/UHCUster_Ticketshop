import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "./ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "UHC Uster Scanner",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#e4032e",
};

export default function ScannerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ServiceWorkerRegister />
      {children}
    </>
  );
}
