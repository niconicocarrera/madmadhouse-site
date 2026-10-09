/**
 * MADMADHOUSE data model.
 *
 * One rule governs this file: components never see a file path or a URL.
 * Images are addressed by `assetId` only, and the resolver turns that into
 * derived-image sources. Swapping an Instagram-sourced flyer for a print
 * original means dropping a new file at the same assetId. Nothing else moves.
 */

export type Confidence = "high" | "medium" | "low";

export type EventStatus = "upcoming" | "past";

export interface Coords {
  lat: number;
  lon: number;
}

export interface Venue {
  name: string;
  city?: string;
  address?: string;
  /** Geocoded from `address` via OpenStreetMap. Absent when the address did not
   *  resolve, in which case the UI shows N/A rather than a plausible wrong point. */
  coords?: Coords;
}

export interface Dj {
  name: string;
  /** Handle without the leading @. Only ever set from a caption or alt-text
   *  mention, never guessed from a vision-read name. */
  instagram?: string;
  confidence: Confidence;
}

/** A presenter or promoter. Same linking rule as a DJ: `instagram` is set only
 *  from a confirmed handle or a caption mention, never from the billed name. */
export interface Presenter {
  name: string;
  instagram?: string;
  /** The promoter also played its own night (Le Bump, 2024-05-10), so it is in
   *  the lineup too. Without this a presenter is never credited as a DJ. */
  alsoPerforms?: boolean;
}

export interface EventLinks {
  tickets?: string;
  email?: string;
  sms?: string;
}

/** A moving source for an asset whose flyer is animated. */
export interface Motion {
  /** Path under /posters/, e.g. "mmh-...-a1.mp4". */
  src: string;
  /** "video/mp4", "video/webm", or "image/gif". */
  type: string;
}

export interface EventAsset {
  /** `<eventId>--aNN`. The file on disk is `<assetId>.<ext>`. */
  assetId: string;
  /** width / height. Stored so a tile can declare aspect-ratio before the
   *  image loads, which is what keeps cumulative layout shift at zero. */
  aspectRatio: number;
  role: "flyer" | "extra";
  /** What the asset IS, read off the image rather than inferred from its
   *  position in a carousel. `role` is derived from this. */
  kind?: "poster" | "image" | "video";
  /** Present when the artifact moves. Absent means the still is all there is,
   *  which is also the state of an animated flyer whose motion file has not
   *  been captured yet: it renders as its still and nothing breaks. */
  motion?: Motion;
  /** Photographer's Instagram handle, from the post's own credit line. */
  credit?: string;
  /** ThumbHash string, written by build_derivatives.py. Absent until the
   *  derivatives run, so every consumer must tolerate undefined. */
  thumbHash?: string;
}

export interface EventReview {
  /** Per-field confidence, keyed by a dotted field path ("venue.name"). */
  fields: Record<string, Confidence>;
  needsHumanReview: boolean;
}

export interface EventSource {
  igShortcode?: string;
  caption?: string;
  altText?: string;
}

/**
 * `status` is deliberately absent from this interface. It is derived from
 * `date` at read time by getEvents(), never stored and never hand-set, so an
 * upcoming show becomes a past show with no edit to any file.
 */
export interface EventRecord {
  /** `mmh-YYYY-MM-DD--venue-slug--NN`. NN disambiguates two events at the same
   *  venue on the same date. */
  eventId: string;
  title?: string;
  venue: Venue;
  /** ISO 8601. Date-only ("2026-09-06") when the flyer printed no start time. */
  date: string;
  /** Last night of a multi-night run on one flyer (a weekend). Absent for a
   *  single night. The event is upcoming until this date has passed. */
  endDate?: string;
  /** Verbatim as printed on the flyer ("10PM-2AM"). Never normalized: the
   *  printed form is part of the artifact. */
  timeText?: string;
  djs: Dj[];
  /** Promoters and event brands (Vadoz, etc). Deliberately separate from `djs`:
   *  a promoter is not a performer and should not appear in a lineup. */
  /** Unbilled or surprise guests (Zack Fox at the Lé Bump 2 Year Party). Shown
   *  apart from the lineup; same linking rule as a DJ. */
  specialGuests?: Presenter[];
  presentedBy?: Presenter[];
  info?: string;
  links?: EventLinks;
  assets: EventAsset[];
  source: EventSource;
  review: EventReview;
}

/** What components consume. Same as the record, plus the derived status. */
export interface EventEntry extends EventRecord {
  status: EventStatus;
}

/**
 * Provenance, kept parallel to the event data rather than inside it, so the
 * archive's editorial content and its acquisition history stay separable.
 */
export interface SourceMeta {
  assetId: string;
  igShortcode?: string;
  igImageWidth?: number;
  igImageHeight?: number;
  capturedAt?: string;
  /** False for anything pulled from Instagram. Flips to true when a print
   *  original is dropped in at the same assetId. */
  isOriginal: boolean;
}
