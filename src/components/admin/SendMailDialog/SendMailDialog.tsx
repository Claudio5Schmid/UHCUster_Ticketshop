"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal/Modal";
import { Input } from "@/components/ui/Input/Input";
import { Select } from "@/components/ui/Select/Select";
import { Button } from "@/components/ui/Button/Button";
import { matchesSendConfirmation, SEND_CONFIRMATION_PHRASE } from "@/lib/admin/send-confirmation";
import { placeholdersIn, type MailTemplate, type PlaceholderInfo } from "@/lib/email/templates";
import styles from "@/app/admin/(protected)/admin.module.css";
import own from "./SendMailDialog.module.css";

/**
 * The one send dialog (brief §4, "dieselbe Versand-Komponente"): the members tab
 * and the orders tab both mount it and hand in what differs - who the
 * recipients are, which templates and placeholders apply, and how a preview,
 * a test mail and the send itself are carried out.
 *
 * Two screens: write (template, subject, text, preview, test mail) and confirm
 * (the count in words, the typed phrase, D42). The send runs in chunks the
 * parent decides on, and reports progress back so a long list does not sit
 * behind a still screen.
 */

export interface MailPreview {
  to: string;
  subject: string;
  bodyText: string;
  attachmentNames: string[];
}

export interface SendSummary {
  sent: number;
  skipped: Array<{ label: string; reason: string }>;
  failed: Array<{ label: string; reason: string }>;
}

export interface SendMailDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** "Mitglied" / "Bestellung" - what one recipient is called. */
  recipientNoun: { one: string; many: string };
  /** Selected recipients that would receive something with the current options. */
  recipientCount: number;
  /** Selected recipients that were already informed - offered for a repeat send. */
  alreadyNotifiedCount?: number;
  /** Selected but with nothing to send (no live cards, cancelled). */
  emptyCount?: number;
  /** The recipients the preview can be rendered for. */
  previewCandidates: Array<{ id: string; label: string }>;
  templates: MailTemplate[];
  placeholders: PlaceholderInfo[];
  /** Prefills the test-mail field; the signed-in admin's address. */
  defaultTestAddress: string;
  onPreview: (recipientId: string, subject: string, body: string) => Promise<MailPreview>;
  onSendTest: (recipientId: string, subject: string, body: string, to: string) => Promise<void>;
  /** Runs the whole send; calls onProgress after every chunk. */
  onSend: (
    subject: string,
    body: string,
    confirmationPhrase: string,
    options: { includeAlreadyNotified: boolean },
    onProgress: (done: number, total: number) => void
  ) => Promise<SendSummary>;
  onDone: (summary: SendSummary) => void;
}

/**
 * Mounted only while open, so every opening starts from a clean slate - the
 * last send's typed phrase, progress bar and preview never carry over.
 */
export function SendMailDialog(props: SendMailDialogProps) {
  if (!props.open) return null;
  return <SendMailDialogBody {...props} />;
}

