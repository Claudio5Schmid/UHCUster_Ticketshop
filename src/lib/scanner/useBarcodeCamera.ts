"use client";

import { useEffect, useRef, useState } from "react";

interface UseBarcodeCameraOptions {
  onDecode: (text: string) => void;
  /** While true, decoded frames are ignored - used during the 800ms feedback lock. */
  paused: boolean;
}

/**
 * BarcodeDetector first (native, fast, available in Chrome/Android - the
 * primary devices for match-day helpers), falling back to zxing-js for iOS
 * Safari, which doesn't implement BarcodeDetector (brief, Phase 7.1).
 */
export function useBarcodeCamera(videoRef: React.RefObject<HTMLVideoElement | null>, { onDecode, paused }: UseBarcodeCameraOptions) {
  const [error, setError] = useState<string | null>(null);
  const pausedRef = useRef(paused);
  const onDecodeRef = useRef(onDecode);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    onDecodeRef.current = onDecode;
  }, [onDecode]);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let rafId: number | null = null;
    let zxingControls: { stop: () => void } | null = null;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        if ("BarcodeDetector" in window) {
          const DetectorCtor = (window as unknown as { BarcodeDetector: new (options: { formats: string[] }) => {
            detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
          } }).BarcodeDetector;
          const detector = new DetectorCtor({ formats: ["qr_code"] });

          const tick = async () => {
            if (cancelled) return;
            if (!pausedRef.current && videoRef.current) {
              try {
                const results = await detector.detect(videoRef.current);
                if (results.length > 0) {
                  onDecodeRef.current(results[0].rawValue);
                }
              } catch {
                // transient decode errors are expected on out-of-focus frames - ignore
              }
            }
            rafId = requestAnimationFrame(tick);
          };
          rafId = requestAnimationFrame(tick);
        } else {
          const { BrowserQRCodeReader } = await import("@zxing/browser");
          const reader = new BrowserQRCodeReader();
          const controls = await reader.decodeFromVideoElement(videoRef.current, (result) => {
            if (!cancelled && !pausedRef.current && result) {
              onDecodeRef.current(result.getText());
            }
          });
          zxingControls = controls;
        }
      } catch {
        if (!cancelled) setError("Kamerazugriff nicht möglich. Bitte manuelle Eingabe verwenden.");
      }
    }

    start();

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      zxingControls?.stop();
      stream?.getTracks().forEach((track) => track.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { error };
}
