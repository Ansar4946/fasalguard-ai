/* eslint-disable @next/next/no-img-element -- blob URLs are temporary local previews. */
"use client";

import { useEffect, useRef, useState } from "react";
import type { ScanImage, ScanImageCategory } from "@/features/diagnosis/types";

type SlotKind = "leaf-closeup" | "whole-plant" | "field-view";
interface Slot {
  kind: SlotKind;
  title: string;
  help: string;
  required: boolean;
  category: ScanImageCategory;
}

const slots: Slot[] = [
  { kind: "leaf-closeup", title: "Leaf Close-up", help: "Fill the frame with the affected leaf.", required: true, category: "LEAF_FRONT" },
  { kind: "whole-plant", title: "Whole Plant", help: "Show the full plant and symptom spread.", required: false, category: "WHOLE_PLANT" },
  { kind: "field-view", title: "Wider Field View", help: "Show nearby plants and the affected zone.", required: false, category: "FIELD_CONTEXT" },
];
const maxBytes = 10 * 1024 * 1024;
const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Real presign → PUT → complete against the actual media API — no mock, no local-only preview. */
async function uploadReal(file: File): Promise<string> {
  const checksum = await sha256Hex(file);
  const presignRes = await fetch("/api/uploads/presign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fileName: file.name, contentType: file.type, sizeBytes: file.size, checksum, purpose: "crop-scan" }),
  });
  if (!presignRes.ok) throw new Error("Could not start the upload.");
  const { media, upload } = (await presignRes.json()) as { media: { id: string }; upload: { url: string; headers: Record<string, string> } };
  const putRes = await fetch(upload.url, { method: "PUT", headers: upload.headers, body: file });
  if (!putRes.ok) throw new Error("The photo could not be uploaded.");
  const completeRes = await fetch("/api/uploads/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mediaId: media.id, checksum }),
  });
  if (!completeRes.ok) throw new Error("The photo upload could not be verified.");
  return media.id;
}

export function ImageUpload({
  images,
  onChange,
  onUploaded,
}: {
  images: ScanImage[];
  onChange: (images: ScanImage[]) => void;
  onUploaded: (image: ScanImage) => Promise<void>;
}) {
  const [errors, setErrors] = useState<Partial<Record<SlotKind, string>>>({});
  const [cameraSlot, setCameraSlot] = useState<SlotKind | null>(null);
  const imagesRef = useRef(images);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  function commit(next: ScanImage[]): void {
    imagesRef.current = next;
    onChange(next);
  }

  async function add(kind: SlotKind, file?: File): Promise<void> {
    if (!file) return;
    let error = "";
    if (!allowed.has(file.type)) error = "Choose a JPEG, PNG, or WebP image.";
    else if (file.size > maxBytes) error = "Image must be 10 MB or smaller.";
    if (error) {
      setErrors((current) => ({ ...current, [kind]: error }));
      return;
    }
    const previous = imagesRef.current.find((image) => image.id === kind);
    if (previous?.previewUrl.startsWith("blob:")) URL.revokeObjectURL(previous.previewUrl);
    const category = slots.find((s) => s.kind === kind)!.category;
    const placeholder: ScanImage = {
      id: kind,
      name: file.name,
      previewUrl: URL.createObjectURL(file),
      category,
      mediaId: null,
      uploadStatus: "uploading",
    };
    commit([...imagesRef.current.filter((image) => image.id !== kind), placeholder]);
    setErrors((current) => ({ ...current, [kind]: undefined }));

    try {
      const mediaId = await uploadReal(file);
      const uploaded: ScanImage = { ...placeholder, mediaId, uploadStatus: "done" };
      await onUploaded(uploaded);
      commit(imagesRef.current.map((image) => (image.id === kind ? uploaded : image)));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Upload failed — try again.";
      commit(
        imagesRef.current.map((image) =>
          image.id === kind ? { ...image, uploadStatus: "failed" as const } : image,
        ),
      );
      setErrors((current) => ({ ...current, [kind]: message }));
    }
  }

  function remove(kind: SlotKind): void {
    const image = imagesRef.current.find((item) => item.id === kind);
    if (image?.previewUrl.startsWith("blob:")) URL.revokeObjectURL(image.previewUrl);
    commit(imagesRef.current.filter((item) => item.id !== kind));
    setErrors((current) => ({ ...current, [kind]: undefined }));
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_215px]">
      <div className="grid gap-3 md:grid-cols-3">
        {slots.map((slot) => (
          <ImageSlot
            key={slot.kind}
            slot={slot}
            image={images.find((image) => image.id === slot.kind)}
            error={errors[slot.kind]}
            onFile={(file) => void add(slot.kind, file)}
            onRemove={() => remove(slot.kind)}
            onOpenCamera={() => setCameraSlot(slot.kind)}
          />
        ))}
      </div>
      <PhotoGuide />
      {cameraSlot && (
        <CameraCaptureModal
          onCapture={(file) => {
            void add(cameraSlot, file);
            setCameraSlot(null);
          }}
          onClose={() => setCameraSlot(null)}
        />
      )}
    </div>
  );
}

