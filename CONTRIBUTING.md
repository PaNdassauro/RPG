# Contributing

Thanks for your interest in contributing! This project is a browser-only AI Dungeon Master app, and contributions of all kinds are welcome — bug reports, feature ideas, code, translations, and playtesting feedback.

## Getting started

```bash
git clone git@github.com:PaNdassauro/RPG.git
cd RPG
npm install
npm run dev
```

To try the AI DM you'll need your own API key (Anthropic or OpenAI), or a local [Ollama](https://ollama.com) instance — configure it in **Settings** inside the app. Keys are stored only in your browser.

## How to contribute

- **Bugs and ideas:** open a [GitHub Issue](https://github.com/PaNdassauro/RPG/issues). For bugs, include steps to reproduce and browser/OS info.
- **Code:** fork the repo and open a pull request **against the `dev` branch**. `main` is the production branch; changes land in `dev` first.
- Keep PRs focused — one change per PR is easier to review and merge.

## Code guidelines

- TypeScript with strict typing — avoid `any`.
- Validate external input (LLM responses, imported data) with Zod schemas before processing.
- Keep files small and modular; extract utilities when a file grows large.
- Run `npm run lint` (type-check) before opening a PR and make sure `npm run build` passes.
- Match the style of the surrounding code.

## A note on game content

The D&D 5e data in `src/data/srd/` is Open Game Content from the SRD 5.1, used under the OGL 1.0a. Contributions touching that directory must stay within SRD 5.1 content and preserve the attribution and license files. Do not add content from other Wizards of the Coast books.

## Translations

The app is bilingual (English / Brazilian Portuguese). Locale files live in `src/i18n/locales/`. Fixes and improvements to translations are very welcome.
