import { getAllMembers, getPendingSendCount } from "@/lib/admin/members";
import { MembersPageClient } from "./MembersPageClient";

export const metadata = { title: "Mitglieder - Admin" };

export default async function AdminMembersPage() {
  const [members, pendingCount] = await Promise.all([getAllMembers(), getPendingSendCount()]);

  return <MembersPageClient members={members} pendingCount={pendingCount} />;
}
