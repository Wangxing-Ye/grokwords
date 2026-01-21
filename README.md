# GrokWords
Grok 10,000 English Words with xAI

![GrokWords favicon](/public/favicon-96x96.png)

GrokWords is an education project that helps you “grok” English vocabulary with xAI’s models. 

It ships with ~11k words across CEFR levels, TOEFL & IELTS, and can generate definition, examples, images, and live voice practice with Grok.

## Demo
Words Selection: Level 1 (Basic), Level 2 (Intermediate), Level 3 (Advanced), TOEFL and IELTS
![GrokWords UI](/public/demo/screenshot1.png)

<p style="display: flex; gap: 8px; flex-wrap: wrap;">
  <img src="/public/demo/abandon.jpeg" alt="Abandon sample" width="24%" />
  <img src="/public/demo/grok.jpeg" alt="Grok sample" width="24%" />
  <img src="/public/demo/rabbit.jpeg" alt="Rabbit sample" width="24%" />
  <img src="/public/demo/zipper.jpeg" alt="Zipper sample" width="24%" />
</p>

Talk to Grok in voice to practice vocab
![Dialogue Practice](/public/demo/dialogue-practice.png)

## Words: CEFR | IELTS | TOEFL
English Words Number: **11406**

CEFR divides English proficiency into six levels: A1 to C2. In this project they are grouped into three broad categories:
- A1–A2: Level 1 (Basic)
- B1–B2: Level 2 (Intermediate)
- C1–C2: Level 3 (Advanced)


| CEFR Level | IELTS Band | TOEFL iBT (approx.) |
| ---------- | ---------- | ------------------- |
| A1         | 2.0–3.5    | N/A                 |
| A2         | 4.0        | N/A–41              |
| B1         | 4.5–5.0    | 42–71               |
| B2         | 5.5–6.5    | 72–94               |
| C1         | 7.0–8.0    | 95–120              |
| C2         | 8.5–9.0    | 114+                |

## Ebbinghaus
- Ebbinghaus turned memory from a mysterious philosophical topic into a measurable, predictable phenomenon. 
- Golden review points: Day 0, 1, 3, 7, 15, 30 aligned with the forgetting curve.

## xAI API
Note: Each user needs their own xAI API key to run this project (frontend-only; no backend; no user data is saved).
- Get an API key: https://accounts.x.ai/sign-in?redirect=cloud-console
- Purchase API credits
- API Docs:
  - Chat Responses: https://docs.x.ai/docs/guides/chat
  - Image Generation: https://docs.x.ai/docs/guides/image-generations
  - Grok Voice Agent: https://docs.x.ai/docs/guides/voice/agent

## Features
- Word list: loads from `public/words/ENGLISH_CERF_WORDS_EXTENDED.csv` with CEFR levels and TOEFL & IELTS tags.
- Ebbinghaus-based review schedule with golden review points.
- Grok details: fetch POS, phonetic, definition, and translation via xAI chat API.
- Native language support for translations: العربية (Arabic), বাংলা (Bengali), 简体中文 (Simplified Chinese), 繁體中文 (Traditional Chinese), Français (French), Deutsch (German), हिंदी (Hindi), Bahasa Indonesia (Indonesian), Italiano (Italian), 日本語 (Japanese), 한국어 (Korean), Bahasa Melayu (Malay), Português (Portuguese), فارسی (Persian / Iranian), Русский (Russian), Español (Spanish), ไทย (Thai), Türkçe (Turkish), Tiếng Việt (Vietnamese).
- Auto examples: generates English + native translation + keyword hints; shows a spinner while generating.
- Images: one-click illustration generation; regenerate and download (note: images available ~24h).
- Voice: connect, speak, and practice with Grok Voice Agent; shows connection/status messages.
- No backend: This project only has the front end and does not include a backend.
- Storage: settings, words and updates are saved locally.

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
4) Use the **voice** button to practice speaking with Grok voice agent.  
5) Tap the **Review** icon (face) to view your Ebbinghaus spaced repetition schedule with the golden review points.

## Next Steps
- Continue building with xAI upcoming TTS and Video Generation API.
- Design a token incentive program.

## License

Copyright © 2026 Wilson Ye

This project is licensed under the terms of the [MIT License](LICENSE).