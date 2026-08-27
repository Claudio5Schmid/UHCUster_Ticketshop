"use server";

import { revalidatePath } from "next/cache";
import {
  createMemberAndIssueCards,
  importMembersFromCsv,
  sendPendingMemberCards,
  updateMemberKategorie,
  deleteMembers,
  type MemberInput,
  type CsvImportResult,
  type SendCardsResult,
} from "@/lib/admin/members";
import type { CsvColumnMapping } from "@/lib/csv/memberCsv";

const SEND_CONFIRMATION_PHRASE = "Versenden";

export async function createMemberAction(input: MemberInput) {
  await createMemberAndIssueCards(input);
  revalidatePath("/admin/members");
}

export async function importCsvAction(csvContent: string, mapping: CsvColumnMapping): Promise<CsvImportResult> {
  const result = await importMembersFromCsv(csvContent, mapping);
  revalidatePath("/admin/members");
  return result;
}

export async function updateMemberKategorieAction(memberId: string, kategorie: string | null) {
  const updated = await updateMemberKategorie(memberId, kategorie);
  revalidatePath("/admin/members");
  return updated;
}

export async function deleteMembersAction(memberIds: string[]) {
  await deleteMembers(memberIds);
  revalidatePath("/admin/members");
}

/**
 * The one send-everything (or send-to-a-picked-subset) action in the whole
 * system. Gated on the admin literally typing the confirmation phrase - not
 * real authentication (they're already an authenticated admin), just a
 * deliberate "are you sure" step for an action that can't be undone once real
 * emails go out. memberIds restricts the send to a specific selection; omit
 * it to send to every pending member.
 */
export async function sendPendingCardsAction(
  subject: string,
  body: string,
  confirmationPhrase: string,
  memberIds?: string[]
): Promise<SendCardsResult> {
  if (confirmationPhrase !== SEND_CONFIRMATION_PHRASE) {
    throw new Error(`Bitte "${SEND_CONFIRMATION_PHRASE}" eingeben, um den Versand zu bestätigen.`);
  }
  const result = await sendPendingMemberCards(subject, body, memberIds);
  revalidatePath("/admin/members");
  return result;
}
