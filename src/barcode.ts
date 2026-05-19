import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

let scanner: Html5Qrcode | null = null;

const BARCODE_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
];

export async function startBarcodeScan(
  containerId: string,
  onDetected: (code: string) => void,
  onError?: (msg: string) => void
): Promise<void> {
  await stopBarcodeScan();
  scanner = new Html5Qrcode(containerId, { verbose: false });

  const config = {
    fps: 10,
    formatsToSupport: BARCODE_FORMATS,
    qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
      const w = Math.min(viewfinderWidth * 0.92, 320);
      const h = Math.min(viewfinderHeight * 0.35, 140);
      return { width: Math.floor(w), height: Math.floor(h) };
    },
  };

  try {
    await scanner.start(
      { facingMode: { exact: "environment" } },
      config,
      (decoded) => onDetected(decoded),
      () => {}
    );
  } catch {
    try {
      await scanner.start(
        { facingMode: "environment" },
        config,
        (decoded) => onDetected(decoded),
        () => {}
      );
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Caméra indisponible");
      throw e;
    }
  }
}

export async function stopBarcodeScan(): Promise<void> {
  if (!scanner) return;
  try {
    if (scanner.isScanning) await scanner.stop();
    scanner.clear();
  } catch {
    /* ignore */
  }
  scanner = null;
}
