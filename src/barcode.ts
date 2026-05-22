import { BrowserMultiFormatOneDReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

let reader: BrowserMultiFormatOneDReader | null = null;
let mediaStream: MediaStream | null = null;
let scanActive = false;
let decodeCanvas: HTMLCanvasElement | null = null;

function normalizeCode(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 12) return `0${digits}`;
  return digits;
}

function createReader(): BrowserMultiFormatOneDReader {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatOneDReader(hints);
}

/** Même flux vidéo que le mode « Photo produit » (fonctionne sur iPhone). */
async function attachCamera(video: HTMLVideoElement): Promise<void> {
  mediaStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" },
    audio: false,
  });
  video.srcObject = mediaStream;
  video.playsInline = true;
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.muted = true;
  await video.play();
}

function frameToCanvas(video: HTMLVideoElement): HTMLCanvasElement | null {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;

  if (!decodeCanvas) decodeCanvas = document.createElement("canvas");
  const bandH = Math.max(80, Math.floor(h * 0.45));
  const bandY = Math.floor((h - bandH) / 2);
  decodeCanvas.width = w;
  decodeCanvas.height = bandH;
  const ctx = decodeCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, bandY, w, bandH, 0, 0, w, bandH);
  return decodeCanvas;
}

export function waitForElementLayout(el: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    let n = 0;
    const check = () => {
      const r = el.getBoundingClientRect();
      if (r.width >= 80 && r.height >= 80) {
        resolve();
        return;
      }
      if (++n > 60) {
        resolve();
        return;
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}

export async function startBarcodeScan(
  video: HTMLVideoElement,
  onDetected: (code: string) => void,
  onError?: (msg: string) => void
): Promise<void> {
  await stopBarcodeScan();

  reader = createReader();
  let lastCode = "";
  let decoding = false;

  try {
    await attachCamera(video);
  } catch (e) {
    reader = null;
    const msg =
      e instanceof Error ? e.message : "Caméra indisponible";
    onError?.(msg);
    throw e;
  }

  scanActive = true;
  const loop = () => {
    if (!scanActive) return;
    if (!decoding && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      const canvas = frameToCanvas(video);
      if (canvas && reader) {
        decoding = true;
        try {
          const result = reader.decodeFromCanvas(canvas);
          const code = normalizeCode(result.getText());
          if (code.length >= 8 && code !== lastCode) {
            lastCode = code;
            onDetected(code);
          }
        } catch {
          /* pas de code sur cette image */
        } finally {
          decoding = false;
        }
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

export async function stopBarcodeScan(): Promise<void> {
  scanActive = false;
  reader = null;
  mediaStream?.getTracks().forEach((t) => t.stop());
  mediaStream = null;
}

export function detachBarcodeVideo(video: HTMLVideoElement): void {
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  video.srcObject = null;
}
