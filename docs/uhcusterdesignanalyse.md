# UHC Uster — Design-Analyse & Redesign-Schema

## 1. Analyse der bestehenden Website (uhcuster.ch)

Die aktuelle Seite ist eine klassische **Vereins-/Sportseite**: sehr dicht, viele Inhalte pro Screen, kaum Weisraum, kein einheitliches Grid. Konkret beobachtet:

- **Navbar**: dunkelgrau (`#333333`), weisser Text bei 60% Opazität, aktiver Menüpunkt durch rote Unterstreichung markiert. Sehr kompakt (~11px Schrift), viele Menüpunkte + Icon-Leiste (Login, Account, Warenkorb, Social Icons, Sponsor-Logo) alle in einer Zeile.
- **Hero**: Vollbild-Foto (Bistro-Team-Szene) mit Text direkt auf dem Bild (weisse Schrift ohne klaren Kontrast-Schutz), Overlay wirkt eher zufällig als gestaltet.
- **Typografie**: Font "MuseoSansRounded", H1 ca. 23px, H2 ca. 19px, Fliesstext ca. 15px — für heutige Standards **sehr klein**, wenig Zeilenabstand, wenig Hierarchie.
- **Farben**: Weiss als Basis, Rot (`#e3001b`-artiger UHC-Rot-Ton aus dem Logo) als Akzent, Dunkelgrau/Schwarz für die Navigation, Standardgrau (`#444`) als Fliesstext-Farbe.
- **Layout**: Kein sichtbares Max-Width-Grid mit grosszügigen Rändern — Content wirkt "randvoll", Karten (News, Spielansetzungen) ohne Radius, ohne Schatten, nur durch dünne Linien/Flächen getrennt.
- **Komponenten**: Karten für News und Spiele sind reine Rechtecke ohne visuelle Tiefe, Buttons sind eigentlich nur Textlinks ("weiter lesen…"), keine echten CTA-Buttons.
- **Dichte**: Sehr viel Information gleichzeitig sichtbar (News-Feed + Spielplan-Sidebar + Sponsoren-Leiste), kein "atmender" Aufbau.

Kurz: **funktional, aber optisch aus einer älteren Web-Ära** — genau das Gegenteil von minimalistisch/editorial.

---

## 2. Angepasstes Design-Schema (Zielbild: minimalistisch, hochwertig, editorial)

Das folgende Schema übernimmt Marke (Rot/Schwarz/Weiss) und Inhalt des UHC Uster, aber übersetzt sie in eine moderne, ruhige Bildsprache.

### DESIGN DIRECTION
- Minimalistisch, editorial, "premium sports club" statt "Vereins-Website"
- Viel Weissraum, wenige Elemente pro Blickfeld
- Fotografie gross und hochwertig statt klein und zugeschnitten
- Klare, ruhige Hierarchie: ein Fokuspunkt pro Section

### LAYOUT
- Max content width: **1200px**, zentriert
- 12-Spalten-Grid, Gutter 24px
- Section-Innenabstand: **120–160px vertikal** auf Desktop, 64px auf Mobile
- Desktop-first, bricht bei 1024px / 768px / 480px
- Nur eine klare Content-Spalte pro Section (News/Spielplan visuell getrennt statt nebeneinander gequetscht)

### TYPOGRAPHY
- Schriftfamilie: eine moderne Grotesk/Sans (z. B. Inter, Neue Haas, oder Söhne) statt MuseoSansRounded — behält runde, freundliche Anmutung, wirkt aber hochwertiger
- H1: **68px, bold (700)**, Line-height 1.05, max. 2 Zeilen
- H2: **44px, semibold (600)**, Line-height 1.15
- H3 (Karten-Titel): 22px, semibold
- Body: **18px**, Line-height 1.6, Farbe Sekundärtext
- Kurze, prägnante Headlines statt vollständiger Sätze in Grossbuchstaben (aktuell: "WO SCHNITZEL, GEHEIMZUTATEN UND TEAMWORK ZUSAMMENKOMMEN" → könnte auf "Team hinter dem Team" verkürzt werden)

### COLORS
- Background: `#FFFFFF` (Sections abwechselnd `#FAFAFA` für Rhythmus)
- Primary text: `#111111` (statt aktuell `#444`)
- Secondary text: `#6B6B6B`
- Accent (Marke): `#E4032E` (UHC-Rot, aus Logo abgeleitet) — sparsam eingesetzt, nur für CTAs, Live-Badges, aktive Zustände
- Dunkler Kontrastblock: `#111111` (ersetzt das bisherige `#333` der Navbar) für Footer/dunkle Sections
- Keine Verläufe, keine Schatten ausser sehr subtil (`0 1px 2px rgba(0,0,0,0.04)`)

