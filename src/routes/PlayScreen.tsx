import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Settings,
  BookOpen,
  ScrollText,
  Dices,
  Scroll,
  User,
  Compass,
  BookText,
} from "lucide-react";
import { useSessionStore } from "@/state/sessionStore";
import { useKeysStore } from "@/state/keysStore";
import { getWorld } from "@/data/settings";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";
import { runDmTurn } from "@/dm/loop";
import { CharacterCrest } from "@/components/play/CharacterCrest";
import { NarrationLog } from "@/components/play/NarrationLog";
import { ActionBar } from "@/components/play/ActionBar";
import { RecentRollsRail } from "@/components/play/DiceTray";
import { PendingCheckCard } from "@/components/play/PendingCheckCard";
import { PendingSaveCard } from "@/components/play/PendingSaveCard";
import { PendingReactionCard } from "@/components/play/PendingReactionCard";
import { PendingConcentrationCard } from "@/components/play/PendingConcentrationCard";
import { DyingCard } from "@/components/play/DyingCard";
import { ActionPanel } from "@/components/play/ActionPanel";
import { InitiativeTracker } from "@/components/play/InitiativeTracker";
import { DeathScreen } from "@/components/play/DeathScreen";
import { CodexSheet } from "@/components/play/CodexSheet";
import { CharacterSheet } from "@/components/play/CharacterSheet";
import { LevelUpModal } from "@/components/play/LevelUpModal";
import { ShopModal } from "@/components/play/ShopModal";
import { RollLogSheet } from "@/components/play/RollLogSheet";
import { RecapModal } from "@/components/play/RecapModal";
import { MobileSheet } from "@/components/play/MobileSheet";
import { Cheatsheet } from "@/components/play/Cheatsheet";

export function PlayScreen() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const loadCampaign = useSessionStore((s) => s.loadCampaign);
  const reset = useSessionStore((s) => s.reset);
  const campaign = useSessionStore((s) => s.campaign);
  const character = useSessionStore((s) => s.character);
  const messages = useSessionStore((s) => s.messages);
  const error = useSessionStore((s) => s.error);
  const activeProvider = useKeysStore((s) => s.activeProvider);
  const t = useT();

  // Load campaign on mount.
  useEffect(() => {
    if (!campaignId) return;
    loadCampaign(campaignId);
    return () => reset();
  }, [campaignId, loadCampaign, reset]);

  const [codexOpen, setCodexOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState<"summary" | "spells">("summary");
  const [rollLogOpen, setRollLogOpen] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  const [mobileLeftOpen, setMobileLeftOpen] = useState(false);
  const [mobileRightOpen, setMobileRightOpen] = useState(false);
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);

  function openSheetTab(tab: "summary" | "spells") {
    setSheetTab(tab);
    setSheetOpen(true);
  }

  // The session store owns the one in-flight turn (starting a turn aborts the
  // previous one; reset() above aborts it on unmount), so no controller here.
  const turn = useCallback(
    async (playerInput: string, isFirstTurn: boolean) => {
      if (!campaign || !character) return;
      await runDmTurn({ playerInput, isFirstTurn });
    },
    [campaign, character],
  );

  // Kick off the opening narration once — guarded against StrictMode double-mount.
  const openedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!campaign || !character) return;
    if (messages.length > 0) return;
    if (openedForRef.current === campaign.id) return;
    openedForRef.current = campaign.id;
    turn("", true);
  }, [campaign, character, messages.length, turn]);

  if (error) return <ErrorScreen error={error} />;
  if (!campaign || !character) return <LoadingScreen />;

  return (
    <div className="flex h-dvh flex-col">
      <TopBar
        title={campaign.title}
        location={campaign.currentLocation.name}
        worldName={getWorld().name}
        activeProvider={activeProvider}
        onOpenCodex={() => setCodexOpen(true)}
        onOpenSheet={() => openSheetTab("summary")}
        onOpenRollLog={() => setRollLogOpen(true)}
        onOpenRecap={() => setRecapOpen(true)}
        onOpenMobileLeft={() => setMobileLeftOpen(true)}
        onOpenMobileRight={() => setMobileRightOpen(true)}
        onOpenCheatsheet={() => setCheatsheetOpen(true)}
      />
      <div className="grid flex-1 min-h-0 grid-cols-1 gap-0 lg:grid-cols-[340px_1fr_300px] xl:grid-cols-[380px_1fr_320px]">
        <div className="hidden flex-col gap-4 border-r border-line/60 px-5 py-6 lg:flex">
          <CharacterCrest />
          <ActionPanel onOpenSheet={openSheetTab} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 min-h-0 px-2 sm:px-6">
            <NarrationLog />
          </div>
          {!campaign.endedAt && (
            <div className="px-2 sm:px-6">
              <DyingCard />
              <PendingReactionCard />
              <PendingConcentrationCard />
              <PendingSaveCard />
              <PendingCheckCard />
            </div>
          )}
          {campaign.endedAt ? (
            <EndedBanner />
          ) : (
            <ActionBar onSubmit={(text) => turn(text, false)} />
          )}
        </div>

        <div className="hidden border-l border-line/60 px-5 py-6 lg:block">
          <RightRail />
        </div>
      </div>
      <DeathScreen />
      <CodexSheet open={codexOpen} onClose={() => setCodexOpen(false)} />
      <CharacterSheet open={sheetOpen} onClose={() => setSheetOpen(false)} defaultTab={sheetTab} />
      <RollLogSheet open={rollLogOpen} onClose={() => setRollLogOpen(false)} />
      <RecapModal open={recapOpen} onClose={() => setRecapOpen(false)} />
      <Cheatsheet open={cheatsheetOpen} onClose={() => setCheatsheetOpen(false)} />
      <LevelUpModal />
      <ShopModal />
      <MobileSheet
        open={mobileLeftOpen}
        onClose={() => setMobileLeftOpen(false)}
        side="left"
        title={t("play.heroTitle")}
      >
        <div className="flex flex-col gap-4">
          <CharacterCrest />
          <ActionPanel onOpenSheet={openSheetTab} />
        </div>
      </MobileSheet>
      <MobileSheet
        open={mobileRightOpen}
        onClose={() => setMobileRightOpen(false)}
        side="right"
        title={t("play.worldTitle")}
      >
        <RightRail />
      </MobileSheet>
    </div>
  );
}

