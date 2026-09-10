"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive, type AdminNavGroup } from "./links";
import styles from "./AdminNav.module.css";

/**
 * One grouped entry in the admin bar: a button that opens its pages in a menu.
 *
 * The group label is not a page of its own - "Spielbetrieb" is a heading for
 * Spielplan and Dashboard, and sending it somewhere would only raise the question
 * of why it landed there. It stays marked while any of its pages is open, so the
 * bar still says where you are once the menu is shut.
 */
export function AdminNavMenu({ group }: { group: AdminNavGroup }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const containsCurrentPage = group.items.some((item) => isActive(item.href, pathname));

  // Any navigation closes the menu. Adjusted during render rather than in an
  // effect, the same way MobileNav does it, so it never paints open on the page
  // it just sent you to.
  const [renderedPathname, setRenderedPathname] = useState(pathname);
  if (pathname !== renderedPathname) {
    setRenderedPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    // Anywhere outside closes it - including the other group's button, which
    // would otherwise leave two menus open over each other.
    function onPointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div className={styles.group} ref={wrapperRef}>
      <button
        type="button"
        className={styles.groupButton}
        data-current={containsCurrentPage || undefined}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
      >
        {group.label}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden="true"
          className={open ? `${styles.chevron} ${styles.chevronOpen}` : styles.chevron}
        >
          <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div id={menuId} className={styles.menu} hidden={!open}>
        {group.items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={styles.menuItem}
            data-current={isActive(item.href, pathname) || undefined}
            onClick={() => setOpen(false)}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
