/**
 * The admin's navigation, grouped by how often the office actually needs each
 * page rather than by listing all seven in a row.
 *
 * Mitglieder and Bestellungen are the daily work and stay where they were.
 * "Spielbetrieb" holds what hangs off a match: Spielplan says which games exist,
 * Dashboard reports who came to them and what the scanner sees live - separating
 * those two would put the fixtures away from the numbers about those same
 * fixtures. "Einstellungen" holds what is touched a few times a season: what the
 * shop sells, the season's export for the accounts, and who may log in.
 *
 * Preise and Export deliberately sit there rather than under Spielbetrieb:
 * neither has anything to do with a match. Preise is what the shop sells, and
 * Export is the season's orders as Excel and as an accounting CSV.
 */
export interface AdminNavItem {
  label: string;
  href: string;
}

export interface AdminNavGroup {
  label: string;
  /** Opens a menu; the group label itself is not a page. */
  items: AdminNavItem[];
}

export type AdminNavEntry = AdminNavItem | AdminNavGroup;

export function isGroup(entry: AdminNavEntry): entry is AdminNavGroup {
  return "items" in entry;
}

export const ADMIN_NAV: AdminNavEntry[] = [
  { label: "Mitglieder", href: "/admin/members" },
  { label: "Bestellungen", href: "/admin" },
  {
    label: "Spielbetrieb",
    items: [
      { label: "Spielplan", href: "/admin/schedule" },
      { label: "Dashboard", href: "/admin/dashboard" },
    ],
  },
  {
    label: "Einstellungen",
    items: [
      { label: "Preise", href: "/admin/products" },
      { label: "Export", href: "/admin/export" },
      { label: "Admins", href: "/admin/admins" },
    ],
  },
];

/**
 * Which entry the current path belongs to.
 *
 * "/admin" is the orders list and also the prefix of every other admin page, so
 * it only matches exactly; everything else matches its own subtree, which is what
 * keeps "Mitglieder" marked while a single member is open. The longest match
 * wins, so a page that sits under another one cannot light up both.
 */
export function isActive(href: string, pathname: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}
