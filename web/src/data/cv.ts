/**
 * CV (booking one-sheet) content: the editorial choices only. Every number,
 * venue count, room and lineup on the page is COMPUTED from the event data
 * (src/routes/Cv.tsx), so a new night updates the CV with no edit here.
 *
 * Shape follows booking practice (research 2026-10-01, see LOG.md): identity and
 * one real number first, brand work called out on its own, formats stated
 * plainly, one booking email, rider and rates on request. Selected nights were
 * cut (Nico, 2026-10-01): the intro carries the pitch, page two the depth.
 *
 * Nothing here is invented. Every line traces to a night in the archive.
 */

export interface CvContent {
  /** One line under the name: what it is, where. */
  identity: string;
  /** What gets played, from the nights' own titles and flyers. */
  sound: string[];
  /** How it gets played, each backed by nights in the archive. */
  formats: string[];
  /** Display names for presenters, keyed by the billed name in the data. */
  partnerNames: Record<string, string>;
  /** Partners credited together on one night read as one line ("ON Running x Vadoz"). */
  partnerOrder: string[];
  /** The first thing a booker reads after the name: the strongest facts, each
   *  backed by a night in the archive (`eventId`) and the post that says so. */
  headline: { text: string; eventId: string; source: string }[];
  /** Guests named in the roster line, by Instagram handle, strongest reach
   *  first. The full count is still computed; only these are spelled out. */
  notableGuests: string[];
  /** A mix link, shown under the name once it exists. null renders nothing. */
  mix: { label: string; url: string } | null;
  /** What a room was to the collective, keyed by venue name. Listed first. */
  rooms: Record<string, { label: string; note?: string }>;
}

export const cv: CvContent = {
  identity: "House DJ collective. Aurora and Chicago, IL.",
  sound: [
    "House, deep house, Latin house",
    "Disco, funk, soul, R&B",
    "Cumbia, juke, drum and bass, jungle",
  ],
  formats: [
    "Open to close, 10PM to 2AM and later",
    "B2B sets (luisvercetti b2b blinco)",
    "Daytime and market sets, 12PM to 6PM",
    "Brand activations and partner events",
    "Galleries, pop-ups, coffee bars",
  ],
  partnerNames: {
    "on running": "ON",
    vadoz: "Vadoz",
    vadozevents: "Vadoz",
    gardencollective: "Garden Collective",
    undisputedvintage: "Undisputed Vintage",
    "lé bump": "Lé Bump",
  },
  headline: [
    {
      text: "Lé Bump's sold-out 2 Year Party at Subterranean, Chicago, with Zack Fox",
      eventId: "mmh-2024-05-10--subterranean--01",
      source: "@le__bump recap C62OYEZrf1X: 'helped sell out @subtchicago'; Zack Fox tagged on two photos.",
    },
    {
      text: "Vadoz x ON Rooftop Afters, Chicago",
      eventId: "mmh-2026-09-27--carmines--01",
      source: "Vadoz flyer Ddmu8Syzhcx: Rooftop Afters above the ON flagship store, 1043 N Rush St.",
    },
  ],
  mix: null,
  // Top reach among guests, followers checked 2026-10-01: zackfox 809K,
  // blesstonio 14K, valeriafride 11K, blackclub_ 6.3K, realjordanmartin 5.0K,
  // a.tt1c 4.6K, kirk.61 3.9K, kittvesper 2.3K. Next were saintvalentin___
  // 2.1K and ch4wni 2.0K; everyone else under 1.8K. Recheck before big sends.
  // le__bump (7.2K) added by Nico: a presenting crew, not a guest DJ, so the
  // line counts it as one of the "DJs and crews".
  notableGuests: ["zackfox", "blesstonio", "valeriafride", "le__bump", "blackclub_", "realjordanmartin", "a.tt1c", "kirk.61", "kittvesper"],
  rooms: {
    // Nico, 2026-10-01: both ran as residencies and ended when the venue
    // changed ownership, which is why the dates stop.
    "East Wind Social Club": { label: "Residency, house DJs", note: "Ended with a change of ownership." },
    "The Red Room": { label: "Residency", note: "Ended with a change of ownership." },
  },
  partnerOrder: ["vadoz", "on running", "vadozevents", "lé bump", "gardencollective", "undisputedvintage"],
};
