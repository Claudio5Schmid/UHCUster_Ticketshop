"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./MobileNav.module.css";

const LINKS = [
  { href: "/#saisonkarten", label: "Saisonkarten" },
  { href: "/red-castle-club", label: "Red Castle Club" },
  { href: "/spielplan", label: "Spielplan" },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const pathname = usePathname();

  // Any navigation closes the panel. Route-change alone isn't enough: the
  // "Saisonkarten" link is an in-page anchor on "/", so tapping it from "/" never
  // changes the pathname - each link also closes on click below. What's left for
  // this to catch is browser back/forward with the panel still open.
  //
  // Adjusted during render instead of in an effect: React re-runs the component
  // with the new state before committing, so the panel never paints open on the
  // new route (https://react.dev/learn/you-might-not-need-an-effect).
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
    document.addEventListener("keydown", onKeyDown);

    // Keeps the page behind the open panel from scrolling under it on iOS.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={styles.toggle}
        aria-label={open ? "Menü schliessen" : "Menü öffnen"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={open ? `${styles.bar} ${styles.barTopOpen}` : styles.bar} />
        <span className={open ? `${styles.bar} ${styles.barMiddleOpen}` : styles.bar} />
        <span className={open ? `${styles.bar} ${styles.barBottomOpen}` : styles.bar} />
      </button>

      {open && <div className={styles.backdrop} onClick={() => setOpen(false)} aria-hidden="true" />}

      <nav
        id={panelId}
        className={open ? `${styles.panel} ${styles.panelOpen}` : styles.panel}
        aria-label="Hauptnavigation"
        hidden={!open}
      >
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className={styles.link} onClick={() => setOpen(false)}>
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
