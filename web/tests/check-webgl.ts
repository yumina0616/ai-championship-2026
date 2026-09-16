import { chromium, type FullConfig } from "@playwright/test";

// glxinfo뿐 아니라 실제 테스트 Chromium의 WebGL 드라이버/출력도 확인합니다.
export default async function checkWebGL(config: FullConfig) {
  const { headless, launchOptions } = config.projects[0].use;
  const browser = await chromium.launch({ ...launchOptions, headless });
  try {
    const page = await browser.newPage();
    const result = await page.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      if (!gl)
        throw new Error("CI Chromium에서 WebGL2를 초기화할 수 없습니다.");
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      const renderer = gl.getParameter(
        debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER,
      );
      gl.clearColor(1, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const pixel = new Uint8Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return { renderer, pixel: Array.from(pixel) };
    });
    console.log("CI WebGL preflight:", result);
    if (
      !/llvmpipe/i.test(result.renderer) ||
      result.pixel.join() !== "255,0,0,255"
    )
      throw new Error("Mesa llvmpipe WebGL2 렌더링 검증에 실패했습니다.");
  } finally {
    await browser.close();
  }
}
