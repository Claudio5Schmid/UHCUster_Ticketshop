import { notFound } from "next/navigation";
import { getProduct } from "@/lib/admin/products";
import { getVariantOptions } from "@/lib/admin/orders";
import { ProductForm } from "../ProductForm";

export const metadata = { title: "Produkt bearbeiten - Admin" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, variants] = await Promise.all([getProduct(id), getVariantOptions()]);

  if (!product) {
    notFound();
  }

  return (
    <div>
      <h1>{product.name} bearbeiten</h1>
      <ProductForm product={product} variants={variants} />
    </div>
  );
}
