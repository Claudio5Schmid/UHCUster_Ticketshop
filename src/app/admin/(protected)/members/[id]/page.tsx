import { notFound } from "next/navigation";
import Link from "next/link";
import { getMemberDetail } from "@/lib/admin/members";
import { MemberDetailClient } from "./MemberDetailClient";
import styles from "../../admin.module.css";

export const metadata = { title: "Mitglied - Admin" };

export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getMemberDetail(id);

  if (!detail) {
    notFound();
  }

  return (
    <div>
      <p className={styles.breadcrumb}>
        <Link href="/admin/members" className={styles.orderLink}>
          ← Alle Mitglieder
        </Link>
      </p>
      <MemberDetailClient member={detail.member} tickets={detail.tickets} />
    </div>
  );
}
