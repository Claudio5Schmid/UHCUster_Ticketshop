"use client";

import { Button } from "@/components/ui/Button/Button";
import { useCart } from "@/lib/cart";
import { useToast } from "@/components/ui/Toast/Toast";

interface AddToCartButtonProps {
  productId: string;
  productName: string;
  priceRappen: number;
  transferable: boolean;
}

export function AddToCartButton({ productId, productName, priceRappen, transferable }: AddToCartButtonProps) {
  const { addLine } = useCart();
  const { showToast } = useToast();

  return (
    <Button
      size="sm"
      onClick={() => {
        addLine({ id: productId, name: productName, priceRappen, transferable });
        showToast(`${productName} zum Warenkorb hinzugefügt.`);
      }}
    >
      Auswählen
    </Button>
  );
}
