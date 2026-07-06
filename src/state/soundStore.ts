import { create } from "zustand";
import { db } from "@/db/schema";

interface SoundState {
  diceEnabled: boolean;
  ambientEnabled: boolean;
  loaded: boolean;
  setDice: (on: boolean) => Promise<void>;
  setAmbient: (on: boolean) => Promise<void>;
  ensureLoaded: () => Promise<void>;
}

const STORAGE_KEY = "sound-preferences";

export const useSoundStore = create<SoundState>((set, get) => ({
  diceEnabled: false,
  ambientEnabled: false,
  loaded: false,
  async ensureLoaded() {
    if (get().loaded) return;
    const rec = await db.settings.get(STORAGE_KEY);
    if (rec && typeof rec.value === "object" && rec.value !== null) {
      const v = rec.value as { dice?: boolean; ambient?: boolean };
      set({
        diceEnabled: !!v.dice,
        ambientEnabled: !!v.ambient,
        loaded: true,
      });
    } else {
      set({ loaded: true });
    }
  },
  async setDice(on) {
    set({ diceEnabled: on });
    await persist(get());
  },
  async setAmbient(on) {
    set({ ambientEnabled: on });
    await persist(get());
  },
}));

async function persist(s: SoundState) {
  await db.settings.put({
    key: STORAGE_KEY,
    value: { dice: s.diceEnabled, ambient: s.ambientEnabled },
    updatedAt: Date.now(),
  });
}

// --- Audio engine -------------------------------------------------------

let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return ctx;
}

/**
 * Synthesize a short "click" reminiscent of a die hitting wood — no asset,
 * no payload. Pitch + decay rough-tuned. Caller decides when to fire.
 */
export function playDiceClack(): void {
  if (!useSoundStore.getState().diceEnabled) return;
  const c = getCtx();
  if (!c) return;
  // 3 short percussive clicks at descending pitches → die tumble feel.
  const now = c.currentTime;
  const pitches = [580, 480, 420];
  for (let i = 0; i < pitches.length; i++) {
    const t = now + i * 0.06;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(pitches[i]!, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  }
}

let ambientNode: { osc: OscillatorNode; gain: GainNode } | null = null;

export function setAmbientPlaying(on: boolean): void {
  const c = getCtx();
  if (!c) return;
  if (on && !ambientNode) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = 90;
    gain.gain.setValueAtTime(0.0001, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.035, c.currentTime + 1.5);
    osc.connect(gain).connect(c.destination);
    osc.start();
    ambientNode = { osc, gain };
  } else if (!on && ambientNode) {
    const { osc, gain } = ambientNode;
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.8);
    setTimeout(() => {
      try {
        osc.stop();
      } catch {
        // ignore
      }
    }, 900);
    ambientNode = null;
  }
}
