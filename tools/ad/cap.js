// node cap.js LV skipSec secs outdir [held pattern]
const {chromium}=require('playwright');const fs=require('fs');
const [LV,skip,secs,out]=process.argv.slice(2);
const cfg={name:'Maya',kid:'girl',style:'puffs',acc:'none',skin:'#9a5f34',hair:'#141010',hood:'#f4d35e',jog:'#4a6fa5',shoe:'#e85b9c',worlds:JSON.parse(process.env.WORLDS||'["westend","olddubai","downtown","capetown","desert"]'),slug:'maya'};
const w=Buffer.from(JSON.stringify(cfg)).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
(async()=>{fs.mkdirSync(out,{recursive:true});const b=await chromium.launch();const p=await b.newPage({viewport:{width:590,height:540},deviceScaleFactor:2});
p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto('http://localhost:8765/play.html?w='+w);await p.waitForTimeout(2500);
await p.evaluate(l=>__arun.start(+l),LV);
await p.waitForFunction(()=>__arun.G&&__arun.G.L,null,{timeout:60000});
await p.waitForTimeout(1500);
await p.evaluate(()=>{window.__freeze=true;const h=document.getElementById('hud');if(h)h.style.visibility='hidden';const G=__arun.G;G.intro=false;});
await p.evaluate(s=>{const G=__arun.G;for(let i=0;i<s*60;i++){ARun.step(G,1/60,{held:false,pressed:false,down:false});G.events.length=0;}},+skip);
const N=Math.round(+secs*30);
for(let f=0;f<N;f++){
  await p.evaluate(()=>{const G=__arun.G;for(let i=0;i<2;i++){ARun.step(G,1/60,{held:false,pressed:false,down:false});G.events.length=0;}});
  await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>r())));
  await p.screenshot({path:`${out}/f${String(f).padStart(4,'0')}.jpg`,type:'jpeg',quality:90});
}
console.log('dead?',await p.evaluate(()=>JSON.stringify({x:__arun.G.p&&__arun.G.p.x,done:__arun.G.done})));
await b.close();})();
