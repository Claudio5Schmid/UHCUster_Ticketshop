import styles from "./PlaceholderNotice.module.css";

/**
 * TODO(claudio): every page that renders this needs its real legal text from you -
 * see the pages in src/app/(impressum|datenschutz|ticket-bedingungen). Visible on
 * the page itself, not just in code, since this is legal/compliance content.
 */
export function PlaceholderNotice() {
  return (
    <div className={styles.notice} role="note">
      Platzhalter-Text - wird noch durch den definitiven Inhalt ersetzt.
    </div>
  );
}
