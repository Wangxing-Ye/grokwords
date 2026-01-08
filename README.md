# GrokWords

GrokWords is a React + TypeScript + Vite app that helps you “grok” English vocabulary with xAI’s models. It ships with ~10k CEFR-tagged words, stores your progress locally (IndexedDB), and can auto-generate examples, images, and live voice practice.

## Features
- Word list: loads from `public/words/ENGLISH_CERF_WORDS_EXTENDED.csv` with CEFR levels; includes most TOEFL and IELTS words.
- Grok details: fetch POS, phonetic, definition, and translation via xAI chat API.
- Auto examples: generates English + native translation + keyword hints; shows a spinner while generating.
- Images: one-click illustration generation; regenerate and download (note: images available ~24h).
- Voice: connect, speak, and practice with Grok Voice Agent; shows connection/status messages.
- Progress & rewards: medal modal with totals, percentage to 1000, and reward milestones (100 and 1,000 words); grokked-at timestamps stored.
- Storage: words and updates are saved to IndexedDB; settings in `localStorage`.

## Prerequisites
- Node.js 18+
- An xAI API key

## Setup
```bash
npm install
```

## Run
```bash
npm run dev      # start locally
npm run build    # type-check + build
npm run preview  # preview the prod build
npm run lint     # eslint
```

## Usage
1) Open the app and set your **xAI API key** and **native language** in Settings (English is disallowed as the native language for translations).  
2) Select a word and click **Grok** to fetch POS/definition/translation. The app auto-generates an example and keywords.  
3) Generate an **image** for the word; you can regenerate or download it (download within 24h).  
4) Use the **voice** modal to practice speaking.  
5) Open **Rewards** (medal icon) to view total grokked words, progress to 1000, date counts, and reward milestones.

## Data
- Source list: `public/words/ENGLISH_CERF_WORDS_EXTENDED.csv` (most TOEFL/IELTS words included)
- Local persistence: IndexedDB (`words` store) for word data and timestamps; `localStorage` for settings.

## Next Steps
- Continue building with xAI upcoming TTS and Video Generation API.
