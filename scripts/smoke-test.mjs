// E2E + safety smoke test: drives dist/index.js over real MCP stdio as a client.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

function textOf(res) {
  return (res.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
}
function savedPath(res) {
  const m = textOf(res).match(/Saved: (.+?) \(/);
  return m ? m[1] : undefined;
}

async function connect(extraEnv) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/index.js"],
    env: { ...getDefaultEnvironment(), ...extraEnv },
    stderr: "pipe"
  });
  const client = new Client({ name: "smoke", version: "0.0.0" });
  let stderrBuf = "";
  const p = client.connect(transport);
  transport.stderr?.on("data", (d) => { stderrBuf += d.toString(); });
  await p;
  return { client, getStderr: () => stderrBuf };
}

const outA = await fs.mkdtemp(path.join(os.tmpdir(), "media-gen-smoke-"));

// ---------- Server A: no keys ----------
{
  const { client } = await connect({ MEDIA_OUTPUT_DIR: outA });

  const tools = (await client.listTools()).tools.map((t) => t.name).sort();
  check("A1 no-key tool set", JSON.stringify(tools) === JSON.stringify(["list_providers", "render_image", "render_video"]), tools.join(","));

  // A2: real SVG render
  const svg = await client.callTool({
    name: "render_image",
    arguments: {
      source: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#fff"/><circle cx="100" cy="100" r="80" fill="#2563eb"/></svg>`,
      width: 400, height: 400, filename: "blue-circle"
    }
  });
  const svgPath = savedPath(svg);
  const svgOk = !svg.isError && svgPath && (await fs.stat(svgPath)).size > 500;
  check("A2 render_image SVG produces real PNG", !!svgOk, svgPath ?? "no path");
  check("A2b inline image block returned (feedback loop)", (svg.content ?? []).some((b) => b.type === "image" && b.mimeType === "image/png"));

  // A3: HTML render with hostile external resources — must finish fast, network blocked
  const t0 = Date.now();
  const html = await client.callTool({
    name: "render_image",
    arguments: {
      source: `<html><body style="background:#111;color:#fff"><h1>contained</h1>
        <img src="https://example.com/x.png">
        <script>fetch("https://example.com/api").catch(()=>{}); try { new WebSocket("wss://example.com/ws"); } catch (e) {}</script>
        </body></html>`,
      format: "html", width: 300, height: 200
    }
  });
  const htmlMs = Date.now() - t0;
  const htmlPath = savedPath(html);
  check("A3 html render with external fetch/img/WebSocket completes (egress blocked)", !html.isError && htmlMs < 20000 && !!htmlPath, `${htmlMs}ms`);

  // A4: filename path traversal stays inside output dir
  const trav = await client.callTool({
    name: "render_image",
    arguments: { source: `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>`, filename: "..\\..\\..\\evil" , width: 32, height: 32 }
  });
  const travPath = savedPath(trav);
  const travOk = !trav.isError && travPath && path.resolve(travPath).toLowerCase().startsWith(path.resolve(outA).toLowerCase());
  check("A4 path traversal filename confined to output dir", !!travOk, travPath ?? "no path");

  // A5: oversized dimensions rejected by schema
  let a5ok = false, a5detail = "";
  try {
    const big = await client.callTool({ name: "render_image", arguments: { source: "<svg xmlns='http://www.w3.org/2000/svg'/>", width: 5000, height: 100 } });
    a5ok = big.isError === true; a5detail = "tool isError";
  } catch (e) {
    a5ok = true; a5detail = "protocol-level validation error";
  }
  check("A5 width 5000 rejected", a5ok, a5detail);

  // A6: invalid SVG -> isError, no crash, no orphan zero-byte file leak
  const bad = await client.callTool({ name: "render_image", arguments: { source: "not svg at all", filename: "bad-one" } });
  const entries = await fs.readdir(outA);
  let zeroLeak = false;
  for (const f of entries) if ((await fs.stat(path.join(outA, f))).size === 0) zeroLeak = true;
  check("A6 invalid SVG -> isError, no zero-byte orphan", bad.isError === true && !zeroLeak, `dir: ${entries.length} files`);

  // A7: real video render (1s @ 24fps)
  const vid = await client.callTool(
    {
      name: "render_video",
      arguments: {
        draw_code: `function draw(ctx, t) {
          ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 160, 120);
          ctx.fillStyle = "#0f0";
          ctx.beginPath(); ctx.arc(20 + t * 120, 60 + Math.sin(t * 6.28) * 30, 10, 0, 6.28); ctx.fill();
        }`,
        duration_seconds: 1, fps: 24, width: 160, height: 120, filename: "bounce"
      }
    },
    undefined,
    { resetTimeoutOnProgress: true, maxTotalTimeout: 180000 }
  );
  const vidText = textOf(vid);
  const vidPath = savedPath(vid);
  let vidOk = false, magic = "";
  if (!vid.isError && vidPath) {
    const buf = await fs.readFile(vidPath);
    magic = buf.subarray(4, 8).toString();
    vidOk = magic === "ftyp" && buf.length > 1000 && vidText.includes("24 frames");
  }
  check("A7 render_video produces playable MP4", vidOk, `${vidPath ?? "no path"} magic=${magic}`);
  check("A7b sample frames returned inline", (vid.content ?? []).filter((b) => b.type === "image").length >= 3);

  // A8: draw() error surfaces cleanly with frame context
  const badVid = await client.callTool({
    name: "render_video",
    arguments: { draw_code: `function draw(ctx, t) { if (t > 0.2) throw new Error("boom"); ctx.fillRect(0,0,1,1); }`, duration_seconds: 1, fps: 24, width: 64, height: 64 }
  }, undefined, { resetTimeoutOnProgress: true, maxTotalTimeout: 120000 });
  check("A8 draw() error -> isError with frame context", badVid.isError === true && /frame \d+/.test(textOf(badVid)) && /boom/.test(textOf(badVid)));

  // A9: zero-key list_providers gives setup instructions, no key values anywhere
  const lp = await client.callTool({ name: "list_providers", arguments: {} });
  check("A9 list_providers zero-key setup text", /OPENAI_API_KEY/.test(textOf(lp)) && /FAL_KEY/.test(textOf(lp)));

  await client.close();
}

