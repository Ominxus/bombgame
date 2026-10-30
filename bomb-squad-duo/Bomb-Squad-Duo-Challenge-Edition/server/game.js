'use strict';
const crypto = require('node:crypto');

// Player-visible difficulties are fixed on the server to keep matches fair.
const DIFFICULTIES = Object.freeze({
  casual: {name:'Warm-up', roundMs:110000, maxStrikes:3, penaltyMs:4000, goal:5},
  standard: {name:'Challenge', roundMs:85000, maxStrikes:3, penaltyMs:6000, goal:5},
  intense: {name:'Expert', roundMs:65000, maxStrikes:2, penaltyMs:8000, goal:6}
});
const LABELS = ['LUNA','NOVA','ECHO','MOSS','VEGA','ORBIT'];
const KINDS = ['glyphs','wires','circuits','keypad','wires','glyphs','keypad','circuits'];
const GLYPHS = ['✦','◆','☾','⬡','✿','✧'];
const WIRES = ['CORAL','CYAN','LIME','GOLD','VIOLET','SILVER'];
const COLORS = ['CORAL','CYAN','LIME','GOLD','VIOLET','SILVER'];
const SIGNALS = ['SOLAR','LUNAR'];
const ROUNDS=8;
const ROUND_MS=DIFFICULTIES.standard.roundMs;
const pick=arr=>arr[crypto.randomInt(arr.length)];
function shuffle(arr){ const a=arr.slice();for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a; }
function pin(len){return Array.from({length:len},()=>String(crypto.randomInt(10)));}
function tierFor(round,difficulty){
  if(difficulty==='casual')return round<6?0:1;
  if(difficulty==='intense')return round<2?1:2;
  return round<2?0:round<6?1:2;
}
function makeSteps(kind,tier){
  if(kind==='glyphs')return shuffle(GLYPHS).slice(0,[4,5,6][tier]);
  if(kind==='wires')return shuffle(WIRES).slice(0,[2,3,4][tier]);
  if(kind==='circuits')return shuffle(COLORS).slice(0,[3,4,5][tier]);
  return pin([3,4,5][tier]);
}
function describeSteps(kind,steps){
  if(kind==='glyphs')return `Touch ${steps.join(' → ')}`;
  if(kind==='wires')return `Disconnect ${steps.join(' → ')}`;
  if(kind==='circuits')return `Pulse ${steps.join(' → ')}`;
  return `Enter ${steps.join('')} and press CONFIRM`;
}
function createPuzzle(round,difficulty='standard'){
  if(!DIFFICULTIES[difficulty])difficulty='standard';
  const kind=KINDS[round%KINDS.length],tier=tierFor(round,difficulty);
  const label=pick(tier?LABELS:LABELS.slice(0,4));
  const signal=tier>=1?pick(SIGNALS):null;
  const polarity=tier>=2?pick(['NORMAL','REVERSED']):null;
  const tags=shuffle(LABELS).slice(0,tier?6:4);
  // Ensure the matching badge is present, even when using the four-entry beginner manual.
  if(!tags.includes(label))tags[crypto.randomInt(tags.length)]=label;
  const rows=shuffle(tags).map(tag=>{
    const base=makeSteps(kind,tier);
    if(tier===0)return {label:tag,steps:base,instruction:describeSteps(kind,base)+'.'};
    let alternate=makeSteps(kind,tier);
    while(alternate.join('|')===base.join('|'))alternate=makeSteps(kind,tier);
    const branches={SOLAR:base,LUNAR:alternate};
    const selected=branches[signal];
    const steps=polarity==='REVERSED'?selected.slice().reverse():selected.slice();
    const modeNote=tier>=2?' If the device polarity is REVERSED, perform the entire selected sequence backwards (including keypad digits).':'';
    return {label:tag,steps,branches,instruction:`If signal SOLAR: ${describeSteps(kind,base)}. If signal LUNAR: ${describeSteps(kind,alternate)}.${modeNote}`};
  });
  const choicePool=kind==='glyphs'?GLYPHS:kind==='wires'?WIRES:kind==='circuits'?COLORS:['0','1','2','3','4','5','6','7','8','9'];
  return {kind,label,signal,polarity,tier,rows,choices:shuffle(choicePool),progress:0,typed:'',authorized:false,strikes:0,resolved:false};
}
function description(kind){return {
  glyphs:['GLYPH MATRIX','Activate the symbols in the exact authorized sequence.'],
  wires:['ENERGY WIRES','Disconnect the listed conduits in the correct order.'],
  circuits:['PULSE CIRCUIT','Activate the signal pads in the exact order.'],
  keypad:['SECURITY KEYPAD','Enter the authorized access code and press CONFIRM.']
}[kind];}
function newGame(players){return {
  phase:'lobby',round:-1,rounds:ROUNDS,players,difficulty:'standard',
  scores:[0,0],solved:0,results:[],puzzle:null,
  startAt:0,endAt:0,authAt:0,pauseAt:0,ready:[false,false],chats:[],lastActivity:Date.now()
};}
function beginRound(room,now=Date.now()){
  room.round+=1;room.phase='playing';room.puzzle=createPuzzle(room.round,room.difficulty);
  room.startAt=now;room.endAt=now+DIFFICULTIES[room.difficulty].roundMs;
  room.authAt=0;room.pauseAt=0;room.ready=[false,false];room.chats=[];room.lastActivity=now;
}
function isPaused(room){return room.phase==='playing'&&room.pauseAt>0;}
function remaining(room,now=Date.now()){return Math.max(0,room.endAt-(room.pauseAt||now));}
function resumeTimer(room,now=Date.now()){
  if(!room.pauseAt)return;
  const delta=now-room.pauseAt;room.endAt+=delta;room.startAt+=delta;
  if(room.authAt)room.authAt+=delta;
  room.pauseAt=0;
}
function strike(room,now=Date.now()){
  const p=room.puzzle,config=DIFFICULTIES[room.difficulty];
  p.strikes+=1;p.progress=0;p.typed='';room.endAt-=config.penaltyMs;
  if(p.strikes>=config.maxStrikes||remaining(room,now)<=0)finishRound(room,false,now);
}
function finishRound(room,success,now=Date.now()){
  if(room.phase!=='playing')return;
  const p=room.puzzle, config=DIFFICULTIES[room.difficulty];p.resolved=true;
  const awarded=[0,0],defuser=room.round%2,expert=1-defuser;
  if(success){
    const perfect=p.strikes===0?20:0;
    const expertMs=Math.max(0,room.authAt-room.startAt);
    const defuserMs=Math.max(0,now-room.authAt);
    awarded[expert]=60+perfect+Math.round(40*Math.max(0,1-expertMs/(config.roundMs*.45)));
    awarded[defuser]=60+perfect+Math.round(40*Math.max(0,1-defuserMs/(config.roundMs*.6)));
    room.scores[0]+=awarded[0];room.scores[1]+=awarded[1];room.solved++;
  }
  room.results.push({round:room.round+1,kind:p.kind,label:p.label,success,strikes:p.strikes,awarded,remainingMs:remaining(room,now),tier:p.tier});
  room.phase=room.round===ROUNDS-1?'finished':'result';room.ready=[false,false];room.lastActivity=now;
}
function authorize(room,idx,label,now=Date.now()){
  if(room.phase!=='playing'||isPaused(room)||idx===room.round%2||room.puzzle.authorized)return false;
  if(remaining(room,now)<=0){finishRound(room,false,now);return false;}
  if(label!==room.puzzle.label){strike(room,now);return false;}
  room.puzzle.authorized=true;room.authAt=now;return true;
}
function interact(room,idx,value,now=Date.now()){
  if(room.phase!=='playing'||isPaused(room)||idx!==room.round%2||!room.puzzle.authorized)return {ok:false};
  if(remaining(room,now)<=0){finishRound(room,false,now);return {ok:false};}
  const p=room.puzzle,chosen=p.rows.find(row=>row.label===p.label).steps;
  if(p.kind==='keypad'){
    if(value==='BACK'){p.typed=p.typed.slice(0,-1);return {ok:true};}
    if(value==='CLEAR'){p.typed='';return {ok:true};}
    if(value==='CONFIRM'){
      if(p.typed.length!==chosen.length)return {ok:false};
      if(p.typed===chosen.join('')){finishRound(room,true,now);return {ok:true,solved:true};}
      strike(room,now);return {ok:true,strike:true};
    }
    if(typeof value!=='string'||!/^[0-9]$/.test(value)||p.typed.length>=chosen.length)return {ok:false};
    p.typed+=value;return {ok:true};
  }
  if(typeof value!=='string'||!p.choices.includes(value))return {ok:false};
  if(value===chosen[p.progress]){
    p.progress++;
    if(p.progress===chosen.length){finishRound(room,true,now);return {ok:true,solved:true};}
    return {ok:true};
  }
  strike(room,now);return {ok:true,strike:true};
}
function viewFor(room,idx,code,now=Date.now()){
  const p=room.puzzle,current=room.phase==='playing',defuser=room.round%2;
  const cfg=DIFFICULTIES[room.difficulty];
  const personalPuzzle=p?{
    kind:p.kind,title:description(p.kind)[0],description:description(p.kind)[1],
    label:idx===defuser?p.label:null,signal:idx===defuser?p.signal:null,polarity:idx===defuser?p.polarity:null,
    choices:p.choices,progress:p.progress,typed:p.typed,authorized:p.authorized,strikes:p.strikes,tier:p.tier,
    stepsRequired:p.rows.find(r=>r.label===p.label).steps.length,
    role:idx===defuser?'defuser':'expert',
    manual:idx===defuser?null:p.rows.map(r=>({label:r.label,instruction:r.instruction})),
  }:null;
  return {
    type:'state',room:code,phase:room.phase,round:room.round+1,rounds:room.rounds,
    players:room.players.map((pl,i)=>({name:pl?.name||'Waiting...',connected:!!pl?.connected,score:room.scores[i]})),
    you:idx,host:idx===0,role:current?(idx===defuser?'defuser':'expert'):(room.round>=0?(idx===defuser?'defuser':'expert'):null),
    puzzle:personalPuzzle,remainingMs:current?remaining(room,now):0,paused:current&&isPaused(room),
    difficulty:room.difficulty,settings:{...cfg},ready:room.ready,solved:room.solved,total:room.rounds,results:room.results.slice(),
    lastResult:room.results.at(-1)||null,chat:room.chats.slice(-35),teamWon:room.phase==='finished'&&room.solved>=cfg.goal
  };
}
module.exports={newGame,beginRound,finishRound,authorize,interact,viewFor,remaining,resumeTimer,createPuzzle,DIFFICULTIES,tierFor,ROUNDS,ROUND_MS};
