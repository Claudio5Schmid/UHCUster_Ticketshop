"use client";

import styles from "./Switch.module.css";

interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name - what this switch decides, not what it currently says. */
  label: string;
  /** Shown left and right of the track, so the two ends read as a choice. */
  offLabel?: string;
  onLabel?: string;
  disabled?: boolean;
}

/**
 * A real switch rather than a checkbox: `role="switch"` tells a screen reader
 * this turns something on and off right now, instead of ticking a box that a
 * later Save will apply.
 */
export function Switch({ checked, onChange, label, offLabel, onLabel, disabled }: SwitchProps) {
  return (
    <div className={styles.wrapper}>
      {offLabel && (
        <span className={styles.end} data-active={!checked ? "true" : undefined}>
          {offLabel}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={styles.track}
      >
        <span className={styles.knob} aria-hidden="true" />
      </button>
      {onLabel && (
        <span className={styles.end} data-active={checked ? "true" : undefined}>
          {onLabel}
        </span>
      )}
    </div>
  );
}
