import { Link } from "react-router-dom";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { formatDate } from "@/lib/format";
import { roleLabel } from "@/lib/roles";

/**
 * Account settings.
 *
 * This page used to render three controls — a display-language dropdown and two
 * "email me when…" checkboxes — that were pure `useState`. "Save settings"
 * fired a success toast and wrote nothing, and the product has no mail service
 * at all (it is designed to run offline on the organizer's own hardware), so
 * the checkboxes promised delivery that could not happen. Shipping that is
 * worse than shipping nothing: a judge who ticks a box and never hears back has
 * been told a lie by the UI.
 *
 * So the page now says what is actually true and links to the places where the
 * real, persisted settings live.
 */
export default function Settings() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const me = useQuery(api.users.me, authLoading || !isAuthenticated ? "skip" : {});
  const notifications = useQuery(
    api.notifications.listMine,
    authLoading || !isAuthenticated ? "skip" : {},
  );

  const unread = (notifications ?? []).filter((n: any) => !n.readAt).length;

  return (
    <div className="flex flex-col gap-8 max-w-3xl">
      <PageHeader
        title="Account settings"
        description="Your account, and where the settings that actually apply live."
      />

      {me === undefined ? (
        <SkeletonCard lines={4} />
      ) : (
        <section className="flex flex-col gap-4">
          <h2 className="text-h3 text-primary">Account</h2>
          <div className="bg-surface-1 border border-line rounded-card p-6 flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-primary truncate">
                  {me?.name || me?.email}
                </p>
                <p className="text-[13px] text-secondary truncate">{me?.email}</p>
              </div>
              <Badge variant={me?.role === "admin" ? "accent" : "default"} className="ml-auto">
                {roleLabel(me?.role)}
              </Badge>
            </div>
            <p className="text-[13px] text-secondary">
              Name, avatar and bio are edited on your profile. Two-factor authentication is set up
              under Security.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/profile">
                <Button variant="secondary" size="sm">
                  Edit profile
                </Button>
              </Link>
              <Link to="/security">
                <Button variant="secondary" size="sm">
                  Two-factor authentication
                </Button>
              </Link>
            </div>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-h3 text-primary">Notifications</h2>
        <div className="bg-surface-1 border border-line rounded-card p-6 flex flex-col gap-4">
          <Alert variant="info" title="This deployment sends no email">
            RaptorJudge runs entirely on the organizer&apos;s own hardware with no outbound mail
            service, so there is nothing to opt in to. Everything that happens to your events — new
            assignments, scores locked, results published, winner overrides — arrives in the
            in-app notification bell in the sidebar.
          </Alert>
          <p className="text-[13px] text-secondary tnum">
            {notifications === undefined
              ? "Checking your notifications…"
              : unread > 0
                ? `You have ${unread} unread notification${unread === 1 ? "" : "s"} waiting in the bell.`
                : "You have no unread notifications."}
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-h3 text-primary">Interface</h2>
        <div className="bg-surface-1 border border-line rounded-card p-6 flex flex-col gap-2">
          <p className="text-[13px] text-secondary">
            The interface ships in English only. Dates and times follow your browser&apos;s locale, and
            scores, credits and counts are rendered in tabular figures so columns line up.
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-h3 text-primary">Password &amp; devices</h2>
        <div className="bg-surface-1 border border-line rounded-card p-6 flex flex-col gap-3">
          <p className="text-[13px] text-secondary">
            There is no self-service password reset on an offline deployment — there is no mailbox to
            send a reset link to. An organizer or admin issues a temporary password from
            <span className="font-mono text-[12px] mx-1">/admin/users → Reset password</span>, which is
            audit-logged and invalidates your live sessions. The same screen can force-logout a single
            device.
          </p>
          {me?._creationTime ? (
            <p className="text-[12px] text-muted tnum">
              Account created {formatDate(me._creationTime)}.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
