/**
 * Turns an assetId into everything needed to render it, and nothing else.
 *
 * Components never see a path. They pass an assetId and get back sources plus a
 * ThumbHash. That indirection is what makes "swap the Instagram pull for a print
 * original" a file drop rather than a refactor.
 *
 * derivatives.json is fetched at RUNTIME rather than imported. Deliberate: the
 * file does not exist until the harvest and the derivative build have run, and a
 * build that breaks when project data is absent is a build that cannot be worked
 * on before Checkpoint A. Absent data degrades to a flat placeholder.
 */

export interface DerivativeEntry {
  assetId: string;
  width: number;
  height: number;
  aspectRatio: number;
  widths: number[];
  formats: string[];
  thumbHash?: string;
}

const BASE = "/posters";
let cache: Record<string, DerivativeEntry> | null = null;
let inflight: Promise<Record<string, DerivativeEntry>> | null = null;

export function loadDerivatives(): Promise<Record<string, DerivativeEntry>> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = fetch(`${BASE}/derivatives.json`)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then((json: Record<string, DerivativeEntry>) => {
      cache = json ?? {};
      return cache;
    });
  return inflight;
}

export function srcSetFor(entry: DerivativeEntry | undefined, ext: string): string | undefined {
  if (!entry?.widths?.length) return undefined;
  return entry.widths.map((w) => `${BASE}/${entry.assetId}-${w}.${ext} ${w}w`).join(", ");
}

/** Largest available derivative, used as the <img> fallback src. */
export function fallbackSrc(entry: DerivativeEntry | undefined): string | undefined {
  if (!entry?.widths?.length) return undefined;
  const largest = entry.widths[entry.widths.length - 1];
  return `${BASE}/${entry.assetId}-${largest}.jpg`;
}

/**
 * `sizes` tells the browser how wide the image will RENDER, which is the only
 * way it can pick the right width. Getting this wrong is the usual reason a
 * responsive image set still downloads the 2000px file on a phone.
 */
export const SIZES = {
  grid: "(max-width: 1500px) 31vw, 23vw",
  side: "(max-width: 780px) 92vw, 22vw",
  focus: "(max-width: 780px) 92vw, 42vw",
  feature: "(max-width: 900px) 92vw, 60vw",
} as const;
