import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Zap } from "lucide-react";
import { useT } from "@/i18n";
import { LanguageToggle } from "@/components/i18n/LanguageToggle";
import { QuickStartModal } from "@/components/title/QuickStartModal";
import type { Campaign } from "@/schemas/campaign";
import type { Character } from "@/schemas/character";

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

      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          disabled={continueDisabled}
          onClick={() => recent && navigate(`/play/${recent.campaign.id}`)}
          className="rounded-md border border-line bg-surface px-6 py-3 font-display text-sm uppercase tracking-widest text-text transition hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t("title.continueLabel")}
        </button>
        <button
          type="button"
          onClick={() => setQuickStartOpen(true)}
          className="flex items-center justify-center gap-2 rounded-md border border-accent bg-accent/20 px-6 py-3 font-display text-sm uppercase tracking-widest text-accent transition hover:bg-accent/30"
        >
          <Zap className="h-4 w-4" />
          {t("title.quickStart")}
        </button>
        <Link
          to="/character/new"
          className="rounded-md border border-accent-muted/60 bg-accent/15 px-6 py-3 font-display text-sm uppercase tracking-widest text-accent transition hover:bg-accent/25"
        >
          {t("title.newCampaign")}
        </Link>
        <Link
          to="/_dice-demo"
          className="rounded-md border border-line bg-surface px-6 py-3 font-display text-sm uppercase tracking-widest text-text transition hover:bg-surface-elevated"
        >
          {t("title.diceDemo")}
        </Link>
      </div>

      <p className="mt-2 h-4 font-mono text-[11px] text-text-muted/60">
        {continueHint}
      </p>

      <Link
        to="/campaigns"
        className="mt-2 font-display text-[11px] uppercase tracking-[0.3em] text-text-muted hover:text-text"
      >
        {t("title.allCampaigns")}
      </Link>

      <LanguageToggle className="mt-8" />

      <Link
        to="/settings"
        className="mt-4 font-display text-[11px] uppercase tracking-[0.4em] text-text-muted hover:text-text"
      >
        {t("title.settingsLink")}
      </Link>

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
