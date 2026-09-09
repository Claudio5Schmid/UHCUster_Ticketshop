import { getAllMembers, getMemberKategorien, type MemberSendState } from "@/lib/admin/members";
import { MembersPageClient } from "./MembersPageClient";
import { MemberFilters } from "./MemberFilters";

export const metadata = { title: "Mitglieder - Admin" };

const SEND_STATES: MemberSendState[] = ["ohne", "offen", "teilweise", "vollstaendig"];

function parseSendState(value: string | undefined): MemberSendState | undefined {
  return SEND_STATES.find((state) => state === value);
}

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; kategorie?: string; versand?: string }>;
}) {
  const params = await searchParams;
  const filters = {
    search: params.search ?? "",
    kategorie: params.kategorie ?? "",
    versand: parseSendState(params.versand),
  };

  const [members, kategorien] = await Promise.all([getAllMembers(filters), getMemberKategorien()]);

  return (
    <MembersPageClient members={members} filterBar={<MemberFilters search={filters.search} kategorie={filters.kategorie} versand={params.versand ?? ""} kategorien={kategorien} />} />
  );
}
