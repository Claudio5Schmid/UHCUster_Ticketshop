import Image from "next/image";
import { getTeamLogo } from "@/lib/teamLogos";
import styles from "./TeamLogo.module.css";

interface TeamLogoProps {
  team: string;
}

/**
 * The opponent's crest, standing in for their name in the fixture lists. The
 * name still reaches screen readers through `alt` - it's only the visible
 * lettering the crest replaces.
 */
export function TeamLogo({ team }: TeamLogoProps) {
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
      alt={team}
      width={logo.width}
      height={logo.height}
      className={styles.logo}
    />
  );
}
