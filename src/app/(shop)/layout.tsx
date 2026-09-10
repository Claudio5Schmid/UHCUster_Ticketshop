import { Header } from "@/components/layout/Header/Header";
import { Footer } from "@/components/layout/Footer/Footer";
import { CartDrawer } from "@/components/shop/CartDrawer/CartDrawer";
import { ToastProvider } from "@/components/ui/Toast/Toast";
import { CartProvider } from "@/lib/cart";

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <CartProvider>
        <Header />
        <main>{children}</main>
        <Footer />
        {/* Last, so it lies over the page it belongs to - and inside CartProvider,
            because adding a card from any page is what opens it. */}
        <CartDrawer />
      </CartProvider>
    </ToastProvider>
  );
}
