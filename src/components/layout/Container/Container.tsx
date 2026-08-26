import type { ElementType, ReactNode } from "react";
import styles from "./Container.module.css";

interface ContainerProps {
  children: ReactNode;
  as?: ElementType;
  className?: string;
}

export function Container({ children, as: Tag = "div", className }: ContainerProps) {
  return <Tag className={className ? `${styles.container} ${className}` : styles.container}>{children}</Tag>;
}
