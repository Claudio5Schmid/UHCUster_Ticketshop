import { getCountdownState } from "@/lib/games";
import styles from "./Countdown.module.css";

interface CountdownProps {
  playedAt: string;
  /** The instant to count from - passed in (not read here) so the server and
   * the ticking client render the same digits for the same `now`. */
  now: number;
}

const UNITS = [
  { key: "days", label: "Tage" },
  { key: "hours", label: "Std" },
  { key: "minutes", label: "Min" },
] as const;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** Days : hours : minutes to kick-off, or "Spiel läuft" once it has started. */
export function Countdown({ playedAt, now }: CountdownProps) {
  const state = getCountdownState(playedAt, now);

  if (state.kind === "live") {
    return <p className={styles.live}>Spiel läuft - Heute!</p>;
  }

  if (state.kind === "over") {
    return null;
  }

  return (
    <div className={styles.countdown}>
      {/* The digits alone read as "00 04 13" to a screen reader; one sentence says it. */}
      <span className={styles.srOnly}>
        Noch {state.days} Tage, {state.hours} Stunden und {state.minutes} Minuten bis zum Spiel.
      </span>
      <div className={styles.units} aria-hidden="true">
        {UNITS.map((unit, index) => (
          <div key={unit.key} className={styles.unitWrap}>
            {index > 0 && <span className={styles.separator}>:</span>}
            <div className={styles.unit}>
              <span className={styles.value}>{pad(state[unit.key])}</span>
              <span className={styles.label}>{unit.label}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
