import type { CSSProperties, ReactNode } from "react";
import styles from "./Card.module.css";
import { tierCssVars } from "@/lib/tier";

interface CardProps {
  /** Drives the price-dependent visual treatment. Omit for a neutral, tier-less card. */
  tier?: number;
  eyebrow?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  image?: ReactNode;
  className?: string;
}

export function Card({ tier, eyebrow, title, children, footer, image, className }: CardProps) {
  const style = (tier !== undefined ? tierCssVars(tier) : undefined) as CSSProperties | undefined;

  return (
    <div className={className ? `${styles.card} ${className}` : styles.card} style={style}>
      {image && <div className={styles.image}>{image}</div>}
      {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
      {title && <h3 className={styles.title}>{title}</h3>}
      {children && <div className={styles.body}>{children}</div>}
      {footer && <div className={styles.footer}>{footer}</div>}
    </div>
  );
}
