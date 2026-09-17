import { ProductForm } from "../ProductForm";
import { getVariantOptions } from "@/lib/admin/orders";

export const metadata = { title: "Neues Produkt - Admin" };

export default async function NewProductPage() {
  const variants = await getVariantOptions();
  return (
    <div>
      <h1>Neues Produkt</h1>
      <ProductForm variants={variants} />
    </div>
  );
}
