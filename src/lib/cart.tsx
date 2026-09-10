"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export interface CartLine {
  /** Client-generated, only for React keys / removal - never sent as a price. */
  id: string;
  productId: string;
  productName: string;
  priceRappen: number;
  /** True for Red Castle Club bundles (shared company/group label) - see D5. */
  transferable: boolean;
  holderName: string;
}

interface CartContextValue {
  lines: CartLine[];
  addLine: (product: { id: string; name: string; priceRappen: number; transferable: boolean }) => void;
  removeLine: (lineId: string) => void;
  setHolderName: (lineId: string, holderName: string) => void;
  clear: () => void;
  /**
   * Whether the cart drawer is showing. It lives here rather than in the drawer
   * because the thing that opens it - adding a card, from any product card on any
   * page - is this context, not the drawer's own UI.
   */
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

// Deliberately in-memory only - no localStorage/sessionStorage, per the brief. The
// cart is lost on a full page reload; that's an accepted tradeoff, not an oversight.
export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const addLine: CartContextValue["addLine"] = (product) => {
    setLines((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        productId: product.id,
        productName: product.name,
        priceRappen: product.priceRappen,
        transferable: product.transferable,
        holderName: "",
      },
    ]);
    // Adding a card is the one moment the customer has no other confirmation that
    // anything happened - before this, "Auswählen" only ticked the header count up.
    setIsOpen(true);
  };

  const removeLine: CartContextValue["removeLine"] = (lineId) => {
    setLines((current) => {
      const next = current.filter((line) => line.id !== lineId);
      // Emptying the cart from inside the drawer leaves nothing to look at.
      if (next.length === 0) setIsOpen(false);
      return next;
    });
  };

  const setHolderName: CartContextValue["setHolderName"] = (lineId, holderName) => {
    setLines((current) => current.map((line) => (line.id === lineId ? { ...line, holderName } : line)));
  };

  const clear = () => {
    setLines([]);
    setIsOpen(false);
  };

  const openCart = () => setIsOpen(true);
  const closeCart = () => setIsOpen(false);

  const value = useMemo(
    () => ({ lines, addLine, removeLine, setHolderName, clear, isOpen, openCart, closeCart }),
    [lines, isOpen]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
