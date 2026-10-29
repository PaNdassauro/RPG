import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff, Trash2, Check, Sparkles, Download, Upload, Volume2 } from "lucide-react";
import { ensureKeysLoaded, useKeysStore } from "@/state/keysStore";
import { setAmbientPlaying, useSoundStore } from "@/state/soundStore";
import {
  downloadBundle,
  exportAllCampaigns,
  importBundle,
  type ImportSummary,
} from "@/state/campaignExport";
import {
  CLAUDE_MODEL_OPTIONS,
  DEFAULT_CLAUDE_MODEL,
} from "@/ai/providers/anthropic";
import {
  OPENAI_MODEL_OPTIONS,
  DEFAULT_OPENAI_MODEL,
} from "@/ai/providers/openai";
import {
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
} from "@/ai/providers";
import { useT } from "@/i18n";
import { LanguageToggle } from "@/components/i18n/LanguageToggle";
import type { ProviderId } from "@/db/schema";
import { cn } from "@/lib/cn";

interface ProviderMeta {
  id: ProviderId;
  keyPrefix: string;
  available: boolean;
  /** False for local servers that need no API key. */
  requiresKey: boolean;
  models?: ReadonlyArray<{ id: string; label: string }>;
  /** Allow typing a model id that is not in `models` (or any id when `models` is absent). */
  customModel?: boolean;
  defaultModel?: string;
  /** Endpoint is user-configurable (local OpenAI-compatible servers). */
  defaultBaseUrl?: string;
}

/** Select sentinel for "type my own model id" (an empty value would make it uncontrolled). */
const CUSTOM_MODEL = "__custom__";

const PROVIDERS: ProviderMeta[] = [
  {
    id: "claude",
    keyPrefix: "sk-ant-…",
    available: true,
    requiresKey: true,
    models: CLAUDE_MODEL_OPTIONS,
    defaultModel: DEFAULT_CLAUDE_MODEL,
  },
  {
    id: "openai",
    keyPrefix: "sk-…",
    available: true,
    requiresKey: true,
    models: OPENAI_MODEL_OPTIONS,
    customModel: true,
    defaultModel: DEFAULT_OPENAI_MODEL,
  },
  { id: "gemini", keyPrefix: "AI…", available: false, requiresKey: true },
  {
    id: "ollama",
    keyPrefix: "(no key)",
    available: true,
    requiresKey: false,
    customModel: true,
    defaultModel: DEFAULT_OLLAMA_MODEL,
    defaultBaseUrl: DEFAULT_OLLAMA_BASE_URL,
  },
];

