import * as tf from "@tensorflow/tfjs";
import * as mobilenet from "@tensorflow-models/mobilenet";

let model: mobilenet.MobileNet | null = null;
let loading: Promise<mobilenet.MobileNet> | null = null;

export async function loadModel(): Promise<mobilenet.MobileNet> {
  if (model) return model;
  if (!loading) {
    loading = mobilenet.load({ version: 2, alpha: 0.5 });
  }
  model = await loading;
  return model;
}

async function embeddingFromImage(img: HTMLImageElement): Promise<number[]> {
  const net = await loadModel();
  const tensor = tf.browser.fromPixels(img);
  const activation = net.infer(tensor, true) as tf.Tensor;
  const data = await activation.data();
  tensor.dispose();
  activation.dispose();
  return Array.from(data);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Impossible de charger l'image"));
    img.src = src;
  });
}

export async function computeEmbedding(dataUrl: string): Promise<number[]> {
  const img = await loadImage(dataUrl);
  return embeddingFromImage(img);
}

export async function computeEmbeddingFromFile(file: File): Promise<number[]> {
  const url = URL.createObjectURL(file);
  try {
    return await computeEmbedding(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function computeEmbeddingFromVideo(
  video: HTMLVideoElement
): Promise<number[]> {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible");
  ctx.drawImage(video, 0, 0);
  const img = await loadImage(canvas.toDataURL("image/jpeg", 0.85));
  return embeddingFromImage(img);
}
