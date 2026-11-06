const {chromium}=require('playwright');const fs=require('fs');
const out='clips/builder';fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
await p.goto('http://localhost:8765/builder.html?fresh=1');await p.waitForTimeout(2000);
await p.addStyleTag({content:`#tapdot{position:fixed;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;background:rgba(20,20,20,.28);border:3px solid rgba(255,255,255,.9);box-shadow:0 2px 10px rgba(0,0,0,.25);pointer-events:none;z-index:99999;opacity:0;transform:scale(.6);transition:opacity .15s,transform .2s}#tapdot.on{opacity:1;transform:scale(1)}*{caret-color:#111}`});
await p.evaluate(()=>{const d=document.createElement('div');d.id='tapdot';document.body.appendChild(d)});
const log=[];let n=0;const t0=Date.now();
async function snap(k=1){for(let i=0;i<k;i++){const f=`${out}/f${String(n).padStart(4,'0')}.jpg`;await p.screenshot({path:f,type:'jpeg',quality:88});log.push({f,t:(Date.now()-t0)/1000});n++;}}
async function hold(ms){const e=Date.now()+ms;while(Date.now()<e)await snap();}
async function mark(label){log.push({mark:label,t:(Date.now()-t0)/1000});}
async function tap(sel){const el=await p.$(sel);await el.evaluate(e=>e.scrollIntoView({block:'center',behavior:'smooth'}));await hold(450);
 const bb=await el.boundingBox();const x=bb.x+bb.width/2,y=bb.y+bb.height/2;
 await p.evaluate(([x,y])=>{const d=document.getElementById('tapdot');d.style.left=x+'px';d.style.top=y+'px';d.classList.add('on')},[x,y]);await snap(2);
 await p.mouse.click(x,y);await snap(1);await p.evaluate(()=>document.getElementById('tapdot').classList.remove('on'));}
await mark('name');await hold(500);
await tap('#nm');
for(const c of 'Maya'){await p.keyboard.type(c);await hold(220);}
await hold(900);
await mark('next1');await tap('[data-act="next"]');await hold(700);
await mark('look');await tap('[data-kid="girl"]');await hold(500);
await tap('[data-chip="style"][data-v="puffs"]');await hold(400);
await tap('[data-sw="hair"][data-i="#141010"]');await hold(250);
await tap('[data-sw="skin"][data-i="#9a5f34"]');await hold(250);
await tap('[data-sw="hood"][data-i="#f4d35e"]');await hold(250);
await tap('[data-sw="jog"][data-i="#4a6fa5"]');await hold(250);
await tap('[data-sw="shoe"][data-i="#e85b9c"]');await hold(250);
await tap('[data-chip="acc"][data-v="clips"]');await hold(600);
await mark('next2');await tap('[data-act="next"]');await hold(700);
await mark('trips');
for(const w of ['westend','olddubai','downtown','capetown','desert']){await tap(`[data-w="${w}"]`);await hold(300);}
await hold(800);
fs.writeFileSync(out+'/log.json',JSON.stringify(log));console.log('frames',n,'secs',(Date.now()-t0)/1000);
await b.close();})();
