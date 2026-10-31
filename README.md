# Steganogram — hide messages inside images

[![Made with pollinations.ai](https://raw.githubusercontent.com/pollinations/pollinations/main/packages/ui/src/brand/badge-made-with.svg)](https://pollinations.ai/?ref=badge)

Web app built for **POLLEN-QUEST [#18367](https://github.com/pollinations/pollinations/issues/18367)**: hide a secret message
inside a picture that looks completely ordinary, then reveal it only when you know to look.

- **Hide:** your secret → a Pollinations **LLM** turns it into an innocent cover prompt → a Pollinations
  **image model** renders the cover → the message is embedded into the pixels (LSB steganography) entirely
  in your browser → download PNG.
- **Reveal:** drop any image, the embedded message is read back out (LSB extraction).
- **Pay with your own Pollen:** in *Own Pollen* mode you enter your own `sk_`/`pk_` key — every AI request is
  billed to *your* wallet. Classic mode works for free, rate-limited, without a key.

No build step: open `index.html` (or `npx serve .`) — everything runs client-side.
Supports the [BRING_YOUR_OWN_POLLEN](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md)
flow: point the app at the gen API with a publishable key to let *your users* pay with their own Pollen.

## How it meets the quest

| Requirement | Where |
|---|---|
| Messages hidden in images | LSB steganography, `app.js` (`lsbEmbed`/`lsbExtract`), zero server, in-browser |
| Built on a Pollinations LLM | LLM crafts the cover prompt; image model renders it (`llmInnocentPrompt`/`generateCover`) |
| Users pay with their own Pollen | Own Pollen mode: the user's own key bills their wallet; pk_ (publishable, `--earnings`) flow documented |

## Run

```bash
npx serve .                 # or simply open index.html in a browser
```

1. **Settings** → choose *Own Pollen* and paste your key (or leave Classic).
2. **Hide** → write the secret → *Generate cover with AI* (or upload your own image) → *Hide message in image* → *Download PNG*.
3. **Reveal** → open the downloaded PNG → *Reveal hidden message*.

## Verify the steganography core (Node)

```bash
node test-lsb.mjs
```

## Submit (app submission form)

1. Push this folder to a public GitHub repo (per the quest: "build it in your own public repository").
2. Host the live app (App URL) — e.g. GitHub Pages is enough.
3. Fill in <https://github.com/pollinations/pollinations/issues/new?template=app-submission.yml>:
   - **Quest:** `#18367`
   - **App Name:** Steganogram · **Category:** `image` (or `games`) · **Platform:** `web` · **Language:** `en`
   - **App URL:** live URL · **Repository:** your public repo · **Screenshot:** real screen, 16:9
4. Maintainer approves → quest closes → claim **7 Pollen** at <https://enter.pollinations.ai/quests>.

## Files

- `index.html` — UI (no dependencies)
- `app.js` — LSB core + Pollinations API calls (text: `/v1/chat/completions`, image: prompt endpoint)
- `test-lsb.mjs` — correctness test for embed/extract