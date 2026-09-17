"use server";

import { revalidatePath } from "next/cache";
import {
  createMemberAndIssueCards,
  planMemberCsvImport,
  applyMemberCsvImport,
  sendMemberCards,
  updateMemberKategorie,
  deleteMembers,
  addCardsToMember,
  previewMemberMail,
  sendMemberTestMail,
  type MemberMailPreview,
  type MemberInput,
  type CsvImportResult,
  type CsvImportPlan,
  type SendCardsResult,
} from "@/lib/admin/members";
import type { CsvColumnMapping } from "@/lib/csv/memberCsv";
import { MAX_RECIPIENTS_PER_RUN, SEND_CONFIRMATION_PHRASE, matchesSendConfirmation } from "@/lib/admin/send-confirmation";

export async function createMemberAction(input: MemberInput) {
  await createMemberAndIssueCards(input);
  revalidatePath("/admin/members");
}

/** Read-only: works out what the file would do, so the admin can confirm the rows
 *  that resolve to an existing member before anything is written. */
export async function planCsvImportAction(csvContent: string, mapping: CsvColumnMapping): Promise<CsvImportPlan> {
  return planMemberCsvImport(csvContent, mapping);
}

/** `range` lets the browser walk the file a chunk at a time and report progress
 *  between calls; omitted, it writes the whole file in one go. */
export async function importCsvAction(
  csvContent: string,
  mapping: CsvColumnMapping,
  applyExternalIds: string[],
  range?: { offset: number; limit: number }
): Promise<CsvImportResult> {
  const result = await applyMemberCsvImport(csvContent, mapping, applyExternalIds, range);
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
  // The browser walks the selection a block at a time and already stops at the
  // limit; this is the backstop, so the cap holds however the action is called.
  if (memberIds.length > MAX_RECIPIENTS_PER_RUN) {
    throw new Error(`Pro Versand sind höchstens ${MAX_RECIPIENTS_PER_RUN} Empfänger möglich.`);
  }
  const result = await sendMemberCards(subject, body, memberIds);
  revalidatePath("/admin/members");
  return result;
}

export async function previewMemberMailAction(memberId: string, subject: string, body: string): Promise<MemberMailPreview> {
  return previewMemberMail(memberId, subject, body);
}

export async function sendMemberTestMailAction(memberId: string, subject: string, body: string, to: string): Promise<void> {
  await sendMemberTestMail(memberId, subject, body, to);
}
