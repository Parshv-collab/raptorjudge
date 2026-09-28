import { query } from "./_generated/server";

/**
 * Public, unauthenticated platform branding.
 *
 * `/admin/settings` has always written `site_name`, `site_tagline`, `logo_url`
 * and `footer_copyright` to the `platform` table — and until now nothing read
 * them, so the shell hardcoded "RaptorJudge" and the admin UI was making a
 * promise the product did not keep. This query is the reader that makes the
 * branding half of that page true, and only the branding half: the
 * maintenance / MFA / gallery / voting flags stay stored-only until their code
 * paths exist, which `/admin/settings` says in as many words.
 *
 * **Allowlist, not blocklist.** `admin.getSettings` uses
 * `projectPublicSettings`, which is a *blocklist* — fine for a signed-in admin,
 * wrong here. This query is readable with no session at all, so it may only
 * return the four keys below and nothing else that ever lands in `platform`
 * (which also holds the certificate signing key, session hashes and rate-limit
 * counters). The key list is a literal, not a filter over the table.
 */

/** The only `platform` keys an anonymous client may ever read. */
const PUBLIC_BRANDING_KEYS = [
  "site_name",
  "site_tagline",
  "logo_url",
  "footer_copyright",
] as const;

type BrandingKey = (typeof PUBLIC_BRANDING_KEYS)[number];

/**
 * Defaults are exactly what the shell hardcoded before, so a deployment with
 * no branding rows renders byte-identically to one that never set them.
 */
export const BRANDING_DEFAULTS: Record<BrandingKey, string> = {
  site_name: "RaptorJudge",
  site_tagline: "Hackathon judging engineered for fairness",
  logo_url: "",
  footer_copyright: "© 2026 RaptorJudge",
};

export interface PublicBranding {
  siteName: string;
  siteTagline: string;
  logoUrl: string;
  footerCopyright: string;
}

export const getBranding = query({
  args: {},
  handler: async (ctx): Promise<PublicBranding> => {
    const out = { ...BRANDING_DEFAULTS };
    for (const key of PUBLIC_BRANDING_KEYS) {
      const row = await ctx.db
        .query("platform")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      // An empty string is a legitimate stored value ("no logo"), so the
      // fallback is only applied when the row is missing or blank-blanked.
      const value = row?.value?.trim();
      if (value) out[key] = value;
    }
    return {
      siteName: out.site_name,
      siteTagline: out.site_tagline,
      logoUrl: out.logo_url,
      footerCopyright: out.footer_copyright,
    };
  },
});
