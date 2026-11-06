const {chromium}=require('playwright');const fs=require('fs');
const [LV,secs,out]=process.argv.slice(2);
const cfg={name:'Maya',kid:'girl',style:'puffs',acc:'none',skin:'#9a5f34',hair:'#141010',hood:'#f4d35e',jog:'#4a6fa5',shoe:'#e85b9c',worlds:JSON.parse(process.env.WORLDS),slug:'maya'};
const w=Buffer.from(JSON.stringify(cfg)).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
(async()=>{fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});const b=await chromium.launch();const p=await b.newPage({viewport:{width:590,height:540},deviceScaleFactor:2});
await p.goto('http://localhost:8765/play.html?w='+w);await p.waitForTimeout(2500);
await p.evaluate(l=>__arun.start(+l),LV);
const log=[];const t0=Date.now();let n=0;
while(Date.now()-t0<secs*1000){const f=`${out}/f${String(n).padStart(4,'0')}.jpg`;await p.screenshot({path:f,type:'jpeg',quality:88});log.push({f,t:(Date.now()-t0)/1000});n++;}
fs.writeFileSync(out+'/log.json',JSON.stringify(log));console.log(n);await b.close();})();
