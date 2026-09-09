import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

type Variant = "primary" | "secondary" | "accent";
type Size = "sm" | "md";
type Shape = "default" | "pill";

interface CommonProps {
  variant?: Variant;
  size?: Size;
  /** "pill" for the shop's ticket calls to action (hero, match cards). */
  shape?: Shape;
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
}

const COMMON_KEYS = ["as", "variant", "size", "shape", "fullWidth", "className", "children"] as const;

function omitCommonKeys<T extends object>(props: T): Omit<T, (typeof COMMON_KEYS)[number]> {
  const rest = { ...props } as Record<string, unknown>;
  for (const key of COMMON_KEYS) delete rest[key];
  return rest as Omit<T, (typeof COMMON_KEYS)[number]>;
}

type ButtonAsButton = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps> & { as?: "button" };

type ButtonAsAnchor = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof CommonProps> & { as: "a" };

type ButtonProps = ButtonAsButton | ButtonAsAnchor;

function classNames(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Button(props: ButtonProps) {
  const { variant = "primary", size = "md", shape = "default", fullWidth, children, className } = props;

  const classes = classNames(
    styles.button,
    styles[variant],
    size === "sm" ? styles.sizeSm : styles.sizeMd,
    shape === "pill" && styles.pill,
    fullWidth && styles.fullWidth,
    className
  );

  if (props.as === "a") {
    return (
      <a className={classes} {...omitCommonKeys(props)}>
        {children}
      </a>
    );
  }

  return (
    <button className={classes} {...omitCommonKeys(props)}>
      {children}
    </button>
  );
}