// ---------- Server B: fake FAL key (key-hygiene probes) ----------
{
  const FAKE = "fal-FAKESECRET-xyz123";
  const outB = await fs.mkdtemp(path.join(os.tmpdir(), "media-gen-smokeB-"));
  const { client, getStderr } = await connect({ MEDIA_OUTPUT_DIR: outB, FAL_KEY: FAKE });

  const tools = (await client.listTools()).tools.map((t) => t.name);
  check("B1 generate_* registered when key present", tools.includes("generate_image") && tools.includes("generate_video"), tools.join(","));

  const lp = await client.callTool({ name: "list_providers", arguments: {} });
  check("B2 list_providers names fal, never the key value", /fal/.test(textOf(lp)) && !textOf(lp).includes("FAKESECRET"));

  // B3: real call with fake key -> auth error; key must not leak into the error
  const gen = await client.callTool(
    { name: "generate_image", arguments: { prompt: "a lighthouse at dusk" } },
    undefined, { maxTotalTimeout: 60000 }
  );
  const genText = textOf(gen);
  check("B3 fake-key generate_image errors WITHOUT leaking key", gen.isError === true && !genText.includes("FAKESECRET"), genText.slice(0, 120).replace(/\r?\n/g, " "));

  const stderrText = getStderr();
  check("B4 startup stderr names provider, never key value", /providers: fal/.test(stderrText) && !stderrText.includes("FAKESECRET"), stderrText.trim().slice(0, 100));

  await client.close();
}

const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} checks passed${fails ? ` — ${fails} FAILED` : ""}`);
process.exit(fails ? 1 : 0);
