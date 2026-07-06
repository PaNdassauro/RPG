import { useState } from "react";
import { Link } from "react-router-dom";
import { DiceRoll } from "@/components/dice/DiceRoll";
import { rollExpression, rollWithMode, type RollMode } from "@/engine/dice";
import type { DiceRollResult } from "@/engine/types";

interface DemoRoll {
  id: number;
  result: DiceRollResult;
  dc: number | null;
  label: string;
}

export function DiceDemo() {
  const [rolls, setRolls] = useState<DemoRoll[]>([]);
  const [counter, setCounter] = useState(0);

  function pushRoll(label: string, expr: string, mode: RollMode = null, dc: number | null = null) {
    const result = mode ? rollWithMode(expr, mode) : rollExpression(expr);
    const id = counter + 1;
    setCounter(id);
    setRolls((prev) => [...prev, { id, result, dc, label }].slice(-6));
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-6 py-10">
      <header className="flex items-center justify-between">
        <Link
          to="/"
          className="font-display text-xs uppercase tracking-widest text-text-muted hover:text-text"
        >
          ← Title
        </Link>
        <h1 className="font-display text-2xl text-text">Dice Demo</h1>
        <span className="font-display text-xs uppercase tracking-widest text-text-muted">
          Tune the feel
        </span>
      </header>

      <p className="mt-4 text-sm text-text-muted">
        The signature moment. Engine resolves first; UI animates the foregone conclusion.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <DemoButton onClick={() => pushRoll("Stealth check", "1d20+4", null, 12)}>
          Stealth (DC 12)
        </DemoButton>
        <DemoButton onClick={() => pushRoll("Perception, advantage", "1d20+3", "adv", 15)}>
          Perception adv. (DC 15)
        </DemoButton>
        <DemoButton onClick={() => pushRoll("DEX save, disadvantage", "1d20+2", "dis", 14)}>
          DEX save dis. (DC 14)
        </DemoButton>
        <DemoButton onClick={() => pushRoll("Longsword damage", "1d8+3")}>
          Longsword 1d8+3
        </DemoButton>
        <DemoButton onClick={() => pushRoll("Fireball", "8d6")}>
          Fireball 8d6
        </DemoButton>
        <DemoButton onClick={() => pushRoll("Raw d20", "1d20")}>
          d20
        </DemoButton>
      </div>

      <div className="mt-10 space-y-4">
        {rolls.length === 0 ? (
          <p className="text-center text-sm text-text-muted/70">No rolls yet.</p>
        ) : (
          rolls
            .slice()
            .reverse()
            .map((r) => (
              <div
                key={r.id}
                className="rounded-md border border-line/70 bg-surface/60 p-4"
              >
                <p className="mb-3 font-display text-xs uppercase tracking-widest text-text-muted">
                  {r.label}
                </p>
                <DiceRoll result={r.result} dc={r.dc} autoPlay />
              </div>
            ))
        )}
      </div>
    </div>
  );
}

function DemoButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-text transition hover:border-accent-muted hover:bg-surface-elevated active:translate-y-px"
    >
      {children}
    </button>
  );
}
