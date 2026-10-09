/**
 * INFO page content, transcribed from CONTENT.md (filled from the 2026-09-30 call
 * with Luis). CONTENT.md is the source of truth: change it there, then here.
 *
 * A null field does not render. The emails forward through Cloudflare Email
 * Routing (set up 2026-09-30); the mailing list and ticketing wait on a
 * provider decision.
 */

export interface Member {
  name: string;
  instagram: string;
  /** What this member does in the crew. */
  roles: string;
}

export interface InfoContent {
  /** false until Nico approves the bio; dev builds show a notice while false. */
  bioApproved: boolean;
  bio: string[];
  cities: string[];
  members: Member[];
  contact: {
    general: string | null;
    booking: string | null;
    press: string | null;
    instagram: string;
  };
  /** Shown as a line under contact. null = not taking them, says nothing. */
  submissions: string | null;
  mailingList: { provider: string; endpoint: string } | null;
}

export const info: InfoContent = {
  bioApproved: true,
  bio: [
    "MADMADHOUSE is a group of DJs out of Aurora and Chicago, honoring and experimenting within the legacy of DJing, MCing and production.",
    "Since its first night in October 2022 the crew has kept growing: a core of two, and a rotating network of performers around them.",
  ],
  cities: ["Aurora", "Chicago"],
  members: [
    { name: "Luis Arriaga", instagram: "luisvercetti", roles: "DJ, recruit, design, promo, photos" },
    { name: "Nicholas Carrera", instagram: "thy_niconico", roles: "DJ, recruit, A/V, web dev, photos" },
  ],
  contact: {
    general: "general@madmadhouse.com",
    booking: "booking@madmadhouse.com",
    press: "press@madmadhouse.com",
    instagram: "madmaadhouse",
  },
  submissions: null,
  mailingList: null,
};
