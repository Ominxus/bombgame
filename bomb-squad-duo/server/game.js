'use strict';
const crypto = require('node:crypto');

const LABELS = ['LUNA', 'NOVA', 'ECHO', 'MOSS'];
const KINDS = ['glyphs', 'wires', 'circuits', 'keypad', 'wires', 'glyphs', 'keypad', 'circuits'];
const GLYPHS = ['✦', '◆', '☾', '⬡'];
const WIRES = ['CORAL', 'CYAN', 'LIME', 'GOLD', 'VIOLET'];
const COLORS = ['CORAL', 'CYAN', 'LIME', 'GOLD'];
const ROUNDS = 8;
const ROUND_MS = 90000;
const WRONG_PENALTY_MS = 6000;

function pick(arr) { return arr[crypto.randomInt(arr.length)]; }
function shuffle(arr) { const out = arr.slice(); for (let i=out.length-1;i>0;i--){ const j=crypto.randomInt(i+1); [out[i],out[j]]=[out[j],out[i]]; } return out; }
function pin() { return String(crypto.randomInt(1000)).padStart(3,'0'); }
function createPuzzle(round) {
  const kind = KINDS[round % KINDS.length];
  const label = pick(LABELS);
  const rows = shuffle(LABELS).map(tag => {
    if (kind === 'glyphs') {
      const steps=shuffle(GLYPHS);
      return {label:tag, steps, instruction:`Touch these symbols in order: ${steps.join(' → ')}`};
    }
    if (kind === 'wires') {
      const steps=shuffle(WIRES).slice(0,2);
      return {label:tag, steps, instruction:`Disconnect ${steps[0]} first, then ${steps[1]}.`};
    }
    if (kind === 'circuits') {
      const steps=shuffle(COLORS).slice(0,3);
      return {label:tag, steps, instruction:`Pulse ${steps.join(' → ')} in exactly this order.`};
    }
    const steps = pin().split('');
    return {label:tag, steps, instruction:`Enter access code ${steps.join('')}, then press CONFIRM.`};
  });
  return {
    kind, label, rows, choices:shuffle(kind==='glyphs'?GLYPHS:kind==='wires'?WIRES:kind==='circuits'?COLORS:['0','1','2','3','4','5','6','7','8','9']),
    progress:0, typed:'', authorized:false, strikes:0, resolved:false
  };
}
function description(kind) {
  return {
    glyphs: ['GLYPH MATRIX', 'Tap the four alien symbols in the correct order.'],
    wires: ['ENERGY WIRES', 'Disconnect two colored conduits in the correct order.'],
    circuits: ['PULSE CIRCUIT', 'Pulse three colored nodes in the correct order.'],
    keypad: ['SECURITY KEYPAD', 'Enter the secret three-digit access code.']
  }[kind];
}
function newGame(players) {
  return {
    phase:'lobby',round:-1,rounds:ROUNDS,roundMs:ROUND_MS,players,
    scores:[0,0],solved:0,results:[],puzzle:null,
    startAt:0,endAt:0,authAt:0,pauseAt:0,
    ready:[false,false],chats:[],lastActivity:Date.now()
  };
}
function beginRound(room, now=Date.now()) {
  room.round += 1;
  room.phase='playing';
  room.puzzle=createPuzzle(room.round);
  room.startAt=now;room.endAt=now+ROUND_MS;room.authAt=0;room.pauseAt=0;
  room.ready=[false,false];
  room.chats=[];
  room.lastActivity=now;
}
function isPaused(room) { return room.phase==='playing' && room.pauseAt>0; }
function remaining(room, now=Date.now()) {
  return Math.max(0,room.endAt-(room.pauseAt||now));
}
function resumeTimer(room, now=Date.now()) {
  if (!room.pauseAt) return;
  const delta=now-room.pauseAt;
  room.endAt+=delta;room.startAt+=delta;if(room.authAt)room.authAt+=delta;
  room.pauseAt=0;
}
function strike(room, now=Date.now()) {
  const puzzle=room.puzzle;
  puzzle.strikes+=1;
  puzzle.progress=0;
  puzzle.typed='';
  room.endAt-=WRONG_PENALTY_MS;
  if(puzzle.strikes>=3 || remaining(room,now)<=0) finishRound(room,false,now);
}
function finishRound(room,success,now=Date.now()) {
  if (room.phase!=='playing') return;
  const p=room.puzzle;
  p.resolved=true;
  let awarded=[0,0];
  const defuser=room.round%2;
  const expert=1-defuser;
  if(success) {
    const perfect=p.strikes===0?20:0;
    const expertSec=Math.max(0,room.authAt-room.startAt);
    const defuserSec=Math.max(0,now-room.authAt);
    awarded[expert]=60+perfect+Math.round(40*Math.max(0,1-expertSec/30000));
    awarded[defuser]=60+perfect+Math.round(40*Math.max(0,1-defuserSec/50000));
    room.scores[0]+=awarded[0];room.scores[1]+=awarded[1];
    room.solved++;
  }
  const result={round:room.round+1,kind:p.kind,label:p.label,success,strikes:p.strikes,awarded,remainingMs:remaining(room,now)};
  room.results.push(result);
  room.phase = room.round===ROUNDS-1?'finished':'result';
  room.ready=[false,false];
  room.lastActivity=now;
}
function authorize(room, idx, label, now=Date.now()) {
  if(room.phase!=='playing'||isPaused(room)||idx===room.round%2||room.puzzle.authorized)return false;
  if(label!==room.puzzle.label) { strike(room,now);return false; }
  room.puzzle.authorized=true;room.authAt=now;return true;
}
function interact(room,idx,value,now=Date.now()) {
  if(room.phase!=='playing'||isPaused(room)||idx!==room.round%2||!room.puzzle.authorized)return {ok:false};
  const p=room.puzzle, chosen=p.rows.find(row=>row.label===p.label).steps;
  if(p.kind==='keypad'){
    if(value==='BACK'){p.typed=p.typed.slice(0,-1);return {ok:true};}
    if(value==='CLEAR'){p.typed='';return {ok:true};}
    if(value==='CONFIRM'){
      if(p.typed.length!==3)return {ok:false};
      if(p.typed===chosen.join('')){finishRound(room,true,now);return {ok:true,solved:true};}
      strike(room,now);return {ok:true,strike:true};
    }
    if(typeof value!=='string'||!/^[0-9]$/.test(value)||p.typed.length>=3)return {ok:false};
    p.typed+=value;return {ok:true};
  }
  if(typeof value!=='string'||!p.choices.includes(value))return {ok:false};
  if(value===chosen[p.progress]) {
    p.progress+=1;
    if(p.progress===chosen.length){ finishRound(room,true,now);return {ok:true,solved:true}; }
    return {ok:true};
  }
  strike(room,now);return {ok:true,strike:true};
}
function viewFor(room,idx,code,now=Date.now()) {
  const p=room.puzzle;
  const current=room.phase==='playing';
  const defuser=room.round%2;
  const personalPuzzle=p?{
    kind:p.kind,title:description(p.kind)[0],description:description(p.kind)[1],label:idx===defuser?p.label:null,
    choices:p.choices,progress:p.progress,typed:p.typed,authorized:p.authorized,strikes:p.strikes,
    stepsRequired:p.kind==='keypad'?3:(p.kind==='glyphs'?4:p.kind==='wires'?2:3),
    role:idx===defuser?'defuser':'expert',
    manual:idx===defuser?null:p.rows.map(r=>({label:r.label,instruction:r.instruction})),
  }:null;
  return {
    type:'state',room:code,phase:room.phase,round:room.round+1,rounds:room.rounds,
    players:room.players.map((player,i)=>({name:player?.name||'Waiting...',connected:!!player?.connected,score:room.scores[i]})),
    you:idx,host:idx===0,role:current?(idx===defuser?'defuser':'expert'):(room.round>=0?(idx===defuser?'defuser':'expert'):null),
    puzzle:personalPuzzle,remainingMs:current?remaining(room,now):0,paused:current&&isPaused(room),
    ready:room.ready,solved:room.solved,total:room.rounds,results:room.results.slice(),
    lastResult:room.results.at(-1)||null,chat:room.chats.slice(-35),
    teamWon:room.phase==='finished'&&room.solved>=5
  };
}
module.exports={newGame,beginRound,finishRound,authorize,interact,viewFor,remaining,resumeTimer,createPuzzle,ROUNDS,ROUND_MS};
