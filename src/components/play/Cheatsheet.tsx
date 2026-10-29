
import { BookText } from "lucide-react";
import { useT } from "@/i18n";
import { DialogTitle, Sheet } from "@/components/ui/Dialog";
import { CloseButton } from "@/components/ui/CloseButton";

interface CheatsheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Quick-reference sheet pinned to the right. Covers the 5e mechanics a
 * fanatic still flips a sourcebook for mid-session: DC standards, conditions
 * (one-line each), action types, cover bonuses, key combat terms.
 */
export function Cheatsheet({ open, onClose }: CheatsheetProps) {
  const t = useT();

  return (
    <Sheet open={open} onClose={onClose} side="right" className="w-full max-w-2xl">
      <header className="flex items-center justify-between border-b border-line/60 px-5 py-4">
        <div className="flex items-center gap-2">
          <BookText className="h-4 w-4 text-accent-muted" aria-hidden="true" />
          <DialogTitle className="font-display text-xs uppercase tracking-[0.4em] text-accent-muted">
            {t("play.cheatsheet.eyebrow")}
          </DialogTitle>
        </div>
        <CloseButton onClick={onClose} />
      </header>
      <div className="flex-1 overflow-y-auto px-5 py-4 text-sm leading-relaxed text-text-muted">
        <Section title={t("play.cheatsheet.dcTitle")}>
          <Row k="5 / 10 / 15 / 20" v={t("play.cheatsheet.dcLine1")} />
          <Row k="25" v={t("play.cheatsheet.dcLine2")} />
          <Row k="30" v={t("play.cheatsheet.dcLine3")} />
        </Section>

        <Section title={t("play.cheatsheet.actionTitle")}>
          <Row k={t("play.cheatsheet.actionAction")} v={t("play.cheatsheet.actionActionDesc")} />
          <Row k={t("play.cheatsheet.actionBonus")} v={t("play.cheatsheet.actionBonusDesc")} />
          <Row k={t("play.cheatsheet.actionReaction")} v={t("play.cheatsheet.actionReactionDesc")} />
          <Row k={t("play.cheatsheet.actionMovement")} v={t("play.cheatsheet.actionMovementDesc")} />
        </Section>

        <Section title={t("play.cheatsheet.coverTitle")}>
          <Row k={t("play.cheatsheet.coverHalf")} v="+2 AC, +2 DEX saves" />
          <Row k={t("play.cheatsheet.coverThree")} v="+5 AC, +5 DEX saves" />
          <Row k={t("play.cheatsheet.coverFull")} v={t("play.cheatsheet.coverFullDesc")} />
        </Section>

        <Section title={t("play.cheatsheet.conditionTitle")}>
          <Row k="Blinded" v={t("play.cheatsheet.condBlinded")} />
          <Row k="Charmed" v={t("play.cheatsheet.condCharmed")} />
          <Row k="Deafened" v={t("play.cheatsheet.condDeafened")} />
          <Row k="Frightened" v={t("play.cheatsheet.condFrightened")} />
          <Row k="Grappled" v={t("play.cheatsheet.condGrappled")} />
          <Row k="Incapacitated" v={t("play.cheatsheet.condIncapacitated")} />
          <Row k="Invisible" v={t("play.cheatsheet.condInvisible")} />
          <Row k="Paralyzed" v={t("play.cheatsheet.condParalyzed")} />
          <Row k="Petrified" v={t("play.cheatsheet.condPetrified")} />
          <Row k="Poisoned" v={t("play.cheatsheet.condPoisoned")} />
          <Row k="Prone" v={t("play.cheatsheet.condProne")} />
          <Row k="Restrained" v={t("play.cheatsheet.condRestrained")} />
          <Row k="Stunned" v={t("play.cheatsheet.condStunned")} />
          <Row k="Unconscious" v={t("play.cheatsheet.condUnconscious")} />
        </Section>

        <Section title={t("play.cheatsheet.combatTitle")}>
          <Row k={t("play.cheatsheet.advLabel")} v={t("play.cheatsheet.advDesc")} />
          <Row k={t("play.cheatsheet.critLabel")} v={t("play.cheatsheet.critDesc")} />
          <Row k={t("play.cheatsheet.concentrationLabel")} v={t("play.cheatsheet.concentrationDesc")} />
          <Row k={t("play.cheatsheet.deathSavesLabel")} v={t("play.cheatsheet.deathSavesDesc")} />
        </Section>

        <Section title={t("play.cheatsheet.restTitle")}>
          <Row k={t("play.cheatsheet.shortRestLabel")} v={t("play.cheatsheet.shortRestDesc")} />
          <Row k={t("play.cheatsheet.longRestLabel")} v={t("play.cheatsheet.longRestDesc")} />
        </Section>
      </div>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 font-display text-[11px] uppercase tracking-[0.3em] text-accent-muted">
        {title}
      </h3>
      <dl className="flex flex-col gap-1.5">{children}</dl>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 border-b border-line/30 py-1 last:border-0">
      <dt className="font-mono text-xs text-accent">{k}</dt>
      <dd className="text-[12px] leading-relaxed">{v}</dd>
    </div>
  );
}
