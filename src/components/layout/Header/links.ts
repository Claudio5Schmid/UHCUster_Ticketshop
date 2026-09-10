/** The shop's navigation, in one place so the desktop bar and the mobile panel
 * can't drift apart. */
export const NAV_LINKS = [
  { href: "/#saisonkarten", label: "Saisonkarten" },
  { href: "/red-castle-club", label: "Red Castle Club" },
  { href: "/spielplan", label: "Einzeltickets" },
] as const;

/** Reached by an icon on desktop; spelled out in the mobile panel, where a
 * 40px icon is easy to miss. */
export const MOBILE_EXTRA_LINKS = [{ href: "/meine-tickets", label: "Meine Tickets" }] as const;

/** Pages that open with the photo hero - the header floats transparently over
 * those until the page is scrolled. */
export const HERO_PATHS = new Set(["/", "/spielplan", "/red-castle-club"]);
