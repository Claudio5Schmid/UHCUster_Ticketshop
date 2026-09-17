import type { DeliveryStatus } from "@/lib/email/delivery";

export type StatusTone = "neutral" | "success" | "warning" | "info";

/**
 * One vocabulary for what the provider has said about a mail, used both in the
 * list and on the order itself - the office reads the same word in both places.
 *
 * "Angenommen" is where every mail starts and where it stays until the provider
 * reports back: the mail was taken, which is not the same as arrived. Only a
 * confirmed delivery is green.
 */
export const EMAIL_STATES: Record<DeliveryStatus, { label: string; variant: StatusTone }> = {
  accepted: { label: "Angenommen", variant: "info" },
  delivered: { label: "Zugestellt", variant: "success" },
  delayed: { label: "Verzögert", variant: "warning" },
  bounced: { label: "Unzustellbar", variant: "warning" },
  complained: { label: "Als Spam gemeldet", variant: "warning" },
  failed: { label: "Fehlgeschlagen", variant: "warning" },
};
