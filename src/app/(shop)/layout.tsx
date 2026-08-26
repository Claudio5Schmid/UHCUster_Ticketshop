import { Header } from "@/components/layout/Header/Header";
import { Footer } from "@/components/layout/Footer/Footer";
import { ToastProvider } from "@/components/ui/Toast/Toast";
import { CartProvider } from "@/lib/cart";

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <CartProvider>
        <Header />
        <main>{children}</main>
        <Footer />
      </CartProvider>
    </ToastProvider>
  );
}
