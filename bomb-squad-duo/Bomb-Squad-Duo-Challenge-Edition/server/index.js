'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {upgrade}=require('./websocket');
const {newGame,beginRound,finishRound,authorize,interact,viewFor,remaining,resumeTimer,DIFFICULTIES}=require('./game');
const ROOT=path.resolve(__dirname,'../public');
const PORT=Number(process.env.PORT||3000);
const ROOM_CHARS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rooms=new Map();
const typeMap={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const paths={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css','/favicon.svg':'favicon.svg'};
const server=http.createServer((req,res)=>{
  const reqPath=new URL(req.url,'http://localhost').pathname;
  if(reqPath==='/health') {res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({status:'ok',rooms:rooms.size}));return;}
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','same-origin');
  if(req.method!=='GET'||!Object.hasOwn(paths,reqPath)){res.writeHead(404);res.end('Not found');return;}
  const filepath=path.join(ROOT,paths[reqPath]);
  fs.readFile(filepath,(err,data)=>{
    if(err){res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':typeMap[path.extname(filepath)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});
    res.end(data);
  });
});
const clients=new Set();
const send=(ws,data)=>{if(ws&&!ws.closed)ws.send(data);};
const err=(ws,msg)=>send(ws,{type:'error',message:msg});
const cleanName=s=>typeof s==='string'?s.trim().replace(/[<>]/g,'').slice(0,20):'';
const cleanChat=s=>typeof s==='string'?s.trim().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,180):'';
function code(){let v;do{v=Array.from({length:6},()=>ROOM_CHARS[crypto.randomInt(ROOM_CHARS.length)]).join('');}while(rooms.has(v));return v;}
function pushState(room,roomCode){room.lastActivity=Date.now();room.players.forEach((p,i)=>{if(p?.connected)send(p.socket,viewFor(room,i,roomCode));});}
function pauseOrUnpause(room){
  if(room.phase!=='playing')return;
  if(room.players.some(p=>!p?.connected)){ if(!room.pauseAt)room.pauseAt=Date.now(); }
  else if(room.pauseAt)resumeTimer(room);
}
function connectTo(ws,roomCode,room,idx){
  const p=room.players[idx];
  if(p.socket && p.socket!==ws && !p.socket.closed) p.socket.close();
  ws.roomCode=roomCode;ws.playerIndex=idx;
  p.socket=ws;p.connected=true;
  pauseOrUnpause(room);
  send(ws,{type:'welcome',room:roomCode,token:p.token,player:idx});
  pushState(room,roomCode);
}
function handle(ws,m){
    if(!m||typeof m!=='object'||typeof m.type!=='string')return;
    const now=Date.now();
    if(now-ws.bucketStarted>10000){ws.bucketStarted=now;ws.actionCount=0;}
    if(++ws.actionCount>100)return err(ws,'Too many actions; slow down.');
    if(m.type==='create'){
      if(ws.roomCode)return err(ws,'You are already in a room.');
      const name=cleanName(m.name);if(!name)return err(ws,'Please enter a player name.');
      if(rooms.size>=1200)return err(ws,'All rooms are busy. Please try again shortly.');
      const roomCode=code();
      const p={name,token:crypto.randomBytes(24).toString('hex'),connected:false,socket:null};
      const room=newGame([p,null]);rooms.set(roomCode,room);connectTo(ws,roomCode,room,0);return;
    }
    if(m.type==='join'){
      if(ws.roomCode)return err(ws,'You are already in a room.');
      const roomCode=String(m.room||'').trim().toUpperCase();const room=rooms.get(roomCode);
      if(!room)return err(ws,'That room code does not exist. Check the six letters.');
      if(room.players[1]||room.phase!=='lobby')return err(ws,'That room is already full or has started.');
      const name=cleanName(m.name);if(!name)return err(ws,'Please enter a player name.');
      room.players[1]={name,token:crypto.randomBytes(24).toString('hex'),connected:false,socket:null};
      connectTo(ws,roomCode,room,1);return;
    }
    if(m.type==='resume'){
      if(ws.roomCode)return;
      const roomCode=String(m.room||'').toUpperCase(),room=rooms.get(roomCode);
      const idx=room?.players.findIndex(p=>p&&p.token===m.token)??-1;
      if(!room||idx<0)return err(ws,'Could not restore that room. It may have expired.');
      connectTo(ws,roomCode,room,idx);return;
    }
    const room=rooms.get(ws.roomCode);
    const idx=ws.playerIndex;
    if(!room||!room.players[idx]||room.players[idx].socket!==ws)return err(ws,'Reconnect to your room first.');
    if(m.type==='difficulty' && room.phase==='lobby'){
      if(idx!==0)return err(ws,'Only the room creator chooses difficulty.');
      if(typeof m.value!=='string'||!Object.hasOwn(DIFFICULTIES,m.value))return err(ws,'Unknown difficulty setting.');
      room.difficulty=m.value;pushState(room,ws.roomCode);return;
    }
    if(m.type==='start' && room.phase==='lobby'){
      if(idx!==0)return err(ws,'Only the room creator can start.');
      if(!room.players[1]?.connected)return err(ws,'Wait for your partner to join.');
      beginRound(room);pushState(room,ws.roomCode);return;
    }
    if(m.type==='authorize'){
      if(authorize(room,idx,m.label)){pushState(room,ws.roomCode);}else{pushState(room,ws.roomCode);}return;
    }
    if(m.type==='interact'){
      const before=room.phase;
      const result=interact(room,idx,m.value);
      if(result.ok||before!==room.phase)pushState(room,ws.roomCode);
      return;
    }
    if(m.type==='ready'&&room.phase==='result'){
      room.ready[idx]=true;
      if(room.ready[0]&&room.ready[1]&&room.players.every(p=>p?.connected))beginRound(room);
      pushState(room,ws.roomCode);return;
    }
    if(m.type==='rematch'&&room.phase==='finished'){
      if(idx!==0)return err(ws,'The room creator starts rematches.');
      if(!room.players.every(p=>p?.connected))return err(ws,'Both players must be connected.');
      room.round=-1;room.results=[];room.scores=[0,0];room.solved=0;room.chats=[];room.puzzle=null;
      room.phase='lobby';room.ready=[false,false];room.lastActivity=Date.now();
      pushState(room,ws.roomCode);return;
    }
    if(m.type==='chat'){
      const now=Date.now();if(now-ws.lastChat<500)return;
      const txt=cleanChat(m.text);if(!txt)return;
      ws.lastChat=now;
      room.chats.push({from:idx,text:txt});room.chats=room.chats.slice(-35);
      pushState(room,ws.roomCode);return;
    }
}
function closed(ws){
  clients.delete(ws);
  if(!ws.roomCode)return;
  const room=rooms.get(ws.roomCode),p=room?.players[ws.playerIndex];
  if(p?.socket===ws){p.connected=false;p.socket=null;pauseOrUnpause(room);pushState(room,ws.roomCode);}
}
server.on('upgrade',(req,socket,head)=>{
  let allowed=true;
  if(req.headers.origin){try{allowed=new URL(req.headers.origin).host.toLowerCase()===String(req.headers.host||'').toLowerCase();}catch{allowed=false;}}
  if(new URL(req.url,'http://localhost').pathname!=='/ws'||!allowed){socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return;}
  if(clients.size>=1000){socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');socket.destroy();return;}
  const ws=upgrade(req,socket,head,handle,closed);
  if(ws){ws.lastChat=0;ws.playerIndex=-1;ws.bucketStarted=Date.now();ws.actionCount=0;clients.add(ws);}
});
const ticker=setInterval(()=>{
  const now=Date.now();
  for(const [code,room] of rooms){
    if(room.phase==='playing'&&!room.pauseAt&&remaining(room,now)===0){finishRound(room,false,now);pushState(room,code);}
    if(now-room.lastActivity>2*60*60*1000&&room.players.every(p=>!p?.connected))rooms.delete(code);
  }
},250);
ticker.unref();
if(require.main===module)server.listen(PORT,'0.0.0.0',()=>console.log(`Bomb Squad Duo listening on port ${server.address().port}`));
module.exports={server,rooms,clients};
