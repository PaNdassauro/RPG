import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, Sparkles } from "lucide-react";
import {
  listCampaignSummaries,
  deleteCampaign,
  type CampaignSummary,
} from "@/state/campaignsLoader";
import { getSetting, type SettingId } from "@/data/settings";
import { getRace, getSubrace, getClass } from "@/data/srd";
import { getPortrait } from "@/data/portraits";
import { formatRelativeTime } from "@/lib/relativeTime";
import { useT, useLocaleStore } from "@/i18n";
import { cn } from "@/lib/cn";

export function CampaignsScreen() {
  const t = useT();
  const locale = useLocaleStore((s) => s.locale);
  const [summaries, setSummaries] = useState<CampaignSummary[] | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  useEffect(() => {
    void listCampaignSummaries().then(setSummaries);
  }, []);

  async function handleDelete(campaignId: string) {
    await deleteCampaign(campaignId);
    setPendingDelete(null);
    setSummaries(await listCampaignSummaries());
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-6 py-10">
      <header className="flex items-center justify-between">
        <Link
          to="/"
          className="font-display text-xs uppercase tracking-widest text-text-muted hover:text-text"
        >
          {t("campaigns.backTitle")}
        </Link>
        <h1 className="font-display text-2xl text-text">
          {t("campaigns.heading")}
        </h1>
        <span className="font-display text-xs uppercase tracking-[0.4em] text-accent-muted">
          {t("campaigns.eyebrow")}
        </span>
      </header>

      <p className="mt-6 max-w-2xl text-sm leading-relaxed text-text-muted">
        {t("campaigns.intro")}
      </p>

      <div className="mt-6 flex justify-end">
        <Link
          to="/character/new"
          className="rounded-md border border-accent-muted/60 bg-accent/15 px-5 py-2 font-display text-xs uppercase tracking-widest text-accent transition hover:bg-accent/25"
        >
          {t("campaigns.newButton")}
        </Link>
      </div>

      <div className="mt-6">
        {summaries === null ? (
          <p className="font-display text-xs uppercase tracking-[0.3em] text-text-muted">
            {t("common.loading")}
          </p>
        ) : summaries.length === 0 ? (
          <EmptyState message={t("campaigns.empty")} />
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <AnimatePresence initial={false}>
              {summaries.map((s) => (
                <motion.li
                  key={s.campaign.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.18 }}
                >
                  <CampaignCard
                    summary={s}
                    locale={locale}
                    pendingDelete={pendingDelete === s.campaign.id}
                    onAskDelete={() => setPendingDelete(s.campaign.id)}
                    onCancelDelete={() => setPendingDelete(null)}
                    onConfirmDelete={() => handleDelete(s.campaign.id)}
                  />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-line bg-surface/40 p-10 text-center">
      <Sparkles className="mx-auto h-6 w-6 text-accent-muted" />
      <p className="mt-3 text-sm text-text-muted">{message}</p>
    </div>
  );
}

interface CampaignCardProps {
  summary: CampaignSummary;
  locale: "en" | "pt-BR";
  pendingDelete: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}

function CampaignCard({
  summary,
  locale,
  pendingDelete,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: CampaignCardProps) {
  const t = useT();
  const navigate = useNavigate();
  const { campaign, character, messageCount } = summary;
  const setting = getSetting(campaign.settingId as SettingId);

  const race = character?.raceId ? getRace(character.raceId) : null;
  const subrace = character?.subraceId ? getSubrace(character.subraceId) : null;
  const klass = character?.classes[0]
    ? getClass(character.classes[0].classId)
    : null;
  const level = character
    ? character.classes.reduce((sum, c) => sum + c.level, 0)
    : 1;

  const heritage = [subrace?.name, race?.name].filter(Boolean).join(" · ");
  const portrait = getPortrait(character?.portraitId);
  const PortraitIcon = portrait.icon;

  const lastPlayed = formatRelativeTime(campaign.updatedAt, locale);

  return (
    <article
      className={cn(
        "group relative flex flex-col rounded-md border border-line bg-surface/60 p-5 transition hover:border-accent-muted",
      )}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-accent-muted/40 bg-accent/10">
          <PortraitIcon className="h-7 w-7 text-accent" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-text-muted">
            {setting?.name ?? "—"}
          </p>
          <h3 className="mt-0.5 truncate font-display text-lg text-text">
            {character?.name ?? "—"}
          </h3>
          <p className="mt-0.5 truncate text-xs text-text-muted">
            {heritage}
            {klass && ` · ${klass.name}`}{" "}
            <span className="text-accent-muted">
              · {t("campaigns.levelLabel", { level })}
            </span>
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-text-muted">
        <div>
          <p className="font-display text-[9px] uppercase tracking-[0.3em] text-text-muted/70">
            {t("campaigns.locationLabel")}
          </p>
          <p className="mt-0.5 truncate text-text">
            {campaign.currentLocation.name}
          </p>
        </div>
        <div>
          <p className="font-display text-[9px] uppercase tracking-[0.3em] text-text-muted/70">
            {t("campaigns.lastPlayed", { when: lastPlayed })}
          </p>
          <p className="mt-0.5 truncate font-mono text-[11px]">
            {t("campaigns.messageCount", { count: messageCount })}
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        {pendingDelete ? (
          <>
            <button
              type="button"
              onClick={onCancelDelete}
              className="rounded-md border border-line bg-surface px-3 py-1.5 font-display text-[11px] uppercase tracking-widest text-text-muted hover:text-text"
            >
              {t("campaigns.deleteCancel")}
            </button>
            <button
              type="button"
              onClick={onConfirmDelete}
              className="flex items-center gap-1.5 rounded-md border border-danger bg-danger/15 px-3 py-1.5 font-display text-[11px] uppercase tracking-widest text-danger transition hover:bg-danger/25"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("campaigns.deleteConfirm")}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onAskDelete}
              className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 font-display text-[11px] uppercase tracking-widest text-text-muted hover:border-danger/40 hover:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("campaigns.deleteButton")}
            </button>
            <button
              type="button"
              onClick={() => navigate(`/play/${campaign.id}`)}
              className="rounded-md border border-accent-muted/60 bg-accent/15 px-4 py-1.5 font-display text-[11px] uppercase tracking-widest text-accent transition hover:bg-accent/25"
            >
              {t("campaigns.openButton")}
            </button>
          </>
        )}
      </div>
    </article>
  );
}
