'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const {server,rooms}=require('../server/index');
async function openSocket(){
  const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  return ws;
}
function message(ws,pred,timeout=3000){
  return new Promise((resolve,reject)=>{
    const t=setTimeout(()=>{ws.removeEventListener('message',handle);reject(new Error('Timed out waiting for WS message'));},timeout);
    function handle(e){let m;try{m=JSON.parse(e.data)}catch{return;}if(pred(m)){clearTimeout(t);ws.removeEventListener('message',handle);resolve(m);}}
    ws.addEventListener('message',handle);
  });
}
function send(ws,type,fields={}){ws.send(JSON.stringify({type,...fields}));}
test.before(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));});
test('browser homepage, JS and health endpoint are served correctly',async()=>{
  const base=`http://127.0.0.1:${server.address().port}`;
  for(const [url,expected] of [['/','text/html'],['/app.js','text/javascript'],['/style.css','text/css'],['/health','application/json']]){
    const response=await fetch(base+url);
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-type'),new RegExp(expected));
    assert.ok((await response.text()).length>10);
  }
  assert.equal((await fetch(base+'/no-such-file')).status,404);
});
test('two independent browser clients, create/join, private instructions, play and reconnect',async()=>{
  const a=await openSocket(),b=await openSocket();let c;
  try{
    const created=message(a,m=>m.type==='welcome');send(a,'create',{name:'Moon'});const j=await created;
    assert.match(j.room,/^[A-HJ-NP-Z2-9]{6}$/);assert.equal(j.player,0);
    const joined=message(b,m=>m.type==='welcome');send(b,'join',{name:'Star',room:j.room});const k=await joined;
    assert.equal(k.player,1);
    const startA=message(a,m=>m.type==='state'&&m.phase==='playing');const startB=message(b,m=>m.type==='state'&&m.phase==='playing');
    send(a,'start');const [sa,sb]=await Promise.all([startA,startB]);
    assert.equal(sa.puzzle.role,'defuser');assert.equal(sa.puzzle.manual,null);
    assert.equal(sb.puzzle.role,'expert');assert.equal(sb.puzzle.label,null);
    const puzzle=rooms.get(j.room).puzzle;
    const authorized=message(a,m=>m.type==='state'&&m.phase==='playing'&&m.puzzle.authorized);
    send(b,'authorize',{label:puzzle.label});await authorized;
    const steps=puzzle.rows.find(r=>r.label===puzzle.label).steps;
    const finalA=message(a,m=>m.type==='state'&&m.phase==='result');
    const finalB=message(b,m=>m.type==='state'&&m.phase==='result');
    for(const step of steps)send(a,'interact',{value:step});
    const [fa,fb]=await Promise.all([finalA,finalB]);
    assert.equal(fa.lastResult.success,true);assert.deepEqual(fa.lastResult,fb.lastResult);
    assert.ok(fa.players[0].score>0&&fa.players[1].score>0);
    const next=message(a,m=>m.type==='state'&&m.phase==='playing'&&m.round===2);
    send(a,'ready');send(b,'ready');const nextView=await next;
    assert.equal(nextView.role,'expert');
    const disconnected=message(a,m=>m.type==='state'&&m.paused);b.close();await disconnected;
    c=await openSocket();
    const resumed=message(c,m=>m.type==='welcome');
    const unpaused=message(a,m=>m.type==='state'&&m.phase==='playing'&&!m.paused);
    send(c,'resume',{room:j.room,token:k.token});const cj=await resumed;
    assert.equal(cj.player,1);await unpaused;
  }finally{a.close();b.close();c?.close();}
});
test('host can select Expert difficulty, guest cannot override, and rematch returns to lobby',async()=>{
  const a=await openSocket(),b=await openSocket();
  try{
    const created=message(a,m=>m.type==='welcome');send(a,'create',{name:'Agent A'});const j=await created;
    const joined=message(b,m=>m.type==='welcome');send(b,'join',{name:'Agent B',room:j.room});await joined;
    const updated=message(b,m=>m.type==='state'&&m.difficulty==='intense');
    send(a,'difficulty',{value:'intense'});const v=await updated;
    assert.equal(v.settings.roundMs,65000);assert.equal(v.settings.maxStrikes,2);assert.equal(v.settings.goal,6);
    const rejected=message(b,m=>m.type==='error');send(b,'difficulty',{value:'casual'});
    assert.match((await rejected).message,/Only the room creator/);
    const startView=message(b,m=>m.type==='state'&&m.phase==='playing');send(a,'start');
    const started=await startView;
    assert.equal(started.puzzle.tier,1);
    assert.equal(started.puzzle.signal,null);
    const r=rooms.get(j.room);
    r.phase='finished';r.round=7;
    const back=message(b,m=>m.type==='state'&&m.phase==='lobby');
    send(a,'rematch');await back;
    assert.equal(r.difficulty,'intense');assert.equal(r.round,-1);
    assert.equal(r.puzzle,null);
  }finally{a.close();b.close();}
});
after(async()=>{for(const c of rooms.values())for(const p of c.players)p?.socket?.close();await new Promise(resolve=>server.close(resolve));});
