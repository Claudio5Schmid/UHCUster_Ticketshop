import type { ReactNode } from "react";
import styles from "./Badge.module.css";

type Variant = "neutral" | "accent" | "outline";

interface BadgeProps {
  variant?: Variant;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

export function Badge({ variant = "neutral", dot, children, className }: BadgeProps) {
  const variantClass = variant === "accent" ? styles.accent : variant === "outline" ? styles.outline : styles.neutral;
  const classes = className ? `${styles.badge} ${variantClass} ${className}` : `${styles.badge} ${variantClass}`;

  return (
    <span className={classes}>
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {children}
    </span>
  );
}
