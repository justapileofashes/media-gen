export function buildHarness(drawCode: string, width: number, height: number): string {
  // Escape </script> so user code cannot terminate the script block.
  const safe = drawCode.replace(/<\/script(?=[\s/>]|$)/gi, "<\\/script");
  return `<!DOCTYPE html>
<html>
<head><style>html,body{margin:0;padding:0;background:#000}</style></head>
<body>
<canvas id="c" width="${width}" height="${height}"></canvas>
<script>
"use strict";
const __canvas = document.getElementById("c");
const __ctx = __canvas.getContext("2d");
let __setupDone = false;
${safe}
window.__renderFrame = function (t, frame) {
  try {
    if (!__setupDone) {
      if (typeof setup === "function") setup(__ctx);
      __setupDone = true;
    }
    __ctx.save();
    draw(__ctx, t, frame);
    __ctx.restore();
    return null;
  } catch (e) {
    return String(e && e.stack ? e.stack : e);
  }
};
</script>
</body>
</html>`;
}
