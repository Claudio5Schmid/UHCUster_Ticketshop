import { ProductForm } from "../ProductForm";

export const metadata = { title: "Neues Produkt - Admin" };

export default function NewProductPage() {
  return (
    <div>
      <h1>Neues Produkt</h1>
      <ProductForm />
    </div>
  );
}
