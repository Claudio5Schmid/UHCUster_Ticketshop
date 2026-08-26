import { notFound } from "next/navigation";
import { getProduct } from "@/lib/admin/products";
import { ProductForm } from "../ProductForm";

export const metadata = { title: "Produkt bearbeiten - Admin" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getProduct(id);

  if (!product) {
    notFound();
  }

  return (
    <div>
      <h1>{product.name} bearbeiten</h1>
      <ProductForm product={product} />
    </div>
  );
}
