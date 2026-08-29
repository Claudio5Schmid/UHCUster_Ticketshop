import styles from "./CheckoutSteps.module.css";

const STEPS = ["Warenkorb", "Daten", "Bestätigung"] as const;

/**
 * Three-step progress line across the buying flow. The shop previously dropped people
 * straight from a product card into a bare form with no sense of how many steps were
 * left - this makes the remaining work visible before they start typing.
 */
export function CheckoutSteps({ current }: { current: 0 | 1 | 2 }) {
  return (
    <ol className={styles.steps} aria-label="Bestellablauf">
      {STEPS.map((label, index) => {
        const state = index < current ? "done" : index === current ? "current" : "upcoming";
        return (
          <li key={label} className={styles.step} data-state={state}>
            <span className={styles.marker} aria-hidden="true">
              {state === "done" ? "✓" : index + 1}
            </span>
            <span className={styles.label}>{label}</span>
            {index < STEPS.length - 1 && <span className={styles.connector} aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
