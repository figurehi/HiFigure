import type { Editor } from "tldraw";

export async function imageUrlToDataUrl(url: string): Promise<string | null> {
  if (url.startsWith("data:image/")) {
    return url;
  }
  try {
    const response = await fetch(url, { mode: "cors", cache: "no-store" });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function blobToDataUrl(blob: Blob): Promise<string | null> {
  return await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

export async function exportTldrawEditorToPngDataUrl(editor: Editor): Promise<string | null> {
  const shapeIds = [...editor.getCurrentPageShapeIds()];
  if (shapeIds.length === 0) return null;

  try {
    const dataUrl = await editor.toImageDataUrl(shapeIds, {
      format: "png",
      background: true,
      padding: 0,
      scale: 1,
    });
    return typeof dataUrl === "string" ? dataUrl : dataUrl?.url ?? null;
  } catch {
    const { blob } = await editor.toImage(shapeIds, {
      format: "png",
      background: true,
      padding: 0,
      scale: 1,
    });
    return blobToDataUrl(blob);
  }
}

export function editorHasUserAnnotations(editor: Editor): boolean {
  return editor.getCurrentPageShapes().some((shape) => {
    if (shape.meta?.hichartFigureBackground) return false;
    return true;
  });
}
