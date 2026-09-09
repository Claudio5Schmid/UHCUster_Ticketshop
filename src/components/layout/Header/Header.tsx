"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Container } from "@/components/layout/Container/Container";
import { CartButton } from "@/components/shop/CartButton/CartButton";
import { useScrolledPast } from "@/lib/useScrolled";
import { MobileNav } from "./MobileNav";
import { HERO_PATHS, NAV_LINKS } from "./links";
import styles from "./Header.module.css";

/**
 * Sticky header. On the three pages that open with the photo hero it starts
 * transparent, lying over the hero's top edge, and turns into the plain white
 * bar once the page is scrolled; everywhere else it is that white bar from the
 * start. Both `usePathname` and the scroll hook have a server value, so the
 * bar hydrates in exactly the state it was rendered in.
 */
export function Header() {
  const pathname = usePathname();
  const overHero = HERO_PATHS.has(pathname);
  const scrolled = useScrolledPast(24);
  const transparent = overHero && !scrolled;

  const classes = [
    styles.header,
    overHero && styles.overHero,
    transparent ? styles.transparent : styles.solid,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <header className={classes}>
      <Container>
        <div className={styles.bar}>
          <Link href="/" className={styles.logoLink} aria-label="UHC Uster - Startseite">
            <Image
              src="/uhc-uster-logo.png"
              alt="UHC Uster"
              width={160}
              height={57}
              className={styles.logo}
              preload
            />
          </Link>
          <nav className={styles.nav} aria-label="Hauptnavigation">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>
          <div className={styles.right}>
            <Link href="/meine-tickets" className={styles.iconLink} aria-label="Meine Tickets">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path
                  d="M2.5 7.5V5.5a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1v2a2.5 2.5 0 0 0 0 5v2a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-2a2.5 2.5 0 0 0 0-5Z"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
                <path d="M12.5 4.5v11" stroke="currentColor" strokeWidth="1.4" strokeDasharray="1.6 1.8" />
              </svg>
            </Link>
            <CartButton />
            <MobileNav />
          </div>
        </div>
      </Container>
    </header>
  );
}
