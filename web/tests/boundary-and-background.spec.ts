import { expect, test } from "@playwright/test";
import { footprintOutOfBounds, ParkingEngine } from "../../engine/src/index";
import { makeScenario } from "../src/scenario";
import { boundaryCurbs, outsideDrivingArea } from "../src/scene-boundary";

test("프리셋·비대칭 커스텀 맵의 네 연석 안쪽 면은 실제 경계와 같다", () => {
  for (const bounds of [makeScenario("open").bounds, {minX:-14,maxX:7,minY:-9,maxY:3}]) {
    const [west,east,north,south] = boundaryCurbs(bounds);
    expect(west.position[0] + west.size[0]/2).toBeCloseTo(bounds.minX,10);
    expect(east.position[0] - east.size[0]/2).toBeCloseTo(bounds.maxX,10);
    expect(north.position[2] + north.size[2]/2).toBeCloseTo(-bounds.maxY,10);
    expect(south.position[2] - south.size[2]/2).toBeCloseTo(-bounds.minY,10);
  }
});

test("네 방향 모두 연석 1mm 앞은 정상, 1mm 넘으면 경계 이탈이다", () => {
  const scenario = makeScenario("open"), b = scenario.bounds;
  const overhang = scenario.vehicle.wheelbaseM + scenario.vehicle.frontOverhangM;
  for (const [x,y,yaw] of [
    [b.maxX-overhang-.001, -1, 0], [b.minX+overhang+.001, -1, Math.PI],
    [0,b.maxY-overhang-.001,Math.PI/2], [0,b.minY+overhang+.001,-Math.PI/2],
  ]) {
    const pose = {xM:x,yM:y,yawRad:yaw};
    expect(footprintOutOfBounds(pose,scenario.vehicle,b)).toBe(false);
    expect(footprintOutOfBounds({...pose,xM:x+.002*Math.cos(yaw),yM:y+.002*Math.sin(yaw)},scenario.vehicle,b)).toBe(true);
  }
});

test("직진 경계 종료를 장애물 접촉과 구별하되 엔진 collision 계약을 유지한다", () => {
  const scenario = makeScenario("open"), engine = new ParkingEngine();
  engine.reset(scenario);
  let result = engine.step({targetSpeedMps:1.5,targetSteeringRad:0});
  for (let i=0; i<200 && !result.outcome.terminated; i++) result=engine.step({targetSpeedMps:1.5,targetSteeringRad:0});
  expect(result.outcome.reason).toBe("collision");
  expect(outsideDrivingArea(result,scenario)).toBe(true);
  expect(result.poseTruth.xM + 3.5).toBeGreaterThan(scenario.bounds.maxX);
  expect(result.poseTruth.xM + 3.5).toBeLessThan(scenario.bounds.maxX + .076);
});

test("하나의 배경이 섹션 사이에서 유지되고 구분선과 입력은 남는다", async ({page}) => {
  await page.addInitScript(() => localStorage.setItem("parkside-quality","low"));
  await page.goto("/#garage");
  const backdrop = page.locator(".continuous-backdrop");
  await expect(backdrop).toHaveCount(1);
  await expect(backdrop).toHaveCSS("position","fixed");
  await expect(backdrop).toHaveCSS("pointer-events","none");
  await expect(backdrop).toHaveAttribute("data-kind","scroll-brand-film");
  const node = await backdrop.elementHandle();
  for (const selector of [".design-manifesto","#garage","#experiment",".sensor-lab",".end-drive"]) {
    const section = page.locator(selector);
    await section.scrollIntoViewIfNeeded();
    await expect(section).toHaveCSS("background-color","rgba(0, 0, 0, 0)");
    await expect(section).toHaveCSS("background-image","none");
    expect(await node!.evaluate(el => el.isConnected)).toBe(true);
    await expect(section.locator(".signal-field")).toHaveCount(0);
  }
  expect(await page.locator("#garage").evaluate(el => getComputedStyle(el,"::after").height)).toBe("1px");
  await expect(backdrop).toHaveAttribute("data-ready","true");
  await expect.poll(() => backdrop.locator("video").evaluate(el => (el as HTMLVideoElement).currentTime)).toBeGreaterThan(1);
  const lateTime = await backdrop.locator("video").evaluate(el => (el as HTMLVideoElement).currentTime);
  await page.locator("#garage").scrollIntoViewIfNeeded();
  await expect.poll(() => backdrop.locator("video").evaluate(el => (el as HTMLVideoElement).currentTime)).toBeLessThan(lateTime - .2);
  await page.getByRole("link",{name:"내 주차장으로 돌아가기"}).click();
  await page.getByRole("button",{name:"직접 운전하기",exact:true}).click();
  await expect(page.getByRole("button",{name:"D 기어"})).toBeEnabled();
  await expect(backdrop).toHaveCount(0);
});

test("영상 배경에서도 제목·본문을 읽을 수 있고 모바일 가로 넘침이 없다", async ({page}) => {
  await page.addInitScript(() => localStorage.setItem("parkside-quality","low"));
  await page.goto("/#experiment");
  for (const width of [1440,390]) {
    await page.setViewportSize({width,height:900});
    await page.locator(".experiment-copy").scrollIntoViewIfNeeded();
    await expect(page.locator(".experiment-copy h2")).toHaveCSS("color","rgb(245, 248, 250)");
    await expect(page.locator(".experiment-copy > p").first()).toHaveCSS("color","rgb(215, 224, 231)");
    for (const copy of [".experiment-copy",".lab-copy",".manifesto-detail",".section-heading"]) {
      expect(await page.locator(copy).evaluate(el => getComputedStyle(el,"::before").content)).toBe("none");
    }
    const shade = await page.locator(".film-scrim").evaluate(el => getComputedStyle(el).backgroundImage);
    expect(shade).toContain("linear-gradient");
    expect(shade).not.toContain("radial-gradient");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({path:test.info().outputPath(`scroll-film-${width}.png`)});
  }
});

test("동작 줄이기는 배경 영상을 요청하지 않으며 영상 오류도 포스터로 복구한다", async ({page}) => {
  const requests: string[]=[];
  page.on("request",r => { if (r.url().includes("parking-scroll-film")) requests.push(r.url()); });
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/#experiment");
  const backdrop=page.locator(".continuous-backdrop");
  await expect(backdrop).toHaveAttribute("data-motion","paused");
  await expect(backdrop.locator("video")).not.toHaveAttribute("src");
  expect(requests).toEqual([]);
  await page.route("**/art/parking-scroll-film.mp4",r => r.abort());
  await page.emulateMedia({reducedMotion:"no-preference"});
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  await expect(backdrop).toHaveAttribute("data-ready","false");
  await expect(backdrop.locator("img")).toBeVisible();
  await expect(page.getByRole("button",{name:"미스터팍 주행 보기"})).toBeEnabled();
});

test("바깥 연석으로 직진한 결과는 주행 경계 이탈로 안내한다", async ({page}) => {
  test.setTimeout(60000);
  await page.addInitScript(() => localStorage.setItem("parkside-quality","low"));
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/");
  await page.getByRole("button",{name:"바로 운전하기"}).click();
  await page.getByRole("button",{name:"D 기어"}).click();
  await page.keyboard.down("ArrowUp");
  await expect(page.getByText("주행 경계 이탈",{exact:true})).toBeVisible({timeout:30000});
  await page.keyboard.up("ArrowUp");
  await expect(page.getByText("차체가 바깥 연석의 안쪽 경계를 넘었어요.",{exact:false})).toBeVisible();
});
