# RPG — AI Dungeon Master

A browser-based tabletop RPG app with an AI Dungeon Master, built on the D&D 5e SRD. Everything runs client-side: your campaigns, characters, and API keys are stored locally in your browser (IndexedDB) — there is no backend.

## Features

- AI Dungeon Master powered by your own LLM provider: Anthropic, OpenAI, or local Ollama
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

Open the app, go to **Settings**, and add an API key for Anthropic or OpenAI — or point it at a local [Ollama](https://ollama.com) instance (default `http://localhost:11434`).

Other scripts:

```bash
npm run build    # type-check and build for production
npm run preview  # preview the production build
npm run lint     # type-check only
```

## License

Code is licensed under the [MIT License](LICENSE).

D&D 5e SRD content in `src/data/srd/` is Open Game Content from the System Reference Document 5.1, © Wizards of the Coast, used under the Open Game License v1.0a — see [src/data/srd/ATTRIBUTION.md](src/data/srd/ATTRIBUTION.md) and the OGL license text in that directory.
