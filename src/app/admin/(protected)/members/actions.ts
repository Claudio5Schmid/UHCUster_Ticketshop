"use server";

import { revalidatePath } from "next/cache";
import {
  createMemberAndIssueCards,
  importMembersFromCsv,
  sendMemberCards,
  updateMemberKategorie,
  deleteMembers,
  addCardsToMember,
  type MemberInput,
  type CsvImportResult,
  type SendCardsResult,
} from "@/lib/admin/members";
import type { CsvColumnMapping } from "@/lib/csv/memberCsv";
import { SEND_CONFIRMATION_PHRASE, matchesSendConfirmation } from "@/lib/admin/send-confirmation";

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
  await updateMemberKategorie(memberId, kategorie);
  revalidatePath("/admin/members");
  revalidatePath(`/admin/members/${memberId}`);
}

export async function deleteMembersAction(memberIds: string[]) {
  await deleteMembers(memberIds);
  revalidatePath("/admin/members");
}

/** Generates further cards for an existing member, PDFs and all. */
export async function addCardsToMemberAction(memberId: string, counts: { personal: number; transferable: number }) {
  await addCardsToMember(memberId, counts);
  revalidatePath("/admin/members");
  revalidatePath(`/admin/members/${memberId}`);
}

/**
 * The one path that sends email in this system, and it only ever sends to an
 * explicit selection - there is deliberately no "send to everyone" button, so a
 * mis-click cannot mail the entire club.
 *
 * Gated on the admin literally typing the confirmation phrase. Not real
 * authentication (they are already an authenticated admin), just a deliberate
 * "are you sure" for something that cannot be undone once the mail is out.
 */
export async function sendMemberCardsAction(
  subject: string,
  body: string,
  confirmationPhrase: string,
  memberIds: string[]
): Promise<SendCardsResult> {
  if (!matchesSendConfirmation(confirmationPhrase)) {
    throw new Error(`Bitte "${SEND_CONFIRMATION_PHRASE}" eingeben, um den Versand zu bestätigen.`);
  }
  if (memberIds.length === 0) {
    throw new Error("Keine Mitglieder ausgewählt.");
  }
  const result = await sendMemberCards(subject, body, memberIds);
  revalidatePath("/admin/members");
  return result;
}
