# media-gen

An MCP server for Claude Code with two paths to media: a free, Claude-authored
rendering path (SVG/HTML → image, canvas animation → video) that needs no API
keys, and an optional bring-your-own-key (BYOK) path for photorealistic
image/video generation via OpenAI, Gemini, or fal.ai.

## What it is

`render_image` and `render_video` take content *you* author — SVG markup,
an HTML document, or a JavaScript `draw(ctx, t, frame)` function — and turn
it into a PNG/JPEG/WebP or MP4 on disk, using a headless, network-blocked
Chromium and ffmpeg. These always work, cost nothing, and are ideal for
diagrams, charts, UI mockups, and motion graphics. They are not
photorealistic — they render exactly what you draw.

`generate_image` and `generate_video` call out to a real image/video model
(gpt-image-1/Sora, Imagen/Veo, or FLUX/Kling) to produce photorealistic
media from a text prompt. These only appear as tools when you've configured
at least one provider key, and each call costs real money on your account.

`list_providers` reports which BYOK providers are configured and what
models/capabilities each exposes.

## Setup

```bash
npm install
npx playwright install chromium
npm run build
```

This installs dependencies, downloads the headless Chromium build used for
SVG/HTML rendering, and compiles TypeScript to `dist/`.

## Connecting to Claude Code

A `.mcp.json` is already checked into the repo root, so Claude Code will
pick it up automatically when you run it from this project directory:

```json
{
  "mcpServers": {
    "media-gen": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "MEDIA_OUTPUT_DIR": "${MEDIA_OUTPUT_DIR}",
        "OPENAI_API_KEY": "${OPENAI_API_KEY}",
        "GEMINI_API_KEY": "${GEMINI_API_KEY}",
        "FAL_KEY": "${FAL_KEY}"
      }
    }
  }
}
```

Alternatively, register it manually from any directory:

```bash
claude mcp add media-gen -- node <absolute-path-to>\dist\index.js
```

Approve the server when Claude Code prompts you, then run `claude mcp list`
to confirm `media-gen` shows as connected.

## BYOK keys

All keys are optional and read from the environment only — they are never
written to disk, logged, or echoed back in tool output or the startup
message (which prints provider *names*, never values).

| Env var | Enables |
|---|---|
| `OPENAI_API_KEY` | `generate_image` via gpt-image-1, `generate_video` via Sora |
| `GEMINI_API_KEY` | `generate_image` via Imagen 4, `generate_video` via Veo 3 |
| `FAL_KEY` | `generate_image` via FLUX, `generate_video` via Kling |

With no keys set, only the free `render_image`/`render_video`/`list_providers`
tools are registered; `generate_image`/`generate_video` don't appear until at
least one key is present. Set keys in `.mcp.json`'s `env` block (they expand
from your shell environment) or via `claude mcp add ... -e KEY=value`.

## Tool reference

| Tool | Purpose | Key params |
|---|---|---|
| `render_image` | Render SVG or HTML you author to an image file | `source`, `format` (svg/html), `width`, `height`, `output_format` (png/jpeg/webp) |
| `render_video` | Render an MP4 from a JS canvas `draw(ctx, t, frame)` function | `draw_code`, `duration_seconds`, `fps`, `width`, `height` |
| `generate_image` | Photoreal image from a text prompt (BYOK) | `prompt`, `provider`, `model`, `aspect_ratio`, `num_images` |
| `generate_video` | Photoreal video from a text prompt (BYOK) | `prompt`, `provider`, `model`, `duration_seconds`, `aspect_ratio` |
| `list_providers` | List configured BYOK providers and their models | none |

## Manual E2E check

Free (no keys needed) — try these prompts in a Claude Code session:
- "render an SVG diagram of a login flow as an image"
- "render a 3-second bouncing ball video"

Paid (uses your configured key, costs real money):
- "generate a photo of a lighthouse (uses your key)"

Confirm the output file appears under `generated-media/` and that Claude
describes seeing the returned image inline.

## Limits

- `render_video`: duration ≤ 60s, frame budget < 3600 frames, resolution ≤ 1080p.
- `render_image`: width/height ≤ 4096px per side.
- `generate_video` (BYOK): polling caps out after 10 minutes per provider job.
- Rendered (`render_*`) output is never photorealistic — for photoreal
  results you need `generate_*` with a configured provider key.