function ImageSlot({
  slot,
  image,
  error,
  onFile,
  onRemove,
  onOpenCamera,
}: {
  slot: Slot;
  image?: ScanImage;
  error?: string;
  onFile: (file?: File) => void;
  onRemove: () => void;
  onOpenCamera: () => void;
}) {
  const deviceRef = useRef<HTMLInputElement>(null);
  return (
    <article className={`flex min-h-[330px] flex-col overflow-hidden rounded-2xl border bg-white shadow-sm ${error ? "border-danger" : "border-brand/10"}`}>
      <header className="flex min-h-12 items-center justify-between border-b border-brand/5 px-3">
        <h2 className="text-[11px] font-extrabold">{slot.title}</h2>
        <span className={`size-4 rounded-full border-2 ${slot.required ? "border-brand bg-brand" : "border-border"}`}>
          <span className="sr-only">{slot.required ? "Required" : "Recommended"}</span>
        </span>
      </header>
      {image ? (
        <>
          <div className="relative flex-1 bg-surface-soft">
            <img src={image.previewUrl} alt={`${slot.title} preview`} className="absolute inset-0 size-full object-cover" />
            {image.uploadStatus === "uploading" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <span className="size-6 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-label="Uploading" />
              </div>
            )}
            {image.uploadStatus === "done" && (
              <span className="absolute left-2 top-2 rounded bg-brand px-2 py-1 text-[8px] font-bold text-white">✓ Uploaded</span>
            )}
            {image.uploadStatus === "failed" && (
              <span className="absolute left-2 top-2 rounded bg-danger px-2 py-1 text-[8px] font-bold text-white">Upload failed</span>
            )}
          </div>
          <div className="flex gap-2 p-3">
            <button
              type="button"
              onClick={() => deviceRef.current?.click()}
              className="min-h-9 flex-1 rounded-lg border border-brand text-[10px] font-bold text-brand"
            >
              {image.uploadStatus === "failed" ? "Retry" : "Replace"}
            </button>
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${slot.title}`}
              className="grid size-9 place-items-center rounded-lg border border-danger text-danger"
            >
              <TrashIcon />
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center p-4 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-brand-soft text-brand">
            <UploadIcon />
          </span>
          <p className="mt-4 text-xs font-extrabold">Drag and drop or Click to upload</p>
          <p className="mt-2 text-[9px] leading-4 text-muted">
            {slot.help}
            <br />
            JPEG, PNG or WebP · max 10 MB
          </p>
          <div className="mt-5 grid w-full gap-2">
            <button
              type="button"
              onClick={() => deviceRef.current?.click()}
              className="flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-brand text-[10px] font-extrabold text-white"
            >
              <DeviceIcon /> Device
            </button>
            <button
              type="button"
              onClick={onOpenCamera}
              className="flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-brand text-[10px] font-extrabold text-brand"
            >
              <CameraIcon /> Camera
            </button>
          </div>
        </div>
      )}
      <input
        ref={deviceRef}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error && <p role="alert" className="bg-red-50 p-2 text-[10px] font-bold text-danger">{error}</p>}
    </article>
  );
}

/**
 * A real live webcam capture flow. `<input capture>` only opens the native camera app on
 * mobile — on desktop browsers it silently falls back to a plain file picker, so a farmer
 * on a desktop never actually gets to use their webcam. This talks to getUserMedia directly
 * so "Camera" does the same thing on desktop and mobile alike, with an honest error (not a
 * silent fallback) if the browser or OS denies camera access.
 */
const cameraUnsupportedMessage = "Your browser doesn't support camera capture — use Device to upload a photo instead.";
const cameraDeniedMessage = "Couldn't access your camera — check your browser's permission for this site, or use Device to upload a photo instead.";

function CameraCaptureModal({ onCapture, onClose }: { onCapture: (file: File) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [deniedError, setDeniedError] = useState("");
  const [ready, setReady] = useState(false);
  const supported = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
  const error = supported ? deniedError : cameraUnsupportedMessage;

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setDeniedError(cameraDeniedMessage);
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [supported]);

  function capture(): void {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture(new File([blob], `camera-capture-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Capture a photo with your camera">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-extrabold text-brand-dark">Capture photo</h2>
          <button type="button" onClick={onClose} aria-label="Close camera" className="text-xs font-bold text-muted hover:text-foreground">
            ✕
          </button>
        </div>
        <div className="relative aspect-[4/3] bg-black">
          {error ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-xs font-semibold text-white">{error}</div>
          ) : (
            <video ref={videoRef} autoPlay playsInline muted className="size-full object-cover" />
          )}
        </div>
        <div className="flex justify-end gap-2 p-3">
          <button type="button" onClick={onClose} className="min-h-10 rounded-lg border border-border px-4 text-[11px] font-bold text-foreground">
            Cancel
          </button>
          {!error && (
            <button
              type="button"
              onClick={capture}
              disabled={!ready}
              className="min-h-10 rounded-lg bg-brand px-4 text-[11px] font-bold text-white disabled:opacity-50"
            >
              Capture
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PhotoGuide() {
  return (
    <aside className="rounded-2xl border border-brand/20 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-extrabold text-brand">Photo Guide</h2>
      <div className="mt-4 space-y-4">
        <Guide title="Use natural light" text="Bright, even light keeps colour accurate." tone="good" />
        <Guide title="Fill the frame" text="Keep symptoms large and clearly visible." tone="good" />
        <p className="border-t border-border pt-3 text-[9px] font-extrabold uppercase tracking-wider text-danger">Don&apos;t</p>
        <Guide title="Avoid blur" text="Hold steady and focus before capture." tone="bad" />
        <Guide title="No filters" text="Upload the original, unedited image." tone="bad" />
      </div>
      <div className="mt-5 rounded-xl bg-green-50 p-3 text-[9px] leading-4 text-green-950">
        High-quality images improve screening reliability and reduce the need to retake photos.
      </div>
    </aside>
  );
}

function Guide({ title, text, tone }: { title: string; text: string; tone: "good" | "bad" }) {
  return (
    <div className="flex gap-2">
      <span className={`h-12 w-10 shrink-0 rounded-lg bg-gradient-to-br ${tone === "good" ? "from-lime-200 to-green-700" : "from-amber-100 to-stone-500"}`} />
      <div>
        <h3 className="text-[10px] font-extrabold">{title}</h3>
        <p className="mt-1 text-[8px] leading-3 text-muted">{text}</p>
      </div>
    </div>
  );
}

function iconProps() {
  return { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
}
function UploadIcon() {
  return (
    <svg {...iconProps()} className="size-5">
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}
function DeviceIcon() {
  return (
    <svg {...iconProps()} className="size-3.5">
      <rect x="3" y="4" width="18" height="13" rx="1.5" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}
function CameraIcon() {
  return (
    <svg {...iconProps()} className="size-3.5">
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg {...iconProps()} className="size-4">
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </svg>
  );
}
