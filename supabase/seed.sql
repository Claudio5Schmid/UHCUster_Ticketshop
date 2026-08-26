-- Initial product catalog for the 2026/27 season, from the real price list Claudio
-- provided (see docs/DECISIONS.md D3, D8, D9, D10, D11). Not test fixtures - this is
-- the actual initial catalog, applied once via the Supabase MCP integration (no
-- local Docker stack in this environment) and kept here per Supabase convention.
--
-- Deliberately excluded, per the brief and the decisions log:
--   - Familienticket (single-game only, D10-adjacent: single tickets are Eventfrog's
--     concern entirely, never sold in this shop)
--   - Playoff-Zuschlag (D10: out of scope, Eventfrog's concern)
--   - Saisonabo+ (D11: out of scope, handled entirely on unihockey.swiss)
--
-- "Mitglieder UHC Uster" exists as a row (tickets need a product to attach to once
-- CSV import lands, Phase 5b) but active = false, so it never appears in the public
-- shop - it isn't a self-service purchase, per D7.

insert into public.products (slug, name, description, type, price_rappen, tier_level, benefits, active, sort_order, valid_season)
values
  (
    'saisonkarte-erwachsener',
    'Saisonkarte Erwachsene',
    'Zutritt zu allen Heimspielen des UHC Uster in der Saison 26/27.',
    'season_pass',
    15000,
    0,
    '{"highlights": ["Zutritt zu allen Heimspielen der Saison 26/27"], "single_ticket_price_rappen": 2000}'::jsonb,
    true,
    1,
    '2627'
  ),
  (
    'saisonkarte-reduziert',
    'Saisonkarte Reduziert',
    'Für Schüler ab 12 Jahren, Lehrlinge, Studierende, Rentner, IV und Militär (gegen Vorweisung eines Ausweises), sowie Mitglieder der Vereine des Netzwerk Zürich Oberland.',
    'season_pass',
    8000,
    0,
    '{"highlights": ["Zutritt zu allen Heimspielen der Saison 26/27", "Ausweis wird beim Einlass geprüft"], "single_ticket_price_rappen": 1000}'::jsonb,
    true,
    2,
    '2627'
  ),
  (
    'sponsoren-legi',
    'UHC Sponsoren Legi',
    'Für Lehrlinge von Sponsoren. Die Legi muss beim Einlass zusammen mit dem Ticket vorgewiesen werden.',
    'season_pass',
    0,
    0,
    '{"highlights": ["Zutritt zu allen Heimspielen der Saison 26/27", "Sponsoren-Legi muss beim Einlass vorgewiesen werden"]}'::jsonb,
    true,
    3,
    '2627'
  ),
  (
    'mitglieder-uhc-uster',
    'Mitglieder UHC Uster',
    'Saisonkarte für Vereinsmitglieder - wird nicht über den Shop bestellt, sondern automatisch anhand der Mitgliederliste ausgestellt.',
    'season_pass',
    0,
    0,
    '{"highlights": ["Zutritt zu allen Heimspielen der Saison 26/27 mit Mitgliederkarte"]}'::jsonb,
    false,
    0,
    '2627'
  ),
  (
    'red-castle-club-normal',
    'Red Castle Club Normal',
    'Der Einstieg in den Red Castle Club.',
    'membership',
    30000,
    1,
    '{"highlights": ["Persönliche Saisonkarte", "1x Teilnahme am Netzwerk-Apéro (1 Person)"]}'::jsonb,
    true,
    10,
    '2627'
  ),
  (
    'red-castle-club-bronze',
    'Red Castle Club Bronze',
    NULL,
    'membership',
    100000,
    2,
    '{"highlights": ["Übertragbare VIP-Saisonkarten für 2 Personen", "Zwei gratis Getränke an den Heimspielen des L-UPL-Teams", "2x Teilnahme am Netzwerk-Apéro (2 Personen)"]}'::jsonb,
    true,
    11,
    '2627'
  ),
  (
    'red-castle-club-silber',
    'Red Castle Club Silber',
    NULL,
    'membership',
    250000,
    3,
    '{"highlights": ["Übertragbare VIP-Saisonkarten für 2 Personen", "Gratis Getränke an den Heimspielen des L-UPL-Teams (max. 6 Getränke)", "2x Teilnahme am Netzwerk-Apéro (2 Personen)"]}'::jsonb,
    true,
    12,
    '2627'
  ),
  (
    'red-castle-club-gold',
    'Red Castle Club Gold',
    NULL,
    'membership',
    500000,
    4,
    '{"highlights": ["Übertragbare VIP-Saisonkarten für 3 Personen", "Gratis Essen & gratis Getränke an den Heimspielen des L-UPL-Teams (max. 9 Getränke & 3 Essen)", "2x Teilnahme am Netzwerk-Apéro (3 Personen)"]}'::jsonb,
    true,
    13,
    '2627'
  );
