"use client";

import { useId, useState } from "react";
import styles from "./PieChart.module.css";

export interface PieSlice {
  label: string;
  value: number;
  /** Pins this slice's color instead of taking the next palette entry. Needed where
   * the color carries meaning (accepted = green, rejected = red) and must not shift
   * just because the largest-first sort reordered the slices. */
  color?: string;
}

interface PieChartProps {
  title: string;
  slices: PieSlice[];
  /** Rendered under the total in the donut hole, e.g. "Scans". */
  unit?: string;
  emptyLabel?: string;
}

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
];

const SIZE = 168;
const STROKE = 30;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Donut chart drawn as stroke-dasharray arcs on concentric circles - no charting
 * dependency, and it inherits theme tokens directly. Slices are sorted largest-first
 * so the eye lands on the dominant category, with everything past the palette's
 * length folded into a single "Andere" slice rather than repeating colors.
 */
export function PieChart({ title, slices, unit, emptyLabel = "Keine Daten" }: PieChartProps) {
  const titleId = useId();
  const [active, setActive] = useState<number | null>(null);

  const positive = slices.filter((slice) => slice.value > 0).sort((a, b) => b.value - a.value);

  const visible = positive.slice(0, PALETTE.length - 1);
  const overflow = positive.slice(PALETTE.length - 1);
  const data =
    overflow.length > 0
      ? [...visible, { label: "Andere", value: overflow.reduce((sum, s) => sum + s.value, 0) }]
      : visible;

  const total = data.reduce((sum, slice) => sum + slice.value, 0);

  if (total === 0) {
    return (
      <figure className={styles.card}>
        <figcaption className={styles.title}>{title}</figcaption>
        <p className={styles.empty}>{emptyLabel}</p>
      </figure>
    );
  }

  let offsetSoFar = 0;
  // Palette entries are consumed only by slices without a pinned color, so pinning one
  // never causes a duplicate color further down the list.
  let paletteCursor = 0;
  const arcs = data.map((slice) => {
    const fraction = slice.value / total;
    const color = slice.color ?? PALETTE[paletteCursor++ % PALETTE.length];
    const arc = {
      ...slice,
      color,
      fraction,
      dash: fraction * CIRCUMFERENCE,
      offset: offsetSoFar * CIRCUMFERENCE,
    };
    offsetSoFar += fraction;
    return arc;
  });

  const highlighted = active === null ? null : arcs[active];

  return (
    <figure className={styles.card}>
      <figcaption className={styles.title} id={titleId}>
        {title}
      </figcaption>

      <div className={styles.body}>
        <div className={styles.chartWrap}>
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className={styles.svg}
            role="img"
            aria-labelledby={titleId}
            /* -90deg puts the first slice at 12 o'clock, where a pie is read from. */
            style={{ transform: "rotate(-90deg)" }}
          >
            {arcs.map((arc, index) => (
              <circle
                key={arc.label}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={arc.color}
                strokeWidth={active === index ? STROKE + 6 : STROKE}
                strokeDasharray={`${arc.dash} ${CIRCUMFERENCE - arc.dash}`}
                strokeDashoffset={-arc.offset}
                className={styles.arc}
                opacity={active === null || active === index ? 1 : 0.35}
                onMouseEnter={() => setActive(index)}
                onMouseLeave={() => setActive(null)}
              />
            ))}
          </svg>
          <div className={styles.center}>
            <span className={styles.centerValue}>
              {highlighted ? highlighted.value : total}
            </span>
            <span className={styles.centerLabel}>
              {highlighted ? `${Math.round(highlighted.fraction * 100)}%` : (unit ?? "Total")}
            </span>
          </div>
        </div>

        <ul className={styles.legend}>
          {arcs.map((arc, index) => (
            <li
              key={arc.label}
              className={styles.legendItem}
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
              data-dimmed={active !== null && active !== index ? "true" : undefined}
            >
              <span className={styles.swatch} style={{ background: arc.color }} aria-hidden="true" />
              <span className={styles.legendLabel}>{arc.label}</span>
              <span className={styles.legendValue}>
                {arc.value}
                <span className={styles.legendPercent}>{Math.round(arc.fraction * 100)}%</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}
