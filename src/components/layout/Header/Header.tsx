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
                <circle cx="10" cy="6.5" r="3.4" stroke="currentColor" strokeWidth="1.4" />
                <path
                  d="M3.5 17.2c.8-3.4 3.4-5.2 6.5-5.2s5.7 1.8 6.5 5.2"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
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
