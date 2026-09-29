import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

/**
 * Platform branding for the app shell.
 *
 * Mirrors `usePrimaryEvent` in `src/lib/featuredEvent.ts`: one query, one
 * place that decides what the product is called, so the wordmark, the document
 * title, the footer and the landing hero can never disagree with each other or
 * with what an admin set on `/admin/settings`.
 *
 * Defaults match the strings the shell used to hardcode, so a deployment with
 * no branding rows is unchanged. While the query is in flight `isLoading` is
 * true and the same defaults are returned, which is what stops the wordmark
 * flashing "RaptorJudge" and then swapping to the real name.
 */
export interface Branding {
  siteName: string;
  siteTagline: string;
  logoUrl: string;
  footerCopyright: string;
  isLoading: boolean;
}

export const BRANDING_FALLBACK: Omit<Branding, "isLoading"> = {
  siteName: "RaptorJudge",
  siteTagline: "Hackathon judging engineered for fairness",
  logoUrl: "",
  footerCopyright: "© 2026 RaptorJudge",
};

export function useBranding(): Branding {
  const data = useQuery(api.branding.getBranding, {});
  return useMemo<Branding>(() => {
    if (!data) return { ...BRANDING_FALLBACK, isLoading: data === undefined };
    return {
      siteName: data.siteName || BRANDING_FALLBACK.siteName,
      siteTagline: data.siteTagline || BRANDING_FALLBACK.siteTagline,
      // A blank logo is a valid stored value and means "use the letter tile".
      logoUrl: data.logoUrl ?? "",
      footerCopyright: data.footerCopyright || BRANDING_FALLBACK.footerCopyright,
      isLoading: false,
    };
  }, [data]);
}