function EndedBanner() {
  const t = useT();
  return (
    <div className="border-t border-danger/30 bg-canvas/80 px-4 py-5 backdrop-blur">
      <div className="mx-auto flex max-w-prose flex-col items-center gap-3 text-center">
        <p className="font-display text-[10px] uppercase tracking-[0.5em] text-danger/70">
          {t("play.ended.eyebrow")}
        </p>
        <p className="text-sm leading-relaxed text-text-muted">
          {t("play.ended.body")}
        </p>
        <Link
          to="/"
          className="rounded-md border border-line bg-surface px-5 py-2 font-display text-xs uppercase tracking-[0.3em] text-text transition hover:border-accent-muted hover:text-accent"
        >
          {t("play.ended.returnToTitle")}
        </Link>
      </div>
    </div>
  );
}

const HEADER_BTN =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-text-muted transition-colors duration-150 ease-out hover:border-accent-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.97] lg:h-8 lg:w-8";

function HeaderButton({
  label,
  icon,
  onClick,
  className,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(HEADER_BTN, className)}
    >
      {icon}
    </button>
  );
}

function TopBar({
  title,
  location,
  worldName,
  activeProvider,
  onOpenCodex,
  onOpenSheet,
  onOpenRollLog,
  onOpenRecap,
  onOpenMobileLeft,
  onOpenMobileRight,
  onOpenCheatsheet,
}: {
  title: string;
  location: string;
  worldName: string | null;
  activeProvider: string | null;
  onOpenCodex: () => void;
  onOpenSheet: () => void;
  onOpenRollLog: () => void;
  onOpenRecap: () => void;
  onOpenMobileLeft: () => void;
  onOpenMobileRight: () => void;
  onOpenCheatsheet: () => void;
}) {
  const t = useT();
  const icon = "h-4 w-4";
  // Below `lg` the six tools collapse into one overflow menu so the header
  // never outgrows a phone viewport; from `lg` they sit inline as icon buttons.
  const tools: ActionMenuItem[] = [
    { key: "cheatsheet", label: t("play.cheatsheet.title"), icon: <BookText className={icon} />, onSelect: onOpenCheatsheet },
    { key: "rolls", label: t("play.rollLog.title"), icon: <Dices className={icon} />, onSelect: onOpenRollLog },
    { key: "recap", label: t("play.recap.title"), icon: <Scroll className={icon} />, onSelect: onOpenRecap },
    { key: "sheet", label: t("play.sheet.eyebrow"), icon: <ScrollText className={icon} />, onSelect: onOpenSheet },
    { key: "codex", label: t("play.codexTitle"), icon: <BookOpen className={icon} />, onSelect: onOpenCodex },
    { key: "settings", label: t("play.settingsTitle"), icon: <Settings className={icon} />, to: "/settings" },
  ];
  return (
    <header className="relative z-30 flex shrink-0 items-center gap-2 border-b border-line/60 bg-canvas/80 px-4 py-2.5 backdrop-blur">
      <div className="flex shrink-0 items-center gap-2">
        <HeaderButton
          label={t("play.heroTitle")}
          icon={<User className={icon} />}
          onClick={onOpenMobileLeft}
          className="lg:hidden"
        />
        <Link
          to="/"
          className="inline-flex min-h-10 items-center font-display text-[10px] uppercase tracking-[0.4em] text-text-muted transition-colors duration-150 ease-out hover:text-text lg:min-h-0"
        >
          {t("play.backTitle")}
        </Link>
      </div>
      <div className="min-w-0 flex-1 text-center">
        <p className="truncate font-display text-base leading-none text-text">{title}</p>
        <p className="mt-0.5 hidden truncate font-mono text-xs uppercase tracking-widest text-text-muted sm:block">
          {worldName ? `${worldName} · ${location}` : location}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <HeaderButton
          label={t("play.worldTitle")}
          icon={<Compass className={icon} />}
          onClick={onOpenMobileRight}
          className="lg:hidden"
        />
        <span
          className={`hidden rounded-sm border px-2 py-0.5 font-mono text-xs uppercase tracking-widest sm:inline-flex ${
            activeProvider
              ? "border-accent-muted/60 bg-accent/10 text-accent"
              : "border-line bg-surface text-text-muted"
          }`}
          title={activeProvider ? t("play.activeProviderHint") : t("play.stubHint")}
        >
          {activeProvider ?? t("play.stubChip")}
        </span>
        <ActionMenu label={t("play.moreMenu")} items={tools} className="lg:hidden" />
        <div className="hidden items-center gap-2 lg:flex">
          {tools.map((tool) =>
            tool.to ? (
              <Link
                key={tool.key}
                to={tool.to}
                title={tool.label}
                aria-label={tool.label}
                className={HEADER_BTN}
              >
                {tool.icon}
              </Link>
            ) : (
              <HeaderButton
                key={tool.key}
                label={tool.label}
                icon={tool.icon}
                onClick={tool.onSelect ?? (() => undefined)}
              />
            ),
          )}
        </div>
      </div>
    </header>
  );
}

