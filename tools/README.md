# Bot Training, Step by Step

Train the game's bot weights on your own computer, in the background, with no
browser tab open. Three commands: **setup** (once), **train**, **confirm**.

Everything below is typed into a terminal, from the repo folder
(the folder containing `index.html`).

---

## 0. What you need installed

- **Node.js 18 or newer** — check with `node --version`. If that fails,
  install from https://nodejs.org (the LTS button).
- **Git** — you already have this if you have the repo cloned.

## 1. Get this branch (until it's merged)

```bash
git fetch origin
git checkout claude/bot-strategy-search-tree-sei0k1
```

## 2. One-time setup (~1 minute + a browser download)

```bash
npm run arena:setup
```

This installs the Playwright library and downloads the Chromium browser the
runner drives (a few hundred MB, one time only).

## 3. Quick test (~1–2 minutes)

```bash
npm run arena:test
```

You should see two bot-vs-bot games play out, ending with a line like:

```
[runner] 2 game(s) in 41.3s (20.6s/game)
```

If you see that, everything works. (Note the s/game number — it tells you how
long training will take on your machine.)

## 4. Train

```bash
npm run arena:train
```

Runs 4 parallel invisible browsers, each evolving bot weights independently
(~45 games each, roughly 15–30 minutes depending on your machine). Progress
prints as it goes. For a serious overnight-style run instead:

```bash
npm run arena:train-big
```

(6 browsers × ~240 games each. Rough estimate: your s/game from step 3 × 240.)

Your computer stays usable the whole time — nothing visible opens.

## 5. Confirm (~5–10 minutes)

```bash
npm run arena:confirm
```

This takes the champions from your latest training run, plays them off
against each other, then plays the winner against your **current** bot
weights. Two possible endings:

- **`CONFIRMED`** — the new weights are genuinely better. The output tells
  you exactly what to do: open `tools/.cache/apply-champion.txt`, copy the
  one line inside it, paste it into the game's browser console (open the
  game, press F12 → Console), press Enter, reload. Done — the bot now uses
  the new weights on that browser.
- **`NOT confirmed`** — the training run didn't beat what you already have.
  That's the safety gate working, not an error. Keep your current weights
  and try a bigger training run.

---

## Extras

- Watch it play: add `--headed` to any command's underlying script, e.g.
  `node tools/arena-headless.mjs --games 2 --headed`
- All knobs (`--shards`, `--generations`, `--confirm-games`, …) are listed at
  the top of `tools/arena-headless.mjs`.
- Results/champions accumulate in `tools/.cache/` (not committed to git).
- To make confirmed weights permanent for every player (not just your
  browser), paste the champion table from `tools/.cache/champion-*.json`
  into `DEFAULT_WEIGHTS` in `js/bot.js` and commit.
