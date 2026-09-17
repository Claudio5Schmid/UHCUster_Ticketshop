"use server";

import { revalidatePath } from "next/cache";
import { setMemberEmail, setOrderEmail } from "@/lib/admin/contact-email";

/** Which row the admin was looking at when they corrected the address. Both write
 *  both copies (see contact-email.ts); this only says where the edit started. */
export type EmailTarget = { kind: "member"; id: string } | { kind: "order"; id: string };

export async function updateContactEmailAction(target: EmailTarget, email: string): Promise<void> {
  if (target.kind === "member") {
    await setMemberEmail(target.id, email);
    revalidatePath(`/admin/members/${target.id}`);
  } else {
    await setOrderEmail(target.id, email);
  }

  // The write always touches both rows, so both sides are refreshed regardless of
  // where the edit started. The order detail is revalidated by route pattern because
  // its path is keyed by order number and only the id is known here.
  revalidatePath("/admin/orders/[orderNumber]", "page");
  revalidatePath("/admin/members/[id]", "page");
  revalidatePath("/admin/members");
  revalidatePath("/admin");
}