### COMPONENTS
- **Navbar**: transparent über dem Hero, wird beim Scrollen weiss mit feinem Bottom-Border; Logo links, 5–6 Hauptpunkte zentriert/rechts, ein einzelner roter CTA-Button rechts ("Tickets" o. ä.), Icons (Social, Account) in ein Overflow-Menü verschoben statt alle sichtbar
- **Buttons**: Primär = schwarz gefüllt, weisser Text, radius 4px, Hover → Rot; Sekundär = outline, 1px `#111`, transparent bg
- **Cards** (News/Spiele): weisser Hintergrund, radius 12px, Schatten `0 1px 3px rgba(0,0,0,0.06)`, grosszügiges Innenpolster (32px), Bild oben mit 16:9, Datum als kleines Label in Rot/Grau
- **Testimonials/Zitate** (z. B. SRF-Erwähnung): grosses Zitat in editorial-Serif oder Grotesk-Light, 32px, zentriert, mit Quelle darunter in Kapitälchen

### SPACING
- Navbar → Hero: 0 (Navbar liegt transparent über dem Hero-Bild)
- Heading → Text: 24px
- Text → CTA: 40px
- Section → Section: 140px (Desktop) / 64px (Mobile)
- Innerhalb einer Card: 24–32px Innenabstand, 16px zwischen Titel und Text

### COPY STYLE
- Direkt, prägnant, selbstbewusst — keine langen Marketing-Sätze
- Headlines auf max. 4–6 Wörter kürzen
- Aktive CTAs: "Tickets sichern", "Zum Spielplan", "Team kennenlernen" statt "weiter lesen…"

### PAGE STRUCTURE
1. Navbar (transparent/sticky)
2. Hero — ein Foto, eine Headline, ein CTA (z. B. nächstes Heimspiel)
3. Social Proof — Sponsoren-Logos in ruhiger, monochromer Reihe + kurzes SRF-Zitat
4. Features/News — 3 grosse Editorial-Cards statt Feed-Liste
5. Spielplan — horizontale, klar gegliederte Liste kommender Spiele (Datum, Gegner, Ort), keine Sidebar-Kachel-Wand
6. Nachwuchs/Verein — ein ruhiger Storytelling-Block mit Bild + Text
7. Footer — dunkler Block (`#111`), Social/Links/Sponsoren

---

## 3. Prompt für ein zusätzliches Tool im gleichen Design-Stil

Der folgende Prompt kann direkt in ein Tool wie v0, Cursor, Claude Code, Lovable etc. eingesetzt werden, um ein neues Feature (z. B. Spielplan-Widget, Ticket-Tool, Mitglieder-Portal) zu bauen, das optisch zur neu gestalteten UHC-Uster-Seite passt:

```
Baue [BESCHREIBE HIER DAS TOOL, z.B. "ein Spielplan- und Ticket-Buchungs-Tool für den UHC Uster"]
im folgenden Design-System, damit es visuell nahtlos zur bestehenden UHC Uster Website passt:

DESIGN SYSTEM
- Stil: minimalistisch, hochwertig, editorial/premium, viel Whitespace
- Max content width: 1200px, zentriert, 12-Spalten-Grid, Gutter 24px
- Section-Abstände: 140px vertikal (Desktop), 64px (Mobile)

Typografie:
- Schrift: moderne Grotesk (Inter oder vergleichbar)
- H1: 68px / bold / line-height 1.05, max. 2 Zeilen
- H2: 44px / semibold / line-height 1.15
- H3: 22px / semibold
- Body: 18px / line-height 1.6
- Kurze, prägnante Headlines, aktive Sprache, keine Marketing-Floskeln

Farben:
- Background: #FFFFFF (alternierend #FAFAFA)
- Primärtext: #111111
- Sekundärtext: #6B6B6B
- Akzentfarbe: #E4032E (UHC-Rot), sparsam für CTAs, Badges, aktive Zustände
- Dunkler Kontrastblock: #111111 (z.B. Footer, dunkle Sections)
- Keine Verläufe, nur sehr subtile Schatten (0 1px 3px rgba(0,0,0,0.06))

Komponenten:
- Buttons: primär schwarz gefüllt/weisser Text/radius 4px, Hover zu Rot; sekundär outline 1px #111
- Cards: weiss, radius 12px, Schatten 0 1px 3px rgba(0,0,0,0.06), 32px Innenpolster, Bild 16:9 oben
- Navbar: transparent über Hero, wird beim Scrollen weiss mit feinem Border, Logo links, max. 5-6 Menüpunkte, ein roter CTA-Button rechts

Struktur des Tools:
1. [Definiere hier die konkreten Screens/Schritte des Tools]
2. ...

Wichtig: Verwende durchgehend das UHC-Uster-Rot (#E4032E) als einzige Akzentfarbe,
Schwarz/Weiss/Grau als Basis, und halte die Bedienung so reduziert wie möglich
(ein klarer CTA pro Screen, keine überladenen Sidebars).
```

Passe die eckigen Klammern an das konkrete Tool an (z. B. "Ticket-Buchung für Heimspiele", "Mitglieder-Login mit Trainingsplänen", "Live-Ticker für Spiele").
