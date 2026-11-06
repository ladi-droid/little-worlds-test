const {chromium}=require('playwright');const fs=require('fs');
const [out,from,to,step]=[process.argv[2],+(process.argv[3]||0),+(process.argv[4]||20),+(process.argv[5]||1/30)];
(async()=>{fs.mkdirSync(out,{recursive:true});const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1920}});
p.on('pageerror',e=>console.log('ERR',e.message));p.on('console',m=>{if(m.type()==='error')console.log('CON',m.text())});
await p.goto('http://localhost:8766/compose.html');await p.evaluate(()=>window.ready);
let n=0;for(let t=from;t<to-1e-6;t+=step){await p.evaluate(t=>renderAt(t),t);await p.locator('#c').screenshot({path:`${out}/r${String(n).padStart(4,'0')}.jpg`,type:'jpeg',quality:92});n++;}
console.log('frames',n);await b.close();})();
