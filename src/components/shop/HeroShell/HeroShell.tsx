import Image from "next/image";
import type { ReactNode } from "react";
import { Container } from "@/components/layout/Container/Container";
import styles from "./HeroShell.module.css";

/**
 * The photo hero the three shop landing pages share (/, /spielplan,
 * /red-castle-club): one full-width photo under a white veil, centred content
 * on top, the header floating transparently over its top edge.
 *
 * The photo is /public/hero/heimspiel.jpg - a home game in the Buchholz, the
 * stand full behind the boards, 2400x1600. Swapping it for another is a file
 * replacement, not a code change: same name, same width, and the CSS gradient
 * on .media still stands in while it loads. Kept light on purpose: black text,
 * red accents, exactly as on the rest of the page
 * (docs/uhcusterdesignanalyse.md #4).
 */
export function HeroShell({ children }: { children: ReactNode }) {
  return (
    <section className={styles.hero} data-hero="">
      <div className={styles.media} aria-hidden="true">
        <Image
          src="/hero/heimspiel.jpg"
          alt=""
          fill
          sizes="100vw"
          preload
          className={styles.photo}
        />
        <div className={styles.overlay} />
      </div>
      <Container className={styles.content}>{children}</Container>
    </section>
  );
}

/** The hero's headline: capitals, heaviest weight, tight - still Inter. */
export function HeroTitle({ children }: { children: ReactNode }) {
  return <h1 className={styles.title}>{children}</h1>;
}
