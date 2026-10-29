import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Zap } from "lucide-react";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { LanguageToggle } from "@/components/i18n/LanguageToggle";
import { QuickStartModal } from "@/components/title/QuickStartModal";
import type { Campaign } from "@/schemas/campaign";
import type { Character } from "@/schemas/character";

const BTN =
  "rounded-md border px-6 py-3 font-display text-sm uppercase tracking-widest transition-colors duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

const SMALL_LINK =
  "inline-flex min-h-10 items-center rounded-sm font-display text-xs uppercase text-text-muted transition-colors duration-150 ease-out hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60";

export function TitleScreen() {
  const t = useT();
  const navigate = useNavigate();
  const [recent, setRecent] = useState<{ campaign: Campaign; character: Character | null } | null>(
    null,
  );
  const [loaded, setLoaded] = useState(false);
  const [quickStartOpen, setQuickStartOpen] = useState(false);

  // Defer-load Dexie so the initial title-screen bundle stays under 100 KB gzip.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [{ getMostRecentCampaign }, { db }] = await Promise.all([
        import("@/state/campaignsLoader"),
        import("@/db/schema"),
      ]);
      const campaign = await getMostRecentCampaign();
      if (cancelled) return;
      if (!campaign) {
        setLoaded(true);
        return;
      }
      const character = (await db.characters.get(campaign.characterId)) ?? null;
      if (cancelled) return;
      setRecent({ campaign, character });
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const continueDisabled = !recent;
  const continueHint = recent?.character
    ? t("title.continueHint", { name: recent.character.name })
    : loaded
      ? t("title.noSaves")
      : t("common.loading");

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="text-xs uppercase tracking-[0.4em] text-text-muted">
        {t("title.tagline")}
      </p>
      <h1 className="mt-4 font-display text-6xl font-semibold text-[var(--color-gold)] md:text-7xl">
        {t("title.name")}
      </h1>
      <p className="mt-3 max-w-md text-sm text-text-muted md:text-base">
        {t("title.intro")}
      </p>

      <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          disabled={continueDisabled}
          onClick={() => recent && navigate(`/play/${recent.campaign.id}`)}
          className={cn(BTN, "border-line bg-surface text-text hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-60")}
        >
          {t("title.continueLabel")}
        </button>
        {/* One primary action: starting a new campaign. Quick Start is the shortcut. */}
        <Link
          to="/character/new"
          className={cn(
            BTN,
            "border-accent bg-accent font-semibold text-canvas shadow-[0_0_24px_-6px_rgba(212,175,55,0.6)] hover:bg-gold-muted",
          )}
        >
          {t("title.newCampaign")}
        </Link>
        <button
          type="button"
          onClick={() => setQuickStartOpen(true)}
          className={cn(BTN, "flex items-center justify-center gap-2 border-accent-muted/60 bg-transparent text-accent hover:bg-accent/10")}
        >
          <Zap className="h-4 w-4" aria-hidden="true" />
          {t("title.quickStart")}
        </button>
      </div>

      <p className="mt-2 h-4 font-mono text-xs text-text-muted/80">
        {continueHint}
      </p>

      <Link
        to="/campaigns"
        className={cn(SMALL_LINK, "mt-2 tracking-[0.3em]")}
      >
        {t("title.allCampaigns")}
      </Link>

      <LanguageToggle className="mt-8" />

      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-6">
        <Link to="/settings" className={cn(SMALL_LINK, "tracking-[0.4em]")}>
          {t("title.settingsLink")}
        </Link>
        <Link to="/_dice-demo" className={cn(SMALL_LINK, "tracking-[0.3em]")}>
          {t("title.diceDemo")}
        </Link>
      </div>

      <p className="mt-12 max-w-sm text-xs leading-relaxed text-text-muted/80">
        {t("title.ogl")}
      </p>

      <QuickStartModal
        open={quickStartOpen}
        onClose={() => setQuickStartOpen(false)}
        onCreated={(campaignId) => {
          setQuickStartOpen(false);
          navigate(`/play/${campaignId}`);
        }}
      />
    </div>
  );
}