function SendMailDialogBody(props: SendMailDialogProps) {
  const { open, onClose, templates, placeholders, previewCandidates } = props;
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [subject, setSubject] = useState(templates[0]?.subject ?? "");
  const [body, setBody] = useState(templates[0]?.body ?? "");
  const [includeAlreadyNotified, setIncludeAlreadyNotified] = useState(false);

  const [previewId, setPreviewId] = useState(previewCandidates[0]?.id ?? "");
  const [preview, setPreview] = useState<MailPreview | null>(null);
  const [testAddress, setTestAddress] = useState(props.defaultTestAddress);
  const [testSent, setTestSent] = useState<string | null>(null);

  const [step, setStep] = useState<"compose" | "confirm">("compose");
  const [confirmation, setConfirmation] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // A preview describes one text for one recipient; changing either makes it stale.
  function changeSubject(value: string) {
    setSubject(value);
    setPreview(null);
  }
  function changeBody(value: string) {
    setBody(value);
    setPreview(null);
  }
  function changePreviewId(value: string) {
    setPreviewId(value);
    setPreview(null);
  }

  function chooseTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((candidate) => candidate.id === id);
    if (!template) return;
    changeSubject(template.subject);
    changeBody(template.body);
  }

  const known = new Set(placeholders.map((info) => info.key));
  const unknownPlaceholders = placeholdersIn(`${subject}\n${body}`).filter((key) => !known.has(key));

  const total = props.recipientCount + (includeAlreadyNotified ? (props.alreadyNotifiedCount ?? 0) : 0);
  const noun = total === 1 ? props.recipientNoun.one : props.recipientNoun.many;

  function handlePreview() {
    if (!previewId) return;
    setError(null);
    startTransition(async () => {
      try {
        setPreview(await props.onPreview(previewId, subject, body));
      } catch (previewError) {
        setError(previewError instanceof Error ? previewError.message : "Vorschau fehlgeschlagen.");
      }
    });
  }

  function handleTest() {
    if (!previewId || !testAddress.trim()) return;
    setError(null);
    setTestSent(null);
    startTransition(async () => {
      try {
        await props.onSendTest(previewId, subject, body, testAddress.trim());
        setTestSent(testAddress.trim());
      } catch (testError) {
        setError(testError instanceof Error ? testError.message : "Testmail fehlgeschlagen.");
      }
    });
  }

  function handleSend() {
    setError(null);
    setProgress({ done: 0, total });
    startTransition(async () => {
      try {
        const summary = await props.onSend(subject, body, confirmation, { includeAlreadyNotified }, (done, all) =>
          setProgress({ done, total: all })
        );
        setProgress(null);
        props.onDone(summary);
      } catch (sendError) {
        setProgress(null);
        setError(sendError instanceof Error ? sendError.message : "Versand fehlgeschlagen.");
      }
    });
  }

  const canSend = matchesSendConfirmation(confirmation) && total > 0 && !isPending;

  return (
    <Modal open={open} onClose={progress ? () => {} : onClose} title={props.title}>
      {step === "compose" ? (
        <div className={styles.form} style={{ maxWidth: 640 }}>
          <p style={{ color: "var(--color-text-secondary)", margin: 0 }}>
            <strong>{props.recipientCount}</strong> {props.recipientCount === 1 ? props.recipientNoun.one : props.recipientNoun.many}{" "}
            ausgewählt, an die etwas versendet wird.
            {props.emptyCount ? ` ${props.emptyCount} ohne aktive Karten werden übersprungen.` : ""}
          </p>

          {(props.alreadyNotifiedCount ?? 0) > 0 && (
            <label className={styles.checkboxRow}>
              <input type="checkbox" checked={includeAlreadyNotified} onChange={(e) => setIncludeAlreadyNotified(e.target.checked)} />
              {props.alreadyNotifiedCount} bereits informierte {props.alreadyNotifiedCount === 1 ? props.recipientNoun.one : props.recipientNoun.many}{" "}
              trotzdem erneut anschreiben
            </label>
          )}

          <Select label="Vorlage" value={templateId} onChange={(e) => chooseTemplate(e.target.value)}>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.label}
              </option>
            ))}
          </Select>

          <Input label="Betreff" value={subject} onChange={(e) => changeSubject(e.target.value)} />
          <label className={styles.textareaLabel}>
            Nachricht
            <textarea value={body} onChange={(e) => changeBody(e.target.value)} rows={10} className={styles.textarea} />
          </label>

          <div className={own.placeholders}>
            <span className={own.placeholdersTitle}>Platzhalter</span>
            <ul className={own.placeholderList}>
              {placeholders.map((info) => (
                <li key={info.key}>
                  <code>{`{${info.key}}`}</code> {info.description}
                </li>
              ))}
            </ul>
            {unknownPlaceholders.length > 0 && (
              <p className={own.placeholderWarning}>
                Unbekannt und würde so stehen bleiben: {unknownPlaceholders.map((key) => `{${key}}`).join(", ")}
              </p>
            )}
          </div>

          <div className={own.previewBlock}>
            <div className={styles.formRow}>
              <Select label="Vorschau für" value={previewId} onChange={(e) => changePreviewId(e.target.value)}>
                {previewCandidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.label}
                  </option>
                ))}
              </Select>
              <div className={own.previewActions}>
                <Button type="button" variant="secondary" size="sm" onClick={handlePreview} disabled={isPending || !previewId}>
                  Vorschau anzeigen
                </Button>
              </div>
            </div>
            {preview && (
              <div className={own.preview}>
                <div className={own.previewMeta}>
                  <span>
                    <strong>An:</strong> {preview.to}
                  </span>
                  <span>
                    <strong>Betreff:</strong> {preview.subject}
                  </span>
                  <span>
                    <strong>Anhang:</strong> {preview.attachmentNames.length > 0 ? preview.attachmentNames.join(", ") : "keiner"}
                  </span>
                </div>
                <pre className={own.previewBody}>{preview.bodyText}</pre>
              </div>
            )}
            <div className={styles.formRow}>
              <Input label="Testmail an" type="email" value={testAddress} onChange={(e) => setTestAddress(e.target.value)} />
              <div className={own.previewActions}>
                <Button type="button" variant="secondary" size="sm" onClick={handleTest} disabled={isPending || !previewId || !testAddress.trim()}>
                  Testmail senden
                </Button>
              </div>
            </div>
            {testSent && <p className={styles.successMessage}>Testmail an {testSent} versendet - mit dem Anhang, der auch an den Empfänger ginge.</p>}
          </div>

          {error && <p className={styles.errorMessage}>{error}</p>}

          <div className={styles.actions} style={{ marginBottom: 0 }}>
            <Button type="button" onClick={() => setStep("confirm")} disabled={isPending || total === 0 || !subject.trim() || !body.trim()}>
              Weiter zum Versand
            </Button>
            <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
              Abbrechen
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.form}>
          <p style={{ margin: 0 }}>
            Die E-Mail «{subject}» wird jetzt an <strong>{total}</strong> {noun} versendet
            {includeAlreadyNotified && (props.alreadyNotifiedCount ?? 0) > 0 ? ", bereits informierte eingeschlossen" : ""}. Das lässt sich nicht
            rückgängig machen.
          </p>
          {progress ? (
            <div className={styles.progressPanel}>
              <div className={styles.progressHead}>
                <span>
                  {progress.done} von {progress.total} versendet
                </span>
                <span className={styles.progressPercent}>{progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%</span>
              </div>
              <div className={styles.progressTrack}>
                <div className={styles.progressBar} style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
              </div>
            </div>
          ) : (
            <Input
              label={`Zum Bestätigen "${SEND_CONFIRMATION_PHRASE}" eingeben`}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoFocus
            />
          )}
          {error && <p className={styles.errorMessage}>{error}</p>}
          <div className={styles.actions} style={{ marginBottom: 0 }}>
            <Button type="button" onClick={handleSend} disabled={!canSend || progress !== null}>
              Jetzt an {total} {noun} senden
            </Button>
            <Button type="button" variant="secondary" onClick={() => setStep("compose")} disabled={isPending || progress !== null}>
              Zurück
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
