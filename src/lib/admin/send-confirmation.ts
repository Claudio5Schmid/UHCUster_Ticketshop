/**
 * The word an admin types to unlock the one irreversible bulk send in the app
 * (see sendPendingCardsAction). Kept here rather than in the action itself so the
 * button's enabled state and the server's own gate read from one definition - a
 * "use server" file can only export async functions, so the two used to hold
 * separate copies of the rule and could drift apart.
 *
 * Matched case-insensitively and with surrounding whitespace trimmed. The step
 * exists to make the admin stop and confirm, and "versenden" in lower case is no
 * less deliberate than "Versenden"; demanding the exact capitalisation only left
 * the button grey with nothing on screen explaining why.
 */
export const SEND_CONFIRMATION_PHRASE = "Versenden";

export function matchesSendConfirmation(input: string): boolean {
  return input.trim().toLocaleLowerCase("de-CH") === SEND_CONFIRMATION_PHRASE.toLocaleLowerCase("de-CH");
}

/**
 * How many recipients one send may cover.
 *
 * Not a technical ceiling - the sending itself would manage the club's whole
 * list in about two minutes. It is a deliberate one: a sender that has sent
 * little so far and then posts six hundred at once is what large providers
 * filter, and a block that lands badly is a hundred addresses to look at rather
 * than six hundred. Sending the rest is the same two clicks, because everything
 * already sent is skipped on the next run.
 */
export const MAX_RECIPIENTS_PER_RUN = 100;
