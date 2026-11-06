// node capp.js LV skipSec secs outdir  (portrait phone, planner taps)
const {chromium}=require('playwright');const fs=require('fs');
const [LV,skip,secs,out]=process.argv.slice(2);
const cfg={name:'Maya',kid:'girl',style:'puffs',acc:'clips',skin:'#9a5f34',hair:'#141010',hood:'#f4d35e',jog:'#4a6fa5',shoe:'#e85b9c',worlds:JSON.parse(process.env.WORLDS||'["westend","olddubai","downtown","capetown","desert"]'),slug:'maya'};
const w=Buffer.from(JSON.stringify(cfg)).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
(async()=>{fs.mkdirSync(out,{recursive:true});const b=await chromium.launch();const p=await b.newPage({viewport:{width:360,height:780},deviceScaleFactor:3,isMobile:true,hasTouch:true});
p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto('http://localhost:8765/play.html?w='+w);await p.waitForTimeout(2500);
await p.evaluate(l=>__arun.start(+l),LV);
await p.waitForFunction(()=>__arun.G&&__arun.G.L,null,{timeout:60000});
await p.waitForTimeout(1500);
await p.evaluate(()=>{window.__freeze=true;const G=__arun.G;G.intro=false;
 window.__plan={hold:0,prev:false,t:0};
 const sc=g=>g.failed?-1e9:(g.p.x+Math.max(0,g.p.y)*2.5+(g.bubbles||0)*40+(g.coins||0)*0.3+(g.done?1e4:0));
 window.__tick=function(){const G=__arun.G,P=window.__plan;
  if(P.t%6===0){let best=-1e18,bh=0;
   for(const k of [0,4,8,14,22]){const g=ARun.cloneGame(G);let pv=P.prev;
    for(let i=0;i<110;i++){const h=i<k;ARun.step(g,1/60,{held:h,pressed:h&&!pv,down:false});pv=h;g.events.length=0;if(g.failed)break;}
    const s=sc(g)-(k?0.4:0);if(s>best){best=s;bh=k;}}
   P.hold=bh;}
  const h=P.hold>0;ARun.step(G,1/60,{held:h,pressed:h&&!P.prev,down:false});P.prev=h;if(P.hold>0)P.hold--;P.t++;G.events.length=0;};});
await p.evaluate(s=>{for(let i=0;i<s*60;i++)__tick();},+skip);
const N=Math.round(+secs*30);
for(let f=0;f<N;f++){
  await p.evaluate(()=>{__tick();__tick();});
  await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>r())));
  await p.screenshot({path:`${out}/f${String(f).padStart(4,'0')}.jpg`,type:'jpeg',quality:88});
}
console.log('state',await p.evaluate(()=>JSON.stringify({x:__arun.G.p.x,done:__arun.G.done,failed:__arun.G.failed})));
await b.close();})();
