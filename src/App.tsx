import { lazy, Suspense, useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { ParchmentBackground } from "@/components/atmosphere/ParchmentBackground";
import { TitleScreen } from "@/routes/TitleScreen";

const DiceDemo = lazy(() =>
  import("@/routes/DiceDemo").then((m) => ({ default: m.DiceDemo })),
);
const CharacterWizard = lazy(() =>
  import("@/routes/CharacterWizard").then((m) => ({ default: m.CharacterWizard })),
);
const PlayScreen = lazy(() =>
  import("@/routes/PlayScreen").then((m) => ({ default: m.PlayScreen })),
);
const SettingsScreen = lazy(() =>
  import("@/routes/SettingsScreen").then((m) => ({ default: m.SettingsScreen })),
);
const CampaignsScreen = lazy(() =>
  import("@/routes/CampaignsScreen").then((m) => ({ default: m.CampaignsScreen })),
);

export default function App() {
  // Pre-load saved API keys + locale preference once at app start so the play
  // screen has them ready the moment the player opens a campaign. Dynamic
  // imports keep the Dexie/zod payload out of the initial bundle.
  useEffect(() => {
    void import("@/state/keysStore").then((m) => m.ensureKeysLoaded());
    void import("@/i18n").then((m) => m.ensureLocaleLoaded());
  }, []);

  return (
    <div className="relative min-h-dvh text-text">
      <ParchmentBackground />
      <main className="relative z-10">
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<TitleScreen />} />
            <Route path="/_dice-demo" element={<DiceDemo />} />
            <Route path="/character/new" element={<CharacterWizard />} />
            <Route path="/play/:campaignId" element={<PlayScreen />} />
            <Route path="/campaigns" element={<CampaignsScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

function RouteFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <p className="font-display text-xs uppercase tracking-[0.4em] text-text-muted">
        Turning the page…
      </p>
    </div>
  );
}
