# Playwright Retrofit — UHC Uster Ticket Shop

## Warum jetzt und wie aufgeteilt

Die Implementierung ist durch, der Deadline (5. September) ist nah. Ziel ist **keine vollständige Testabdeckung**, sondern ein schlankes Sicherheitsnetz für die geschäftskritischen Pfade, bevor der Season-Pass-Verkauf live geht.

Zwei Testumgebungen, klar getrennt nach Zweck:

| Umgebung | Zweck | Welche Tests |
|---|---|---|
| **Lokal** (Dev-Server + Test-/Seed-Daten in Supabase) | Schnelle, deterministische Business-Logik-Tests mit voller Kontrolle über DB-Zustand | Bestellablauf, Admin-Login, ZIP-Download, E-Mail-Trigger (SES gemockt) |
| **Vercel Preview Deployments** | Smoke-Test der tatsächlich deployten Umgebung (Build, Env-Vars, Routing, Auth in echter Infra) | Kritische Seiten laden, kein 500er, Checkout-Formular erreichbar, Admin-Login funktioniert gegen echte Supabase-Instanz |

**Wichtig:** Preview-Tests sollen **keine echten Bestellungen mit Bankverbindung erzeugen**, die im Admin-Bereich der Geschäftsstelle auftauchen — sonst müsst ihr die vor dem Launch wieder manuell bereinigen. Preview-Tests sind reine "lädt die Seite / funktioniert Auth"-Checks. Alles, was Daten schreibt, läuft lokal gegen eine Test-Instanz (oder einen Supabase-Dev-Branch, falls ihr den nutzt).

## Testfälle

### Lokal (schreibend, gegen Test-DB)

1. **Season-Pass-Bestellung E2E**
   Produkt wählen → Formular ausfüllen → absenden → Bestellung erscheint in Supabase mit korrektem Status → SES-Send wird ausgelöst (Mock/Intercept, kein echter Versand nötig) → Bestellbestätigung enthält Bankverbindung/Referenz.

2. **Red Castle Club Membership Bestellung**
   Analog zu 1, falls der Ablauf/Formular sich unterscheidet.

3. **Admin: Login + Order-Sichtbarkeit**
   Login → neue Bestellung ist prominent als "neu" markiert (da keine automatische Benachrichtigung an die Geschäftsstelle existiert, ist das euer einziger Hinweis) → Order-Detail öffnen.

4. **Admin: ZIP-Download**
   Order auswählen → ZIP herunterladen → Dateiname-Konvention prüfen (lesbar, wie in den Anforderungen festgelegt) → ZIP enthält PDF + Wallet-Pass-Dateien.

5. **Wallet-Pass-Dateien sind valide** (kein Browser-Test — separater Node-Test, aber gehört ins gleiche CI-Gate)
   `.pkpass`-Struktur/Signatur und Google-Wallet-JWT auf syntaktische Korrektheit prüfen. Läuft nicht über Playwright, sollte aber im selben CI-Schritt laufen.

### Preview Deployment (lesend / nicht-destruktiv)

6. **Startseite + Produktseiten laden ohne Fehler**
   Homepage, Season-Pass-Seite, Membership-Seite — je ein Check auf HTTP 200 und keine Console-Errors.

7. **Eventfrog-Link-out funktioniert**
   Link vorhanden, korrektes `href`, öffnet extern (kein Klick-Follow nötig, nur Attribut-Check).

8. **Admin-Login gegen echte Auth**
   Login mit Test-Account auf Preview → landet im Dashboard. Bestätigt, dass Supabase-Auth-Konfiguration im Deployment korrekt ist (häufige Fehlerquelle: fehlende Env-Vars auf Vercel).

9. **Checkout-Formular ist erreichbar und validiert clientseitig**
   Formular bis kurz vor Submit durchklicken, Pflichtfeld-Validierung prüfen — **nicht absenden**.

## Claude Code Prompt

Kopiere den folgenden Block in eine neue Claude Code Session im Projekt-Root:

```
Wir richten ein schlankes Playwright-Test-Setup für das bestehende UHC Uster Ticket-Shop-Projekt ein. Alle Phasen der Implementierung sind abgeschlossen — das ist ein Retrofit, keine Neuentwicklung.

Bevor du irgendetwas implementierst, durchlaufe folgende Interrogation und logge die Antworten in `decisions/playwright-retrofit-decisions.md`:

1. Welches Framework/welcher Router wird verwendet (Next.js App/Pages Router, o.ä.) — relevant für Vercel Preview URL-Ermittlung in CI?
2. Existiert bereits eine Supabase Test-/Seed-Strategie (z.B. ein Dev-Branch, eine separate Test-Datenbank, oder Seed-Skripte)? Falls nicht: schlage die einfachste Option vor, die zur bestehenden Supabase-Pro-Konfiguration passt.
3. Wie wird SES aktuell in der Codebase versendet (direkter SDK-Call, Edge Function, o.ä.)? Das bestimmt, wie wir den Versand in lokalen Tests abfangen/mocken, ohne echte Mails zu verschicken.
4. Gibt es bereits einen Admin-Test-Account, oder muss einer angelegt werden?
5. Läuft die CI aktuell über GitHub Actions, Vercel selbst, oder gar nicht? Das bestimmt, wo die zwei Test-Suiten (lokal/schreibend vs. Preview/lesend) ausgeführt werden.

Setze danach zwei getrennte Playwright-Konfigurationen auf:

- `playwright.config.local.ts`: läuft gegen `npm run dev` (oder Äquivalent) mit Test-Supabase-Daten. Schreibende, destruktive Tests.
- `playwright.config.preview.ts`: läuft gegen eine per Env-Var übergebene Preview-URL (`PLAYWRIGHT_BASE_URL`). Nur lesende/nicht-destruktive Tests — niemals ein Bestellformular tatsächlich absenden.

Implementiere folgende Tests (Details siehe `playwright-retrofit-prompt.md` im Repo-Root, den ich beilege):

Lokal (schreibend):
- Season-Pass-Bestellung E2E inkl. SES-Mock-Verifikation
- Red Castle Club Membership Bestellung
- Admin: Login + "neue Bestellung"-Sichtbarkeit
- Admin: ZIP-Download inkl. Dateinamen- und Inhaltsprüfung (PDF + Wallet-Pass vorhanden)

Preview (lesend):
- Homepage + Produktseiten laden fehlerfrei
- Eventfrog-Link-out Attribut-Check
- Admin-Login gegen echte Preview-Auth
- Checkout-Formular erreichbar + clientseitige Validierung, OHNE Absenden

Halte die Tests bewusst minimal — kein Anspruch auf Vollabdeckung. Ziel ist ein Regressionsnetz für die verbleibenden Tage bis zum 5. September, nicht eine vollständige Test-Suite. Frage nach, falls eine der fünf Interrogationsfragen nicht eindeutig aus der Codebase beantwortbar ist.
```

## Hinweis zur Ausführung

- Lokale Suite: kann als `npm run test:e2e:local` in den Alltag eingebaut werden — läuft schnell, sinnvoll nach jedem größeren Change.
- Preview-Suite: am sinnvollsten als GitHub-Action-Step, der nach jedem Vercel-Preview-Deploy automatisch gegen die Preview-URL läuft (Vercel stellt die Preview-URL als Deployment-Output bereit).
- Vor dem 5. September reicht es, beide Suiten **einmal manuell komplett grün** zu bekommen und danach nur noch bei Änderungen an den kritischen Pfaden erneut laufen zu lassen — Automatisierung der CI-Pipeline selbst ist optional und kann nach dem Launch nachgezogen werden, falls die Zeit knapp wird.
