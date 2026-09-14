/**
 * Pure CSV parsing/mapping for the member import - no server-only imports, so
 * the admin UI can read a file, detect its header, and let the admin confirm
 * (or fix) the column mapping entirely client-side before anything is sent to
 * the server. src/lib/admin/members.ts applies the confirmed mapping.
 */

export type CsvField =
  | "externalId"
  | "vorname"
  | "nachname"
  | "email"
  | "kategorie"
  | "mitgliederkarte"
  | "transferableCodeCount";

export const CSV_FIELDS: Array<{ key: CsvField; label: string; required: boolean }> = [
  { key: "externalId", label: "Mitglieds-ID", required: true },
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
  /** The club's member number. Identity for the whole import - see the migration
   *  add_member_external_id for why this rather than the e-mail address. */
  externalId: string;
  vorname: string;
  nachname: string;
  email: string;
  kategorie: string | null;
  mitgliederkarte: boolean;
  transferableCodeCount: number;
}

const HEADER_ALIASES: Record<string, CsvField> = {
  // The club's own member number, under the names an export is likely to give it.
  // Anything unrecognised is still mappable by hand in the import dialog.
  id: "externalId",
  "mitglieds-id": "externalId",
  mitgliedsid: "externalId",
  mitgliedsnummer: "externalId",
  mitgliedernummer: "externalId",
  mitgliednummer: "externalId",
  "mitglieds-nr": "externalId",
  "mitglieder-nr": "externalId",
  nummer: "externalId",
  nr: "externalId",
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

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

/**
 * Turns an uploaded file's bytes into text, guessing the encoding.
 *
 * Necessary because File.text() always decodes as UTF-8, with no way to ask for
 * anything else - while "CSV (Trennzeichen-getrennt)", the default CSV export of
 * Excel on a German Windows, writes Windows-1252. Every umlaut in such a file is
 * a single byte that is not valid UTF-8, so it arrives as U+FFFD and "Müller"
 * gets imported, and stored, as "M<?>ller".
 *
 * A byte-order mark settles the question outright. Without one, UTF-8 is tried
 * strictly: German text in a legacy encoding practically always contains a byte
 * sequence that is invalid UTF-8 (0xE4 0xF6 for "äö", say, where 0xE4 announces
 * a continuation byte that 0xF6 is not), so a failure here is a reliable signal
 * to fall back rather than a guess.
 */
export function decodeCsvBytes(bytes: Uint8Array): string {
  if (startsWith(bytes, [0xef, 0xbb, 0xbf])) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  if (startsWith(bytes, [0xff, 0xfe])) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (startsWith(bytes, [0xfe, 0xff])) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function parseBoolean(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "ja" || normalized === "yes" || normalized === "true" || normalized === "1";
}

/** What a club export realistically uses: Swiss/German Excel writes semicolons,
 *  international tools commas, a spreadsheet copy-paste tabs. */
const DELIMITERS = [";", ",", "\t"];

/** Counts a delimiter in one line, ignoring anything inside a quoted field -
 *  the same quote rule parseCsvTable applies, so detection and parsing can never
 *  disagree about where a field ends. */
function countDelimiter(line: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      count++;
    }
  }
  return count;
}

/**
 * Reads the delimiter off the file itself.
 *
 * The rule before was "semicolon if the text contains one anywhere, otherwise
 * comma", which broke a comma-separated export the moment a single field held a
 * semicolon - a category written "Aktiv; Vorstand" was enough to split the whole
 * file on the wrong character and scatter every column.
 *
 * A real delimiter separates the same number of fields on every line, so several
 * lines are sampled and consistency decides, not frequency. That is what keeps a
 * stray semicolon in one field from outvoting the commas that actually structure
 * the file.
 */
function detectDelimiter(lines: string[]): string {
  const sample = lines.slice(0, 10);
  let best = DELIMITERS[0];
  let bestScore = -1;

  for (const delimiter of DELIMITERS) {
    const counts = sample.map((line) => countDelimiter(line, delimiter));
    const inHeader = counts[0] ?? 0;
    // Absent from the header line - whatever else it is, it is not this file's delimiter.
    if (inHeader === 0) continue;
    const consistent = counts.every((count) => count === inHeader);
    // Any consistent candidate outranks any inconsistent one, whatever the counts;
    // between two equally consistent ones, the one yielding more columns wins.
    const score = (consistent ? 1000 : 0) + inHeader;
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }

  return best;
}

/** Tolerant of quoted fields, and of whichever delimiter the export happened to
 *  use - see detectDelimiter. */
export function parseCsvTable(content: string): string[][] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const delimiter = detectDelimiter(lines);
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
  /* A number repeated inside one file is a fault in the file, not two members. The
     import writes several rows at a time, so both would race at the unique index and
     one would come back as a raw constraint violation - said plainly here instead. */
  const seenIds = new Map<string, number>();

  for (let i = 1; i < table.length; i++) {
    const cells = table[i];
    const get = (field: CsvField): string | undefined => {
      const index = mapping[field];
      return index === undefined ? undefined : cells[index]?.trim();
    };

    const externalId = get("externalId");
    const nachname = get("nachname");
    const email = get("email");
    // Without the member number a row cannot be matched against anything, now or
    // in a later import - importing it anyway would plant the duplicate this whole
    // mechanism exists to prevent. Reported rather than quietly dropped.
    if (!externalId) {
      errors.push(`Zeile ${i + 1}: Mitglieds-ID fehlt - übersprungen.`);
      continue;
    }
    if (!nachname || !email) {
      errors.push(`Zeile ${i + 1}: Name und E-Mail sind erforderlich - übersprungen.`);
      continue;
    }
    const firstSeen = seenIds.get(externalId);
    if (firstSeen !== undefined) {
      errors.push(`Zeile ${i + 1}: Mitglieds-ID ${externalId} kommt schon in Zeile ${firstSeen} vor - übersprungen.`);
      continue;
    }
    seenIds.set(externalId, i + 1);

    const kategorie = get("kategorie");
    const mitgliederkarteRaw = get("mitgliederkarte");
    const transferableRaw = get("transferableCodeCount");

    rows.push({
      externalId,
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
