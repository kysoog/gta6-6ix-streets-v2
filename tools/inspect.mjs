import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
const root = resolve('game');
const MIME={'.html':'text/html','.js':'text/javascript','.jpg':'image/jpeg','.png':'image/png'};
const server=createServer((req,res)=>{let p=new URL(req.url,'http://x').pathname;if(p.endsWith('/'))p+='index.html';
 try{const b=readFileSync(join(root,p));res.writeHead(200,{'content-type':MIME[extname(p)]||'application/octet-stream'});res.end(b);}catch{res.writeHead(404).end('nf');}});
await new Promise(d=>server.listen(0,'127.0.0.1',d));
const port=server.address().port;
const chrome='/root/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome';
const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-gl=angle','--window-size=1280,800','--remote-debugging-port=0',`--user-data-dir=/tmp/insp-${process.pid}`,'about:blank'],{stdio:['ignore','pipe','pipe']});
let devPort=null,err='';child.stderr.setEncoding('utf8');child.stderr.on('data',c=>{err+=c;const m=/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(err);if(m&&!devPort)devPort=+m[1];});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
while(!devPort)await sleep(50);
let ver=null;while(!ver){try{ver=await(await fetch(`http://127.0.0.1:${devPort}/json/version`)).json();}catch{await sleep(60);}}
const ws=new WebSocket(ver.webSocketDebuggerUrl);let id=1;const pend=new Map();
await new Promise(d=>ws.addEventListener('open',d));
ws.addEventListener('message',ev=>{const m=JSON.parse(String(ev.data));if(m.id&&pend.has(m.id)){const p=pend.get(m.id);pend.delete(m.id);m.error?p.f(new Error(JSON.stringify(m.error))):p.d(m.result);}});
const send=(method,params={},sessionId)=>{const mid=id++;const pl={id:mid,method,params};if(sessionId)pl.sessionId=sessionId;ws.send(JSON.stringify(pl));return new Promise((d,f)=>pend.set(mid,{d,f}));};
const {targetId}=await send('Target.createTarget',{url:'about:blank'});
const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
await send('Runtime.enable',{},sessionId);
await send('Page.navigate',{url:`http://127.0.0.1:${port}/${process.argv[2]??''}`},sessionId);
const t0=Date.now();while(Date.now()-t0<120000){const p=await send('Runtime.evaluate',{expression:'window.__shotReady===true',returnByValue:true},sessionId);if(p.result?.value)break;await sleep(120);}
const q=await send('Runtime.evaluate',{expression:`(()=>{const d=window.__dbg;if(!d)return 'no dbg';const out=[];d.scene.traverse(o=>{if(!o.isMesh)return;const g=o.geometry;const pos=g.attributes.position;let nan=0;if(pos){const a=pos.array;for(let i=0;i<a.length;i++)if(!Number.isFinite(a[i])){nan++;}}
out.push({n:o.name||o.type,cnt:pos?pos.count:0,nan,vis:o.visible,mat:o.material&&o.material.type,type:o.material&&o.material.map?'mapped':'plain'});});
const cars=d.world&&d.world.cars?String(d.world.cars.length):'?';
return JSON.stringify({meshes:out.slice(0,60),carCount:cars,cam:d.camera.position.toArray().map(v=>+v.toFixed(1)),car:d.world&&d.world.player?d.world.player.pos:null});})()`,returnByValue:true},sessionId);
console.log(q.result?.value?.slice(0,4000));
child.kill('SIGKILL');server.close();process.exit(0);
