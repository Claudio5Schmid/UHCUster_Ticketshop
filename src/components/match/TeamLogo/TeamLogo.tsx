import Image from "next/image";
import { getTeamLogo } from "@/lib/teamLogos";
import styles from "./TeamLogo.module.css";

interface TeamLogoProps {
  team: string;
  /** "sm" for dense chrome (scanner bar, admin tables); "md" for the shop's fixture rows. */
  size?: "sm" | "md";
  /**
   * Set where the club's name is already printed next to the crest, so a screen
   * reader announces it once rather than twice.
   */
  decorative?: boolean;
}

/**
 * A club's crest. Used anywhere a specific game is shown - the shop's fixture
 * lists, the scanner, the admin live view - so that a game always looks the same
 * across the app rather than being lettering in one place and a crest in another.
 */
export function TeamLogo({ team, size = "md", decorative = false }: TeamLogoProps) {
  const logo = getTeamLogo(team);

  // No crest on file (a newly promoted club, or a name typed by hand in the
  // admin schedule that the map doesn't know): show the name rather than
  // leaving the row with nothing to identify the game by.
  if (!logo) {
    return <span className={styles.fallback}>{team}</span>;
  }

  return (
    <Image
      src={logo.src}
      alt={decorative ? "" : team}
      width={logo.width}
      height={logo.height}
      className={size === "sm" ? `${styles.logo} ${styles.sm}` : styles.logo}
    />
  );
}
