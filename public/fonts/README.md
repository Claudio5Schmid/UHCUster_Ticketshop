# Inter, for the ticket PDF

Static instances of Inter (Regular 400, Bold 700, Black 900), fetched from
Google Fonts (fonts.gstatic.com, Inter v20) on 2026-09-15, cut down once to the Latin
range with fontTools' pyftsubset (layout features and hinting dropped - pdf-lib places
glyphs itself), and embedded whole into every ticket PDF by `src/lib/tickets/pdf.ts`
(docs/DECISIONS.md D61). pdf-lib's own per-document subsetting is not used: it drops
most of Inter's glyphs.

Inter is licensed under the SIL Open Font License 1.1, which permits embedding
in documents. Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter).
The website loads the same family through `next/font/google`; these files exist
because pdf-lib needs a font program on disk, not a CSS reference.
