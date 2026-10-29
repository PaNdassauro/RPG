# RPG — AI Dungeon Master

A browser-based tabletop RPG app with an AI Dungeon Master, built on the D&D 5e SRD. Everything runs client-side: your campaigns, characters, and API keys are stored locally in your browser (IndexedDB) — there is no backend.

## Features

- AI Dungeon Master for the Forgotten Realms (1492 DR, Sword Coast), powered by your own LLM provider: Anthropic Claude, OpenAI, or a local model through Ollama (OpenAI-compatible API)
- D&D 5e SRD content bundled (races, classes, spells, monsters, equipment)
- Character creation and campaign management, persisted locally
- Bring your own API key — configured at runtime in Settings, never leaves your browser except to call your chosen provider

## Stack

React 18 · TypeScript · Vite 6 · Tailwind CSS 4 · Zustand · Dexie (IndexedDB) · Zod · Framer Motion

## Getting started

```bash
npm install
npm run dev
```

Open the app, go to **Settings**, and add an API key for Anthropic or OpenAI. Anthropic defaults to Claude Sonnet 5.5 (Opus 5.5, Haiku 5.5 and Fable 5.1 are also offered); OpenAI defaults to GPT-6.1 Sol (Terra, Astra and Luna are also offered), or you can type any chat model id.

To play against a local model, install [Ollama](https://ollama.com), pull a model (for example `ollama pull llama3.1`), and choose **Local · Ollama** in Settings. The default endpoint is `http://localhost:11434/v1` and no key is needed. Because the app calls the model straight from your browser, start Ollama with `OLLAMA_ORIGINS` set to the app's origin, for example `OLLAMA_ORIGINS=http://localhost:5173 ollama serve`, or the browser will block the requests.

Without any provider configured, the DM falls back to a small templated narrator (enough to try the interface). Google Gemini is not wired yet.

Other scripts:

```bash
npm run build    # type-check and build for production
npm run preview  # preview the production build
npm run lint     # type-check only
```

## Contributing

Contributions are welcome — bug reports, feature ideas, code, translations, and playtesting feedback. See [CONTRIBUTING.md](CONTRIBUTING.md) to get started. Pull requests should target the `dev` branch.

## License

Code is licensed under the [MIT License](LICENSE).

D&D 5e SRD content in `src/data/srd/` is Open Game Content from the System Reference Document 5.1, © Wizards of the Coast, used under the Open Game License v1.0a — see [src/data/srd/ATTRIBUTION.md](src/data/srd/ATTRIBUTION.md) and the OGL license text in that directory.
