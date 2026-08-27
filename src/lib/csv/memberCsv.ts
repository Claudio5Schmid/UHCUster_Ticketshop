/**
 * Pure CSV parsing/mapping for the member import - no server-only imports, so
 * the admin UI can read a file, detect its header, and let the admin confirm
 * (or fix) the column mapping entirely client-side before anything is sent to
 * the server. src/lib/admin/members.ts applies the confirmed mapping.
 */

export type CsvField = "vorname" | "nachname" | "email" | "kategorie" | "mitgliederkarte" | "transferableCodeCount";

export const CSV_FIELDS: Array<{ key: CsvField; label: string; required: boolean }> = [
  { key: "vorname", label: "Vorname", required: false },
  { key: "nachname", label: "Name", required: true },
  { key: "email", label: "E-Mail", required: true },
  { key: "kategorie", label: "Kategorie", required: false },
  { key: "mitgliederkarte", label: "Mitgliederkarte (ja/nein)", required: false },
  { key: "transferableCodeCount", label: "Anzahl übertragbare Codes", required: false },
];

/** Field -> index of the CSV column it comes from. Absent = "not in this file". */
export type CsvColumnMapping = Partial<Record<CsvField, number>>;

export interface MemberCsvRow {
  vorname: string;
  nachname: string;
  email: string;
  kategorie: string | null;
  mitgliederkarte: boolean;
  transferableCodeCount: number;
}

const HEADER_ALIASES: Record<string, CsvField> = {
  vorname: "vorname",
  nachname: "nachname",
  name: "nachname",
  email: "email",
  "e-mail": "email",
  kategorie: "kategorie",
  mitgliederkarte: "mitgliederkarte",
  "anzahl übertragbare codes": "transferableCodeCount",
  "übertragbare codes": "transferableCodeCount",
  "wie viele übertragbare codes": "transferableCodeCount",
};

function parseBoolean(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "ja" || normalized === "yes" || normalized === "true" || normalized === "1";
}

/** Semicolon- or comma-separated, tolerant of quoted fields - matches typical
 * Swiss/German Excel CSV exports (semicolon) without requiring a specific one. */
export function parseCsvTable(content: string): string[][] {
  const delimiter = content.includes(";") ? ";" : ",";
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  return lines.map((line) => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        cells.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    return cells;
  });
}

export function parseCsvHeader(content: string): string[] {
  return parseCsvTable(content)[0] ?? [];
}

/** Best-effort guess at which CSV column holds which field, from known
 * German/English header names - prefills the mapping step so the admin
 * usually just confirms it rather than building it from scratch. Never used
 * to import directly - see parseMemberCsvRows. */
export function detectColumnMapping(header: string[]): CsvColumnMapping {
  const mapping: CsvColumnMapping = {};
  header.forEach((h, index) => {
    const key = HEADER_ALIASES[h.toLowerCase().trim()];
    if (key && mapping[key] === undefined) mapping[key] = index;
  });
  return mapping;
}

/** Applies an explicit column mapping - confirmed by the admin, not just
 * guessed - to the CSV's data rows. The mapping step exists so a misdetected
 * or unusual header never silently imports the wrong column into the wrong
 * field. */
export function parseMemberCsvRows(content: string, mapping: CsvColumnMapping): { rows: MemberCsvRow[]; errors: string[] } {
  const table = parseCsvTable(content);
  if (table.length === 0) {
    return { rows: [], errors: ["Die Datei ist leer."] };
  }

  const rows: MemberCsvRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < table.length; i++) {
    const cells = table[i];
    const get = (field: CsvField): string | undefined => {
      const index = mapping[field];
      return index === undefined ? undefined : cells[index]?.trim();
    };

    const nachname = get("nachname");
    const email = get("email");
    if (!nachname || !email) {
      errors.push(`Zeile ${i + 1}: Name und E-Mail sind erforderlich - übersprungen.`);
      continue;
    }

    const kategorie = get("kategorie");
    const mitgliederkarteRaw = get("mitgliederkarte");
    const transferableRaw = get("transferableCodeCount");

    rows.push({
      vorname: get("vorname") ?? "",
      nachname,
      email,
      kategorie: kategorie || null,
      mitgliederkarte: mitgliederkarteRaw ? parseBoolean(mitgliederkarteRaw) : false,
      transferableCodeCount: transferableRaw ? parseInt(transferableRaw, 10) || 0 : 0,
    });
  }

  return { rows, errors };
}
