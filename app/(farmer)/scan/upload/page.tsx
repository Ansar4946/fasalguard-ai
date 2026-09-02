"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ImageUpload } from "@/components/scan/image-upload";
import { ScanStepper } from "@/components/scan/scan-stepper";
import { useScanSession } from "@/features/diagnosis/scan-session-provider";
import type { ScanImage } from "@/features/diagnosis/types";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function UploadScanImagesPage() {
  const router = useRouter();
  const { session, updateSession, hydrated } = useScanSession();
  const scanIdRef = useRef<string | null>(session.backendScanId);
  const scanCreationRef = useRef<Promise<string> | null>(null);
  const [preparingScan, setPreparingScan] = useState(false);
  const [scanError, setScanError] = useState<string>();
  useEffect(() => {
    scanIdRef.current = session.backendScanId;
  }, [session.backendScanId]);
  const hasCloseup = session.images.some((image) => image.id === "leaf-closeup" && image.uploadStatus === "done");
  const canContinue = hydrated && Boolean(session.fieldId) && hasCloseup && !preparingScan;
  const remaining = Math.max(0, 3 - session.images.length);

  async function ensureScan(): Promise<string> {
    if (scanIdRef.current) return scanIdRef.current;
    if (!session.fieldId || !uuidPattern.test(session.fieldId))
      throw new Error("Your saved field selection is outdated. Go back and select the field again.");
    if (scanCreationRef.current) return scanCreationRef.current;

    scanCreationRef.current = (async () => {
      const res = await fetch("/api/crop-scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(session.fieldId ? { fieldId: session.fieldId } : {}),
      });
      const body = (await res.json().catch(() => ({}))) as {
        id?: string;
        error?: { message?: string };
      };
      if (!res.ok || !body.id)
        throw new Error(body.error?.message ?? "Could not start the crop scan.");
      scanIdRef.current = body.id;
      updateSession({ backendScanId: body.id });
      return body.id;
    })();

    try {
      return await scanCreationRef.current;
    } finally {
      scanCreationRef.current = null;
    }
  }

  async function handleUploaded(image: ScanImage): Promise<void> {
    if (!image.mediaId) return;
    const scanId = await ensureScan();
    const res = await fetch(`/api/crop-scans/${scanId}/images`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mediaId: image.mediaId, category: image.category }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(body.error?.message ?? "Could not attach the photo to this crop scan.");
    }
  }

  async function continueToSymptoms(): Promise<void> {
    if (!canContinue) return;
    setPreparingScan(true);
    setScanError(undefined);
    try {
      // Recover drafts created by the previous UI, which could persist completed media
      // before the corresponding crop scan was created and linked.
      if (!scanIdRef.current) {
        const uploaded = session.images.filter(
          (image) => image.mediaId && image.uploadStatus === "done",
        );
        for (const image of uploaded) await handleUploaded(image);
      }
      updateSession({ step: "symptoms", progress: 60 });
      router.push("/scan/symptoms");
    } catch (cause) {
      setScanError(cause instanceof Error ? cause.message : "Could not prepare this crop scan.");
      setPreparingScan(false);
    }
  }

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-[#fff9df]">
      <main className="mx-auto max-w-[1180px] p-4 md:p-6 xl:p-7">
        <ScanStepper current="capture" />
        <header className="mt-5">
          <div className="flex items-center gap-2">
            <h1 className="text-[27px] font-extrabold leading-tight text-brand-dark">Scan Your Crop</h1>
          </div>
          <p className="mt-1 text-xs text-muted">
            <span className="mr-2 rounded bg-brand-soft px-2 py-1 text-[9px] font-bold text-brand">STEP 2 OF 5</span>
            Please provide high-quality photos for the AI to analyse accurately.
          </p>
        </header>
        {!session.fieldId && hydrated ? (
          <div role="alert" className="mt-5 rounded-2xl border border-warning bg-amber-50 p-5">
            <h2 className="font-extrabold">Select a field first</h2>
            <p className="mt-1 text-xs text-muted">Your scan needs a field before photos can be assessed.</p>
            <Link href="/scan" className="mt-4 inline-flex min-h-10 items-center rounded-xl bg-brand px-5 text-xs font-bold text-white">Select field</Link>
          </div>
        ) : (
          <div className="mt-5">
            <ImageUpload
              images={session.images}
              onChange={(images) => updateSession({ images, step: "capture", progress: images.some((image) => image.id === "leaf-closeup") ? 40 : 20 })}
              onUploaded={handleUploaded}
            />
          </div>
        )}
        <footer className="mt-5 flex flex-col gap-3 border-t border-brand/10 pt-4 sm:flex-row sm:items-center">
          <Link href="/scan" className="inline-flex min-h-10 items-center text-xs font-extrabold text-brand">← Back to Select Field</Link>
          <p className="text-center text-[10px] italic text-muted sm:ml-auto" aria-live="polite">
            {hasCloseup ? `${remaining} recommended image${remaining === 1 ? "" : "s"} remaining` : "A close-up leaf photo is required to continue"}
          </p>
          <button
            type="button"
            disabled={!canContinue}
            onClick={() => void continueToSymptoms()}
            className="min-h-10 rounded-full bg-brand px-7 text-xs font-extrabold text-white disabled:bg-[#d3d9cf] disabled:text-muted"
          >
            {preparingScan ? "Preparing scan…" : "Continue →"}
          </button>
        </footer>
        {scanError && <p role="alert" className="mt-3 text-right text-xs font-bold text-danger">{scanError}</p>}
      </main>
    </div>
  );
}
