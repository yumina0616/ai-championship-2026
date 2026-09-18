import {expect,test} from "@playwright/test";

for (const gear of ["D","R"]) test(`고화질 ${gear} 직진 종료 지점 확인`,async ({page})=>{
  test.setTimeout(120000);
  await page.setViewportSize({width:1100,height:800});
  await page.addInitScript(()=>localStorage.setItem("parkside-quality","high"));
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/#garage");
  await expect(page.locator(".world-stage canvas")).toHaveAttribute("data-vehicle-asset","detailed",{timeout:45000});
  await page.getByRole("button",{name:"직접 운전하기",exact:true}).click();
  await page.getByRole("button",{name:"탑뷰",exact:true}).click();
  await page.getByRole("button",{name:`${gear} 기어`}).click();
  await page.keyboard.down(gear==="D"?"ArrowUp":"ArrowDown");
  // 소프트웨어 GPU에서도 후진의 약 8초 simulation time을 실제로 진행시킨다.
  await expect(page.getByText("주행 경계 이탈",{exact:true})).toBeVisible({timeout:60000});
  await page.keyboard.up(gear==="D"?"ArrowUp":"ArrowDown");
  await page.addStyleTag({content:".stage-overlay{visibility:hidden!important}.sensor-panel,.parking-check{visibility:hidden!important}"});
  await page.screenshot({path:test.info().outputPath(`collision-${gear}.png`)});
});
