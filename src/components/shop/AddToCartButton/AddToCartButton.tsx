"use client";

import { Button } from "@/components/ui/Button/Button";
import { useCart } from "@/lib/cart";

interface AddToCartButtonProps {
  productId: string;
  productName: string;
  priceRappen: number;
  transferable: boolean;
  fullWidth?: boolean;
}

/**
 * No toast on add any more: the cart drawer opens on the same click and says the
 * same thing in more detail, so the toast was a second announcement of one event -
 * and it landed on top of the drawer's own total and buttons.
 */
export function AddToCartButton({ productId, productName, priceRappen, transferable, fullWidth }: AddToCartButtonProps) {
  const { addLine } = useCart();

  return (
    <Button
      size="sm"
      fullWidth={fullWidth}
      onClick={() => addLine({ id: productId, name: productName, priceRappen, transferable })}
    >
      Auswählen
    </Button>
  );
}
