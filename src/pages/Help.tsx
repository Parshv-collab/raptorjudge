import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { Markdown } from "@/components/ui/Markdown";
import { Badge } from "@/components/ui/Badge";

/**
 * Public help center (issue 26): content now comes from the admin-managed
 * `helpContent` table — FAQs render as an accordion, articles render as full
 * markdown documents. The static copy is gone; organizers own this page.
 */
export default function Help() {
  const entries = useQuery(api.help.listPublic, {});
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  const faqs = (entries ?? []).filter((e: any) => e.type === "faq");
  const articles = (entries ?? []).filter((e: any) => e.type === "article");

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-10">
      <PageHeader title="Help center" description="Guides and frequently asked questions." bordered={false} />

      {entries === undefined ? (
        <SkeletonCard lines={6} />
      ) : (
        <>
          {faqs.length > 0 && (
            <section className="flex flex-col gap-2" aria-label="Frequently asked questions">
              <h2 className="text-h3 text-primary">Frequently asked questions</h2>
              {faqs.map((item: any) => {
                const isOpen = openFaq === item.id;
                return (
                  <div key={item.id} className="bg-surface-1 border border-line rounded-card">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpenFaq(isOpen ? null : item.id)}
                      className="w-full flex justify-between items-center px-5 h-14 text-left text-sm font-medium text-primary"
                    >
                      <span>{item.title}</span>
                      <span className="text-accent text-lg leading-none" aria-hidden="true">
                        {isOpen ? "−" : "+"}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-5 text-[13px] border-t border-line pt-4">
                        <Markdown content={item.body} className="text-[13px]" />
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          )}

          {articles.length > 0 && (
            <section className="flex flex-col gap-6" aria-label="Guides and articles">
              <h2 className="text-h3 text-primary">Guides</h2>
              {articles.map((item: any) => (
                <article key={item.id} className="bg-surface-1 border border-line rounded-card p-6 flex flex-col gap-3">
                  <Badge variant="accent" className="w-max">
                    Guide
                  </Badge>
                  <h3 className="text-h3 text-primary">{item.title}</h3>
                  <Markdown content={item.body} />
                </article>
              ))}
            </section>
          )}

          {faqs.length === 0 && articles.length === 0 && (
            <div className="bg-surface-1 border border-line rounded-card p-8 text-center text-[13px] text-secondary">
              No help content has been published yet. Administrators can add it from the admin
              console under Help Content.
            </div>
          )}
        </>
      )}

      <div className="text-center flex flex-col items-center gap-2 pt-4">
        <p className="text-[13px] text-secondary">Still need assistance?</p>
        <a href="mailto:support@raptorjudge.local" className="text-sm text-accent hover:text-accent-hover">
          Contact support →
        </a>
      </div>
    </div>
  );
}