function RightRail() {
  const t = useT();
  const campaign = useSessionStore((s) => s.campaign);
  const encounter = useSessionStore((s) => s.encounter);
  const activeQuests =
    (campaign?.quests ?? []).filter((q) => q.status === "active");
  return (
    <aside className="sticky top-6 flex flex-col gap-5">
      <section>
        <p className="font-display text-[10px] uppercase tracking-[0.3em] text-accent-muted">
          {t("play.rightRail.whereYouAre")}
        </p>
        <p className="mt-1.5 font-display text-base text-text">
          {campaign?.currentLocation.name ?? "—"}
        </p>
        <p className="mt-0.5 font-mono text-xs uppercase tracking-widest text-text-muted/80">
          {t("play.rightRail.day", { n: campaign?.inWorldDay ?? 1 })}
        </p>
        {campaign?.currentLocation.description && (
          <p className="mt-2 text-xs leading-relaxed text-text-muted/80">
            {campaign.currentLocation.description}
          </p>
        )}
      </section>

      {encounter ? (
        <InitiativeTracker />
      ) : (
        <section>
          <p className="mb-2 font-display text-[10px] uppercase tracking-[0.3em] text-accent-muted">
            {t("play.recentRolls.heading")}
          </p>
          <RecentRollsRail />
        </section>
      )}

      <section>
        <p className="mb-2 font-display text-[10px] uppercase tracking-[0.3em] text-accent-muted">
          {t("play.rightRail.quests")}
        </p>
        {activeQuests.length === 0 ? (
          <p className="mt-1 text-xs italic text-text-muted/80">
            {t("play.rightRail.noQuests")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {activeQuests.map((q) => (
              <li
                key={q.id}
                className="rounded-md border border-line/60 bg-surface/40 px-3 py-2"
              >
                <p className="font-display text-sm text-text">{q.title}</p>
                {q.objective && (
                  <p className="mt-0.5 text-xs leading-relaxed text-text-muted/80">
                    {q.objective}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}

function LoadingScreen() {
  const t = useT();
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <p className="font-display text-xs uppercase tracking-[0.4em] text-text-muted">
        {t("play.loading")}
      </p>
    </div>
  );
}

function ErrorScreen({ error }: { error: string }) {
  const t = useT();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6">
      <p className="font-display text-base text-danger">{error}</p>
      <Link
        to="/"
        className="rounded-md border border-line bg-surface px-5 py-2 font-display text-xs uppercase tracking-widest text-text hover:bg-surface-elevated"
      >
        {t("play.backToTitle")}
      </Link>
    </div>
  );
}
