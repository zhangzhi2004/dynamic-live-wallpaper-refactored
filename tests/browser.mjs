import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
const root=fileURLToPath(new URL('..',import.meta.url));
const require=createRequire(process.env.DESKLAND_TEST_PACKAGE||new URL('../package.json',import.meta.url));
const {chromium}=require('playwright');
const out=process.env.DESKLAND_TEST_OUTPUT||resolve(root,'../verification');await mkdir(out,{recursive:true});
const registry=JSON.parse(await readFile(resolve(root,'prototype/themes.json'),'utf8'));
assert.deepEqual(registry.themes.map(t=>t.id),['meadow','beach']);
const server=spawn(process.execPath,['prototype/serve.mjs'],{cwd:root,env:{...process.env,DESKLAND_PORT:'5191'},windowsHide:true,stdio:'pipe'});
const errors=[],checks=[];let browser;
try{
  await new Promise((ok,fail)=>{const timer=setTimeout(()=>fail(new Error('Server did not start')),10000);server.stdout.on('data',b=>{if(String(b).includes('http')){clearTimeout(timer);ok();}});server.on('exit',code=>fail(new Error('Server exited: '+code)));});
  browser=await chromium.launch({...(!process.env.DESKLAND_TEST_CHROMIUM?{channel:'msedge'}:{}),headless:true,args:['--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,locale:'zh-CN'});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const url='http://127.0.0.1:5191';
  const rectangles=[];for(let c=0;c<5;c++)for(let r=0;r<7;r++)rectangles.push([c*76+4,r*106+8,c*76+76,r*106+101]);
  for(const theme of registry.themes){
    const extras=theme.groups.find(g=>g.kind==='extras').params;
    await page.goto(`${url}/${theme.page}?preview=1`);
    await page.waitForFunction(()=>typeof SceneElements!=='undefined'&&SceneElements.inspect()&&typeof frameN!=='undefined'&&frameN>2,null,{timeout:30000});
    await page.evaluate(r=>window.postMessage(JSON.stringify({t:'icons',vis:true,r}),'*'),rectangles);
    await page.waitForTimeout(3700);
    const defaults=await page.evaluate(id=>SceneElements.defaults(id),theme.id);
    for(const p of extras)assert.equal(defaults[p.key],p.default,`${theme.id}: default mismatch for ${p.key}`);
    let report=await page.evaluate(()=>SceneElements.inspect());
    assert(Object.values(report.visible).some(n=>n>0),theme.id+': no new elements visible');
    for(const p of extras)assert.equal(report.requested[p.key],p.default);
    assert(report.actors.filter(a=>a.opacity>.1).every(a=>a.valid),theme.id+': visible object intersects invalid terrain or an icon');
    if(theme.id==='beach')await page.waitForFunction(()=>BeachWalker.inspect()?.visible&&BeachWalker.inspect().valid);
    const before=await page.evaluate(()=>{const s=desklandSnapshot(1);return s.canvas.toDataURL('image/png');});
    await writeFile(resolve(out,theme.id+'-elements.png'),Buffer.from(before.split(',')[1],'base64'));
    assert.equal(await page.evaluate(()=>gl.getError()),0,theme.id+': WebGL state was not restored');
    const alive=report.actors.find(a=>a.opacity>.5);
    await page.evaluate(([r,a])=>window.postMessage(JSON.stringify({t:'icons',vis:true,r:[...r,[a.x-37,a.y-44,a.x+37,a.y+44]]}),'*'),[rectangles,alive]);
    await page.waitForTimeout(3200);
    report=await page.evaluate(()=>SceneElements.inspect());
    assert(report.actors.filter(a=>a.opacity>.1).every(a=>a.valid),theme.id+': elements did not avoid the new icon');
    if(theme.id==='beach'){
      await page.waitForFunction(()=>BeachWalker.inspect()?.visible&&BeachWalker.inspect().valid);
      const beforeWalk=await page.evaluate(()=>BeachWalker.inspect());
      await page.waitForFunction(point=>{
        const walker=BeachWalker.inspect();
        return walker.visible&&walker.valid&&Math.hypot(walker.x-point.x,walker.y-point.y)>3;
      },beforeWalk);
      const walker=await page.evaluate(()=>BeachWalker.inspect());
      await page.evaluate(([r,w])=>window.postMessage(JSON.stringify({t:'icons',vis:true,r:[...r,[w.x-34,w.y-44,w.x+34,w.y+16]]}),'*'),[rectangles,walker]);
      await page.waitForFunction(w=>{
        const next=BeachWalker.inspect();
        return next.visible&&next.valid&&(Math.abs(next.x-w.x)>38||next.y<w.y-48||next.y>w.y+20);
      },walker);
      await page.evaluate(()=>window.postMessage(JSON.stringify({t:'settings',v:{showWalker:0}}),'*'));
      await page.waitForFunction(()=>P.showWalker===0&&!BeachWalker.inspect()?.visible);
      await page.evaluate(()=>window.postMessage(JSON.stringify({t:'settings',v:{showWalker:1}}),'*'));
      await page.waitForFunction(()=>P.showWalker===1&&BeachWalker.inspect()?.visible);
      checks.push({beachWalker:'default visibility, walking, icon avoidance and show/hide',result:'pass'});
    }
    await page.evaluate(keys=>window.postMessage(JSON.stringify({t:'settings',v:Object.fromEntries(keys.map(k=>[k,0]))}),'*'),extras.map(p=>p.key));
    await page.waitForTimeout(150);
    const empty=await page.evaluate(()=>SceneElements.inspect());
    assert.equal(empty.actors.length+empty.traces.length,0,theme.id+': zero count left ghost elements or traces');
    const zero=await page.evaluate(()=>desklandSnapshot(1).canvas.toDataURL('image/png'));
    assert.notEqual(zero,before,theme.id+': element controls did not affect the exported scene');
    await page.evaluate(()=>window.postMessage(JSON.stringify({t:'reset'}),'*'));
    await page.waitForTimeout(1700);
    report=await page.evaluate(()=>SceneElements.inspect());
    for(const p of extras)assert.equal(report.requested[p.key],p.default,theme.id+': reset failed');
    await page.evaluate(()=>window.postMessage(JSON.stringify({t:'settings',v:{lighting:1}}),'*'));
    await page.waitForFunction(()=>P.lighting===1);
    await page.waitForTimeout(1600);
    const sunset=await page.evaluate(()=>desklandSnapshot(1).canvas.toDataURL('image/png'));
    await writeFile(resolve(out,theme.id+'-sunset.png'),Buffer.from(sunset.split(',')[1],'base64'));
    await page.evaluate(()=>window.postMessage(JSON.stringify({t:'settings',v:{lighting:2}}),'*'));
    await page.waitForFunction(()=>P.lighting===2);
    await page.waitForTimeout(2100);
    const moonlit=await page.evaluate(()=>{
      const {canvas}=desklandSnapshot(1);
      const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      let blue=0, red=0, count=0;
      const margin=Math.floor(canvas.width*0.42)*4;
      for(let y=20;y<canvas.height-20;y+=12) for(let x=margin;x<canvas.width*4-4;x+=48){
        const i=y*canvas.width*4+x;
        red+=data[i];blue+=data[i+2];count++;
      }
      return {data:canvas.toDataURL('image/png'), difference:(blue-red)/count};
    });
    assert(moonlit.difference>6,theme.id+': moonlight did not shade the open landscape');
    assert.equal(await page.evaluate(()=>gl.getError()),0,theme.id+': invalid night uniforms');
    await writeFile(resolve(out,theme.id+'-moonlit.png'),Buffer.from(moonlit.data.split(',')[1],'base64'));
    // Rendering must continue after both snapshots changed the canvas resolution.
    const f=await page.evaluate(()=>frameN);await page.waitForTimeout(150);assert((await page.evaluate(()=>frameN))>f);
    const motion=await page.evaluate(theme=>{
      const meadow=theme==='meadow';
      const canvas=document.createElement('canvas');canvas.width=canvas.height=4;
      const context=canvas.getContext('webgl2');
      let washed=false;
      const field=meadow?()=>180:x=>x-380;
      const env={theme,width:960,height:640,seed:90254,field,targetField:field,fieldToken:{},icons:[],
        tide:1,swashAt:()=>Number(washed),windPhase:()=>0,lighting:{dusk:0,night:0},
        params:{...Object.fromEntries(Object.keys(SceneElements.defaults(theme)).map(key=>[key,0])),
          ...(meadow?{rabbits:2}:{sailboats:2,turtles:2,crabs:3})}};
      let now=100;
      const step=()=>{
        SceneElements.render(context,{...env,now});now+=50;
        return SceneElements.inspect();
      };
      let report, jumping=false, resting=false, landed=false;
      for(let i=0;i<170;i++){
        const previous=report;
        report=step();
        if(meadow&&i>10){
          const a=report.actors[0], b=previous.actors[0];
          jumping ||= a.lift>0.35 && Math.hypot(a.x-b.x,a.y-b.y)>0.2;
          resting ||= a.lift===0 && b.lift===0 && a.x===b.x && a.y===b.y;
          landed ||= a.lift===0 && b.lift>0 && report.traces.some(mark=>mark.id===a.id&&mark.born===report.time);
        }
      }
      if(meadow)return {jumping,resting,landed};
      const findFresh=kind=>report.traces.findLast(mark=>mark.kind===kind&&report.time-mark.born<1);
      const wake=findFresh('sailboats'), turtle=findFresh('turtles'), print=findFresh('crabs');
      const match=({traces},mark)=>mark&&traces.find(m=>m.kind===mark.kind&&m.id===mark.id&&m.born===mark.born);
      washed=true;
      let next;
      for(let i=0;i<14;i++)next=step();
      const retained=match(next,wake);
      const actorForWake=({actors})=>wake&&actors.find(a=>a.kind===wake.kind&&a.id===wake.id);
      const boatBefore=actorForWake(report), boatAfter=actorForWake(next);
      const boatMoved=boatBefore&&boatAfter&&Math.hypot(boatAfter.x-boatBefore.x,boatAfter.y-boatBefore.y)>1;
      const fixed=boatMoved&&retained?.x===wake?.x&&retained?.y===wake?.y&&retained?.angle===wake?.angle;
      const eroded=!!print&&!match(next,print);
      if(wake){
        env.icons=[{x:wake.x-1,y:wake.y-1,w:2,h:2}];
        env.fieldToken={};
      }
      return {fixed,turtle:!!turtle,eroded,relayout:!!wake&&!match(step(),wake)};
    },theme.id);
    for(const [behavior,passed] of Object.entries(motion))assert(passed,theme.id+': motion check '+behavior);
    checks.push({theme:theme.id,extras:extras.map(p=>p.key),defaults:'pass',terrainAvoidance:'pass',zeroCount:'pass',reset:'pass',export:'pass',motion});
    console.log('PASS elements '+theme.id);
  }
  await page.goto(url+'/settings.html');await page.waitForSelector('html.ready');
  assert.equal(await page.locator('.theme').count(),2);
  assert.equal(await page.locator('[data-filter]').count(),0);
  await page.locator('[data-id="meadow"]').click();
  await page.waitForFunction(()=>document.querySelector('#preview').contentWindow.SceneElements?.inspect()?.requested.flowers!==undefined);
  assert.equal(await page.locator('[data-count]').count(),6);
  const start=+(await page.locator('[data-count="flowers"]').inputValue());
  await page.locator('[data-count-step="flowers"][data-delta="1"]').click();
  assert.equal(+(await page.locator('[data-count="flowers"]').inputValue()),start+1);
  await page.locator('[data-count-step="flowers"][data-delta="-1"]').click();
  assert.equal(+(await page.locator('[data-count="flowers"]').inputValue()),start);
  await page.locator('[data-count="rabbits"]').fill('0');await page.locator('[data-count="rabbits"]').press('Tab');
  await page.waitForFunction(()=>document.querySelector('#preview').contentWindow.eval('P.rabbits')===0);
  await page.locator('[data-extras="clear"]').click();await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>document.querySelector('#preview').contentWindow.SceneElements.inspect().actors.length),0);
  await page.reload();await page.waitForSelector('html.ready');
  assert.equal(await page.locator('[data-count="flowers"]').inputValue(),'0','Zero counts not saved');
  await page.locator('[data-extras="restore"]').click();await page.waitForTimeout(700);
  assert.equal(await page.locator('[data-count="flowers"]').inputValue(),'12');
  // Tabs keep all values intact, support arrow navigation and reveal terrain controls.
  await page.locator('#tab-environment').click();
  assert(await page.locator('#panel-environment').isVisible());
  assert(await page.locator('#panel-elements').isHidden());
  await page.locator('.opts[data-key="lighting"] [data-opt="2"]').click();
  await page.waitForFunction(()=>document.querySelector('#preview').contentWindow.eval('P.lighting')===2);
  await page.locator('.opts[data-key="lighting"] [data-opt="1"]').click();
  await page.waitForFunction(()=>document.querySelector('#preview').contentWindow.eval('P.lighting')===1);
  await page.locator('#tab-environment').press('ArrowLeft');
  assert.equal(await page.locator('#tab-elements').getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('[data-count="flowers"]').inputValue(),'12');
  assert.equal(await page.locator('.element-art img').count(),6);
  assert(await page.locator('.element-art img').evaluateAll(images=>images.every(i=>i.complete&&i.naturalWidth>0)));
  // Expanding the same iframe must preserve its live state and restore focus on Escape.
  const beforeExpand=await page.locator('#previewBox').boundingBox();
  const seedBefore=await page.locator('#preview').evaluate(el=>el.contentWindow.eval('seed'));
  await page.locator('#expandPreview').click();
  assert.equal(await page.locator('#expandPreview').getAttribute('aria-expanded'),'true');
  assert((await page.locator('#previewBox').boundingBox()).width>beforeExpand.width);
  assert.equal(await page.locator('#preview').evaluate(el=>el.contentWindow.eval('seed')),seedBefore);
  await page.waitForFunction(()=>document.querySelector('#stage').getAttribute('aria-busy')==='false');
  await page.locator('#expandPreview').press('Escape');
  assert.equal(await page.locator('#expandPreview').getAttribute('aria-expanded'),'false');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'expandPreview');
  await page.setViewportSize({width:1120,height:780});
  await page.waitForTimeout(500);
  await page.screenshot({path:resolve(out,'meadow-settings.png')});
  await page.locator('#tab-environment').click();
  await page.screenshot({path:resolve(out,'meadow-environment.png')});
  await page.locator('#tab-elements').click();
  await page.locator('#lang').selectOption('en');await page.waitForFunction(()=>document.documentElement.lang==='en');
  assert.equal(await page.locator('.extra-group h3').textContent(),'Extra elements');
  await page.locator('#lang').selectOption('zh-CN');await page.waitForFunction(()=>document.documentElement.lang==='zh-CN');
  await page.locator('[data-id="beach"]').click();
  await page.waitForFunction(()=>document.querySelector('#preview').contentWindow.SceneElements?.inspect()?.requested.umbrellas!==undefined);
  const walkerSwitch=page.locator('#toggle-showWalker');
  assert(await walkerSwitch.isChecked());
  await walkerSwitch.press('Space');
  await page.waitForFunction(()=>document.querySelector('#preview').contentWindow.eval('P.showWalker')===0);
  await walkerSwitch.press('Space');
  await page.waitForFunction(()=>document.querySelector('#preview').contentWindow.eval('P.showWalker')===1);
  await page.locator('[data-count="sailboats"]').fill('4');await page.locator('[data-count="sailboats"]').press('Enter');
  await page.waitForFunction(()=>document.querySelector('#preview').contentWindow.eval('P.sailboats')===4);
  await page.reload();await page.waitForSelector('html.ready');assert.equal(await page.locator('[data-count="sailboats"]').inputValue(),'4');
  await page.waitForFunction(()=>document.querySelector('#preview').contentWindow.SceneElements?.inspect()?.requested.umbrellas!==undefined);
  await page.waitForTimeout(3200);
  await page.screenshot({path:resolve(out,'beach-settings.png')});
  await page.emulateMedia({colorScheme:'dark'});
  await page.screenshot({path:resolve(out,'beach-settings-dark.png')});
  await page.emulateMedia({colorScheme:'light'});
  await page.setViewportSize({width:600,height:850});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Layout overflow');
  await page.setViewportSize({width:1440,height:900});
  // Real wall bridge: pause-before-icons, snapshot and a 12-second video with the extras.
  await page.close();
  const wall=await context.newPage();await wall.setViewportSize({width:960,height:600});wall.on('pageerror',e=>errors.push(e.message));
  await wall.addInitScript(()=>{window.chrome||={};window.__messages=[];window.__handlers=[];window.chrome.webview={postMessage:m=>__messages.push(m),addEventListener:(name,fn)=>{if(name==='message')__handlers.push(fn);}};window.deliver=m=>__handlers.forEach(fn=>fn({data:JSON.stringify(m)}));});
  await wall.goto(url+'/meadow.html?wallpaper=1',{waitUntil:'domcontentloaded',timeout:45000});await wall.waitForFunction(()=>__messages.includes('ready'),null,{timeout:30000});
  await wall.evaluate(r=>{deliver({t:'pause',v:true});deliver({t:'icons',vis:true,r});},rectangles);
  const f0=await wall.evaluate(()=>frameN);await wall.waitForTimeout(150);assert.equal(await wall.evaluate(()=>frameN),f0);
  await wall.evaluate(()=>deliver({t:'snapshot'}));await wall.waitForFunction(()=>__messages.some(m=>m.startsWith('snapshot|data:')),null,{timeout:15000});
  assert.equal(await wall.evaluate(()=>paused),true);
  await wall.evaluate(()=>deliver({t:'settings',v:{lighting:2}}));
  const video=await wall.evaluate(async()=>{
    const r=await desklandRecord();
    const data=await new Promise(ok=>{
      const reader=new FileReader();
      reader.onload=()=>ok(reader.result);
      reader.readAsDataURL(r.blob);
    });
    return {size:r.blob.size,paused,mime:r.mime,data,
      h264:MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')};
  });
  assert(video.size>10000);assert.equal(video.paused,true);
  const encoded=Buffer.from(video.data.split(',')[1],'base64');
  if(video.h264) assert.equal(video.mime,'video/mp4');
  if(video.mime==='video/mp4'){
    const boxes=[];
    for(let pos=0;pos<encoded.length;){
      const size=encoded.readUInt32BE(pos);
      assert(size>=8&&pos+size<=encoded.length);
      boxes.push(encoded.toString('ascii',pos+4,pos+8));
      pos+=size;
    }
    assert.deepEqual(boxes.slice(0,2),['ftyp','moov']);
    assert(boxes.includes('mdat')&&!boxes.includes('moof'));
  }
  if(process.env.DESKLAND_TEST_VIDEO) await writeFile(process.env.DESKLAND_TEST_VIDEO+(video.mime==='video/mp4'?'.mp4':'.webm'),encoded);
  await wall.close();checks.push({settings:'steppers, typed counts, clear, restore, persistence, bilingual UI',result:'pass'},{sharing:'pause, snapshot and 12-second video',result:'pass',videoBytes:video.size});
  assert.equal((await fetch(url+'/scenes/aurora.html')).status,404);
  assert.deepEqual(errors,[],'Browser errors');
  await writeFile(resolve(out,'browser-results.json'),JSON.stringify({passed:true,themes:2,checks,errors},null,2));
  console.log('PASS two themes, 12 extra element types, controls, terrain and sharing');
}catch(error){await writeFile(resolve(out,'browser-results.json'),JSON.stringify({passed:false,checks,errors,error:error.stack},null,2));throw error;}
finally{if(browser)await browser.close();server.kill();}
