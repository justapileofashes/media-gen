import { describe, it, expect } from "vitest";
import { buildHarness } from "../../src/render/harness.js";

describe("buildHarness", () => {
  it("embeds user code, canvas size, and __renderFrame", () => {
    const html = buildHarness("function draw(ctx,t){ctx.fillRect(0,0,10,10)}", 640, 360);
    expect(html).toContain('id="c"');
    expect(html).toContain('width="640"');
    expect(html).toContain('height="360"');
    expect(html).toContain("__renderFrame");
    expect(html).toContain("ctx.fillRect(0,0,10,10)");
  });

  it("does not interpolate user code into a string literal (no escaping bugs)", () => {
    const html = buildHarness('const s = "</script>"; function draw(ctx,t){}', 64, 64);
    // user code must be safely embedded; a raw </script> would truncate the script tag
    expect(html).toContain("<\\/script>");
  });

  it("escapes end-tag variants with whitespace or slash", () => {
    const html = buildHarness('const a = "</script >"; const b = "</SCRIPT\t>"; function draw(ctx,t){}', 64, 64);
    expect(html).toContain("<\\/script");
    expect(html).toContain("__renderFrame");
  });
});
