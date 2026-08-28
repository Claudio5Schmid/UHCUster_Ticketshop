import { getAllAdmins } from "@/lib/admin/admins";
import { AdminsPageClient } from "./AdminsPageClient";

export const metadata = { title: "Admins - Admin" };

export default async function AdminsPage() {
  const admins = await getAllAdmins();
  return <AdminsPageClient admins={admins} />;
}
