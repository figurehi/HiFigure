import type { FigureVariant, ReferenceItem, SearchResponse } from "./types";

const DEFAULT_API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

export function resolveApiAssetUrl<T extends string | null | undefined>(
  url: T,
  apiBase = DEFAULT_API_BASE,
): T {
  if (!url || !url.startsWith("/") || url.startsWith("//") || url.startsWith("/tutorial/")) {
    return url;
  }

  try {
    return new URL(url, apiBase).toString() as T;
  } catch {
    return url;
  }
}

export function resolveReferenceAssetUrls(
  reference: ReferenceItem,
  apiBase = DEFAULT_API_BASE,
): ReferenceItem {
  return {
    ...reference,
    thumbnailUrl: resolveApiAssetUrl(reference.thumbnailUrl, apiBase),
  };
}

export function resolveSearchResponseAssetUrls(
  response: SearchResponse,
  apiBase = DEFAULT_API_BASE,
): SearchResponse {
  return {
    ...response,
    references: response.references.map((reference) =>
      resolveReferenceAssetUrls(reference, apiBase),
    ),
  };
}

export function resolveFigureVariantAssetUrls(
  variant: FigureVariant,
  apiBase = DEFAULT_API_BASE,
): FigureVariant {
  return {
    ...variant,
    previewImageUrl: resolveApiAssetUrl(variant.previewImageUrl, apiBase),
    draftPreviewImageUrl: resolveApiAssetUrl(variant.draftPreviewImageUrl, apiBase),
  };
}