export function SettingsScreen() {
  const t = useT();
  const [activeTab, setActiveTab] = useState<ProviderId>("claude");
  const records = useKeysStore((s) => s.records);
  const activeProvider = useKeysStore((s) => s.activeProvider);
  const loaded = useKeysStore((s) => s.loaded);

  useEffect(() => {
    void ensureKeysLoaded();
  }, []);

  return (
    <div className="mx-auto flex min-h-dvh max-w-4xl flex-col px-6 py-10">
      <header className="flex items-center justify-between">
        <Link
          to="/"
          className="font-display text-xs uppercase tracking-widest text-text-muted hover:text-text"
        >
          {t("settings.backTitle")}
        </Link>
        <h1 className="font-display text-2xl text-text">
          {t("settings.heading")}
        </h1>
        <span className="font-display text-xs uppercase tracking-[0.4em] text-accent-muted">
          {t("settings.eyebrow")}
        </span>
      </header>

      <p className="mt-6 max-w-2xl text-sm leading-relaxed text-text-muted">
        {t("settings.intro")}
      </p>

      <section className="mt-8 rounded-md border border-line bg-surface/50 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display text-xs uppercase tracking-[0.4em] text-accent-muted">
              {t("settings.languageHeading")}
            </p>
            <p className="mt-1 max-w-xl text-xs text-text-muted">
              {t("settings.languageHint")}
            </p>
          </div>
          <LanguageToggle />
        </div>
      </section>

      <div className="mt-6 rounded-md border border-line bg-surface/50">
        <div className="flex flex-wrap border-b border-line">
          {PROVIDERS.map((p) => {
            const isActive = activeTab === p.id;
            const hasKey = !!records[p.id];
            const isDefault = activeProvider === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setActiveTab(p.id)}
                disabled={!p.available && !hasKey}
                className={cn(
                  "flex items-center gap-2 border-r border-line px-4 py-3 font-display text-xs uppercase tracking-widest transition",
                  isActive
                    ? "bg-accent/10 text-accent"
                    : "text-text-muted hover:bg-surface hover:text-text",
                  !p.available && "opacity-50",
                )}
              >
                {t(`providers.${p.id}.name`)}
                {hasKey && (
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      isDefault ? "bg-accent" : "bg-text-muted/60",
                    )}
                    title={
                      isDefault
                        ? t("settings.activeProvider")
                        : t("settings.keyOnFile")
                    }
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {PROVIDERS.filter((p) => p.id === activeTab).map((p) => (
            <ProviderPanel key={p.id} provider={p} loaded={loaded} />
          ))}
        </div>
      </div>

      <SoundSection />

      <BackupSection />

      <div className="mt-6 rounded-md border border-line bg-surface/40 p-4 text-xs leading-relaxed text-text-muted">
        <p className="mb-1 flex items-center gap-2 font-display uppercase tracking-widest text-accent-muted">
          <Sparkles className="h-3.5 w-3.5" /> {t("settings.withoutKey.title")}
        </p>
        <p>{t("settings.withoutKey.body")}</p>
      </div>
    </div>
  );
}

function SoundSection() {
  const t = useT();
  const { diceEnabled, ambientEnabled, setDice, setAmbient, ensureLoaded } =
    useSoundStore();
  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);
  useEffect(() => {
    setAmbientPlaying(ambientEnabled);
  }, [ambientEnabled]);

  return (
    <section className="mt-6 rounded-md border border-line bg-surface/50 p-6">
      <div className="flex items-start gap-3">
        <Volume2 className="mt-1 h-4 w-4 shrink-0 text-accent-muted" />
        <div className="flex-1">
          <p className="font-display text-xs uppercase tracking-[0.4em] text-accent-muted">
            {t("settings.sound.heading")}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {t("settings.sound.hint")}
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-xs">
              <input
                type="checkbox"
                checked={diceEnabled}
                onChange={(e) => void setDice(e.target.checked)}
                className="h-3.5 w-3.5 accent-current"
              />
              {t("settings.sound.dice")}
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-xs">
              <input
                type="checkbox"
                checked={ambientEnabled}
                onChange={(e) => void setAmbient(e.target.checked)}
                className="h-3.5 w-3.5 accent-current"
              />
              {t("settings.sound.ambient")}
            </label>
          </div>
        </div>
      </div>
    </section>
  );
}

function BackupSection() {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function onExport() {
    setBusy(true);
    setFeedback(null);
    try {
      const bundle = await exportAllCampaigns();
      downloadBundle(bundle);
      setFeedback(
        t("settings.backup.exported", {
          campaigns: bundle.campaigns.length,
          messages: bundle.messages.length,
        }),
      );
    } catch (err) {
      setFeedback(
        err instanceof Error ? err.message : t("settings.backup.exportFailed"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function onImport(file: File) {
    setBusy(true);
    setFeedback(null);
    try {
      const text = await file.text();
      const summary: ImportSummary = await importBundle(text);
      setFeedback(
        t("settings.backup.imported", {
          campaigns: summary.campaigns,
          characters: summary.characters,
          messages: summary.messages,
        }),
      );
    } catch (err) {
      setFeedback(
        err instanceof Error ? err.message : t("settings.backup.importFailed"),
      );
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <section className="mt-6 rounded-md border border-line bg-surface/50 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <p className="font-display text-xs uppercase tracking-[0.4em] text-accent-muted">
            {t("settings.backup.heading")}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {t("settings.backup.hint")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onExport}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md border border-accent-muted/60 bg-accent/15 px-3 py-2 font-display text-[11px] uppercase tracking-widest text-accent transition hover:bg-accent/25 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            {t("settings.backup.exportButton")}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-2 font-display text-[11px] uppercase tracking-widest text-text-muted transition hover:border-accent-muted hover:text-text disabled:opacity-50"
          >
            <Upload className="h-3.5 w-3.5" />
            {t("settings.backup.importButton")}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImport(f);
            }}
          />
        </div>
      </div>
      {feedback && (
        <p className="mt-3 font-mono text-[11px] text-text-muted/80">{feedback}</p>
      )}
    </section>
  );
}

function ProviderPanel({
  provider,
  loaded,
}: {
  provider: ProviderMeta;
  loaded: boolean;
}) {
  const t = useT();
  const records = useKeysStore((s) => s.records);
  const activeProvider = useKeysStore((s) => s.activeProvider);
  const saveKey = useKeysStore((s) => s.saveKey);
  const removeKey = useKeysStore((s) => s.removeKey);
  const setActiveProvider = useKeysStore((s) => s.setActiveProvider);

  const existing = records[provider.id];
  const [keyInput, setKeyInput] = useState("");
  const [model, setModel] = useState(
    existing?.model ?? provider.defaultModel ?? "",
  );
  const [baseUrl, setBaseUrl] = useState(
    existing?.baseUrl ?? provider.defaultBaseUrl ?? "",
  );
  const [customMode, setCustomMode] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setKeyInput("");
    setModel(existing?.model ?? provider.defaultModel ?? "");
    setBaseUrl(existing?.baseUrl ?? provider.defaultBaseUrl ?? "");
    setCustomMode(false);
    setReveal(false);
    setFeedback(null);
  }, [
    existing?.providerId,
    existing?.model,
    existing?.baseUrl,
    provider.defaultModel,
    provider.defaultBaseUrl,
  ]);

  if (!loaded) {
    return <p className="text-sm text-text-muted">{t("settings.loadingKeys")}</p>;
  }

  if (!provider.available && !existing) {
    return (
      <div className="space-y-2 text-sm text-text-muted">
        <p>{t(`providers.${provider.id}.blurb`)}</p>
        <p className="text-xs italic text-text-muted/60">
          {t("settings.notWired")}
        </p>
      </div>
    );
  }

  const isActive = activeProvider === provider.id;
  const knownModelIds = provider.models?.map((m) => m.id) ?? [];
  const usingCustomModel =
    !!provider.customModel &&
    (customMode || (model !== "" && !knownModelIds.includes(model)));
  const selectValue = usingCustomModel ? CUSTOM_MODEL : model;
  // Providers with no preset list (Ollama) always show the text box.
  const showCustomInput = !provider.models ? !!provider.customModel : usingCustomModel;

  async function onSave() {
    if (provider.requiresKey && !keyInput.trim() && !existing) {
      setFeedback(t("settings.enterKey"));
      return;
    }
    setSaving(true);
    try {
      const trimmedUrl = baseUrl.trim();
      await saveKey({
        providerId: provider.id,
        key: keyInput.trim() || existing?.key || "",
        model: model.trim() || provider.defaultModel,
        ...(provider.defaultBaseUrl && trimmedUrl ? { baseUrl: trimmedUrl } : {}),
        updatedAt: Date.now(),
      });
      setKeyInput("");
      setFeedback(t("settings.saved"));
    } finally {
      setSaving(false);
    }
  }

  async function onRemove() {
    await removeKey(provider.id);
    setKeyInput("");
    setFeedback(t("settings.removed"));
  }

  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-text-muted">
        {t(`providers.${provider.id}.blurb`)}
      </p>

      {provider.defaultBaseUrl && (
        <div>
          <label className="mb-2 block font-display text-xs uppercase tracking-[0.3em] text-text-muted">
            {t("settings.baseUrlLabel")}
          </label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={provider.defaultBaseUrl}
            className="w-full rounded-md border border-line bg-surface-elevated px-3 py-2 font-mono text-sm text-text focus:border-accent-muted focus:outline-none focus:ring-1 focus:ring-accent-muted"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      )}

      {provider.requiresKey ? (
        <div>
          <label className="mb-2 block font-display text-xs uppercase tracking-[0.3em] text-text-muted">
            {t("settings.apiKeyLabel")}
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={reveal ? "text" : "password"}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder={
                  existing
                    ? `${existing.key.slice(0, 6)}…${existing.key.slice(-4)}`
                    : provider.keyPrefix
                }
                className="w-full rounded-md border border-line bg-surface-elevated px-3 py-2 pr-10 font-mono text-sm text-text focus:border-accent-muted focus:outline-none focus:ring-1 focus:ring-accent-muted"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
                tabIndex={-1}
              >
                {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="rounded-md border border-accent-muted/60 bg-accent/15 px-4 font-display text-xs uppercase tracking-widest text-accent transition hover:bg-accent/25 disabled:opacity-50"
            >
              {existing ? t("common.update") : t("common.save")}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-text-muted">{t("settings.noKeyNeeded")}</p>
      )}

      {(provider.models || provider.customModel) && (
        <div>
          <label className="mb-2 block font-display text-xs uppercase tracking-[0.3em] text-text-muted">
            {t("settings.modelLabel")}
          </label>
          {provider.models && (
            <select
              value={selectValue}
              onChange={(e) => {
                if (e.target.value === CUSTOM_MODEL) {
                  setCustomMode(true);
                  setModel("");
                } else {
                  setCustomMode(false);
                  setModel(e.target.value);
                }
              }}
              className="w-full rounded-md border border-line bg-surface-elevated px-3 py-2 font-mono text-sm text-text focus:border-accent-muted focus:outline-none"
            >
              {provider.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
              {provider.customModel && (
                <option value={CUSTOM_MODEL}>{t("settings.customModelOption")}</option>
              )}
            </select>
          )}
          {showCustomInput && (
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={provider.defaultModel ?? t("settings.customModelPlaceholder")}
              className={cn(
                "w-full rounded-md border border-line bg-surface-elevated px-3 py-2 font-mono text-sm text-text focus:border-accent-muted focus:outline-none focus:ring-1 focus:ring-accent-muted",
                provider.models && "mt-2",
              )}
              autoComplete="off"
              spellCheck={false}
            />
          )}
        </div>
      )}

      {!provider.requiresKey && (
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-md border border-accent-muted/60 bg-accent/15 px-4 py-2 font-display text-xs uppercase tracking-widest text-accent transition hover:bg-accent/25 disabled:opacity-50"
        >
          {existing ? t("common.update") : t("common.save")}
        </button>
      )}

      {existing && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface/60 px-4 py-3">
          <span className="font-mono text-xs text-text-muted">
            {provider.requiresKey
              ? `${t("settings.keyOnFile")} ${existing.key.slice(0, 4)}…${existing.key.slice(-4)}`
              : `${t("settings.endpointOnFile")} ${existing.baseUrl ?? provider.defaultBaseUrl ?? ""}`}
          </span>
          {!isActive ? (
            <button
              type="button"
              onClick={() => setActiveProvider(provider.id)}
              className="ml-auto flex items-center gap-1.5 rounded-md border border-line bg-surface-elevated px-3 py-1 font-display text-[11px] uppercase tracking-widest text-text-muted hover:text-text"
            >
              {t("settings.makeActive")}
            </button>
          ) : (
            <span className="ml-auto flex items-center gap-1.5 rounded-md border border-accent-muted/60 bg-accent/10 px-3 py-1 font-display text-[11px] uppercase tracking-widest text-accent">
              <Check className="h-3.5 w-3.5" />
              {t("settings.activeProvider")}
            </span>
          )}
          <button
            type="button"
            onClick={onRemove}
            className="flex items-center gap-1.5 rounded-md border border-danger/40 bg-danger/5 px-3 py-1 font-display text-[11px] uppercase tracking-widest text-danger/90 hover:bg-danger/15"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("common.remove")}
          </button>
        </div>
      )}

      {feedback && (
        <p className="font-mono text-xs text-text-muted/70">{feedback}</p>
      )}

      <p className="text-xs leading-relaxed text-text-muted/70">
        {t("settings.endpointHelp", {
          endpoint: provider.defaultBaseUrl
            ? hostOf(baseUrl || provider.defaultBaseUrl)
            : providerEndpoint(provider.id),
        })}
      </p>
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function providerEndpoint(id: ProviderId): string {
  switch (id) {
    case "claude":
      return "api.anthropic.com";
    case "openai":
      return "api.openai.com";
    case "gemini":
      return "generativelanguage.googleapis.com";
    case "ollama":
      return "localhost:11434";
  }
}
