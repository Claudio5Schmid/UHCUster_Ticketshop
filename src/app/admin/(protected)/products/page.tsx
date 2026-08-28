import Link from "next/link";
import { Table, type TableColumn } from "@/components/ui/Table/Table";
import { Badge } from "@/components/ui/Badge/Badge";
import { Button } from "@/components/ui/Button/Button";
import { getAllProducts, type AdminProduct } from "@/lib/admin/products";
import { formatRappenAsChf } from "@/lib/pricing";
import styles from "../admin.module.css";

export const metadata = { title: "Preise - Admin" };

export default async function AdminProductsPage() {
  const products = await getAllProducts();

  const columns: TableColumn<AdminProduct>[] = [
    {
      key: "name",
      header: "Name",
      render: (product) => (
        <Link href={`/admin/products/${product.id}`} className={styles.orderLink}>
          {product.name}
        </Link>
      ),
    },
    { key: "type", header: "Typ", render: (product) => (product.type === "membership" ? "Red Castle Club" : "Saisonkarte") },
    { key: "tier", header: "Stufe", render: (product) => product.tier_level },
    { key: "price", header: "Preis", render: (product) => formatRappenAsChf(product.price_rappen) },
    {
      key: "active",
      header: "Status",
      render: (product) => <Badge variant={product.active ? "accent" : "outline"}>{product.active ? "aktiv" : "inaktiv"}</Badge>,
    },
  ];

  return (
    <div>
      <div className={styles.header}>
        <h1>Preise</h1>
        <Button as="a" href="/admin/products/neu">
          Neues Produkt
        </Button>
      </div>
      <p style={{ color: "var(--color-text-secondary)", marginBottom: "var(--space-6)" }}>
        Die folgenden Preise werden so auf der Webseite angezeigt. Klicke auf ein Angebot, um es zu bearbeiten. Der
        Status zeigt, ob das jeweilige Angebot auf der Webseite sichtbar ist.
      </p>
      <Table caption="Produkte" columns={columns} rows={products} getRowKey={(product) => product.id} />
    </div>
  );
}
