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
}

const CartContext = createContext<CartContextValue | null>(null);

// Deliberately in-memory only - no localStorage/sessionStorage, per the brief. The
// cart is lost on a full page reload; that's an accepted tradeoff, not an oversight.
export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);

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
  };

  const removeLine: CartContextValue["removeLine"] = (lineId) => {
    setLines((current) => current.filter((line) => line.id !== lineId));
  };

  const setHolderName: CartContextValue["setHolderName"] = (lineId, holderName) => {
    setLines((current) => current.map((line) => (line.id === lineId ? { ...line, holderName } : line)));
  };

  const clear = () => setLines([]);

  const value = useMemo(() => ({ lines, addLine, removeLine, setHolderName, clear }), [lines]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
