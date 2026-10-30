'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const G=require('../server/game');
function room(){return G.newGame([{name:'Moon',connected:true},{name:'Star',connected:true}]);}
test('four puzzle types cycle, and later rounds add more manual entries',()=>{
  const kinds=[];
  for(let i=0;i<8;i++){
    const p=G.createPuzzle(i);kinds.push(p.kind);
    assert.equal(p.rows.length,p.tier===0?4:6);assert.ok(p.rows.find(r=>r.label===p.label));
    assert.equal(new Set(p.rows.map(r=>r.label)).size,p.rows.length);
  }
  assert.deepEqual(kinds,['glyphs','wires','circuits','keypad','wires','glyphs','keypad','circuits']);
});
test('only the right role can transmit and operate; no manual is leaked to the defuser',()=>{
  const r=room();G.beginRound(r,1000);
  const s0=G.viewFor(r,0,'ABCD23',2000),s1=G.viewFor(r,1,'ABCD23',2000);
  assert.equal(s0.puzzle.role,'defuser');assert.equal(s0.puzzle.manual,null);
  assert.equal(s1.puzzle.role,'expert');assert.equal(s1.puzzle.label,null);
  assert.equal(G.authorize(r,0,r.puzzle.label,2500),false);
  assert.equal(G.interact(r,0,r.puzzle.rows.find(x=>x.label===r.puzzle.label).steps[0],2600).ok,false);
  assert.equal(G.authorize(r,1,r.puzzle.label,3000),true);
  assert.equal(G.interact(r,1,r.puzzle.rows.find(x=>x.label===r.puzzle.label).steps[0],4000).ok,false);
});
test('complete a correctly authorized glyph puzzle; both receive points',()=>{
  const r=room();G.beginRound(r,1000);
  G.authorize(r,1,r.puzzle.label,6000);
  const steps=r.puzzle.rows.find(x=>x.label===r.puzzle.label).steps;
  for(let i=0;i<steps.length;i++)assert.equal(G.interact(r,0,steps[i],7000+i*300).ok,true);
  assert.equal(r.phase,'result');assert.equal(r.solved,1);
  assert.ok(r.scores[0]>0&&r.scores[1]>0);
  assert.equal(r.results[0].success,true);
  G.beginRound(r,20000);assert.equal(r.round,1);
  assert.equal(G.viewFor(r,1,'AAAAAA',20000).role,'defuser');
});
test('invalid moves add strikes and time penalties, three strikes lose a module',()=>{
  const r=room();G.beginRound(r,1000);G.authorize(r,1,r.puzzle.label,1100);
  const right=r.puzzle.rows.find(x=>x.label===r.puzzle.label).steps[0];
  const wrong=r.puzzle.choices.find(x=>x!==right);
  for(let i=0;i<3;i++)G.interact(r,0,wrong,2000+i*20);
  assert.equal(r.phase,'result');assert.equal(r.puzzle.strikes,3);
  assert.equal(r.solved,0);assert.equal(r.results[0].success,false);
  assert.equal(r.endAt,1000+G.ROUND_MS-3*6000);
});
test('reconnection pauses the clock without losing remaining time',()=>{
  const r=room();G.beginRound(r,10000);
  r.pauseAt=15000;assert.equal(G.remaining(r,25000),80000);
  G.resumeTimer(r,45000);assert.equal(G.remaining(r,45000),80000);
  assert.equal(r.pauseAt,0);
});
test('keypad validates full code, not each digit, and backspace',()=>{
  const r=room();for(let i=0;i<4;i++)G.beginRound(r,1000+i*100000);
  assert.equal(r.puzzle.kind,'keypad');
  const time=r.startAt+2000;
  assert.equal(G.authorize(r,0,r.puzzle.label,time),true);
  const code=r.puzzle.rows.find(x=>x.label===r.puzzle.label).steps;
  G.interact(r,1,'0',time+100);G.interact(r,1,'BACK',time+110);
  for(const digit of code)G.interact(r,1,digit,time+200);
  assert.equal(G.interact(r,1,'CONFIRM',time+300).solved,true);
  assert.equal(r.phase,'result');
});

test('eight rounds share victory and both agents operate every device once',()=>{
  const r=room(), types=[new Set(),new Set()];
  for(let n=0;n<8;n++){
    const now=10000+n*200000;
    G.beginRound(r,now);
    const defuser=n%2,expert=1-defuser;
    types[defuser].add(r.puzzle.kind);
    assert.equal(G.authorize(r,expert,r.puzzle.label,now+1000),true);
    const p=r.puzzle;const steps=p.rows.find(x=>x.label===p.label).steps;
    for(let i=0;i<steps.length;i++)G.interact(r,defuser,steps[i],now+3000+i*200);
    if(p.kind==='keypad')G.interact(r,defuser,'CONFIRM',now+4000);
    assert.equal(r.solved,n+1);
    assert.equal(r.phase,n===7?'finished':'result');
  }
  assert.equal(types[0].size,4);assert.equal(types[1].size,4);
  assert.equal(G.viewFor(r,0,'ABCDEF').teamWon,true);
  assert.ok(r.scores[0]>0&&r.scores[1]>0);
});


test('all difficulties generate solvable, varied and private puzzles across every round',()=>{
  for(const difficulty of Object.keys(G.DIFFICULTIES)){
    for(let round=0;round<8;round++){
      const r=room();r.difficulty=difficulty;
      for(let i=0;i<=round;i++)G.beginRound(r,1000+i*200000);
      const p=r.puzzle,defuser=round%2,expert=1-defuser;
      assert.equal(p.tier,G.tierFor(round,difficulty));
      const a=G.viewFor(r,defuser,'AAAAAA',r.startAt);
      const b=G.viewFor(r,expert,'AAAAAA',r.startAt);
      assert.equal(a.puzzle.manual,null);
      assert.equal(b.puzzle.label,null);
      assert.equal(b.puzzle.signal,null);
      assert.equal(b.puzzle.polarity,null);
      assert.equal(a.puzzle.stepsRequired,p.rows.find(x=>x.label===p.label).steps.length);
      if(p.tier){assert.ok(p.signal);assert.match(b.puzzle.manual[0].instruction,/SOLAR.*LUNAR/);}
      if(p.tier===2){assert.ok(p.polarity);assert.match(b.puzzle.manual[0].instruction,/REVERSED/);}
      assert.equal(G.remaining(r,r.startAt),G.DIFFICULTIES[difficulty].roundMs);
      assert.equal(G.authorize(r,expert,p.label,r.startAt+500),true);
      const steps=p.rows.find(x=>x.label===p.label).steps;
      for(let i=0;i<steps.length;i++)assert.equal(G.interact(r,defuser,steps[i],r.startAt+1000+i*200).ok,true);
      if(p.kind==='keypad')assert.equal(G.interact(r,defuser,'CONFIRM',r.startAt+5000).solved,true);
      assert.equal(r.results.at(-1).success,true);
    }
  }
});

test('stage-three branch and reversed polarity are evaluated on server',()=>{
  const p=G.createPuzzle(6,'intense');
  assert.equal(p.tier,2);
  const target=p.rows.find(row=>row.label===p.label);
  assert.deepEqual(target.steps,p.polarity==='REVERSED'?target.branches[p.signal].slice().reverse():target.branches[p.signal]);
  for(const row of p.rows)assert.equal(row.branches.SOLAR.length,5);
});

test('expert difficulty allows only two mistakes and raises the shared win threshold',()=>{
  const r=room();r.difficulty='intense';G.beginRound(r,1000);
  const config=G.DIFFICULTIES.intense;
  assert.equal(G.remaining(r,1000),config.roundMs);
  G.authorize(r,1,r.puzzle.label,1200);
  const first=r.puzzle.rows.find(x=>x.label===r.puzzle.label).steps[0];
  const wrong=r.puzzle.choices.find(x=>x!==first);
  G.interact(r,0,wrong,1500);assert.equal(r.phase,'playing');
  G.interact(r,0,wrong,1800);assert.equal(r.phase,'result');
  assert.equal(r.endAt,1000+config.roundMs-2*config.penaltyMs);
  r.phase='finished';r.solved=5;
  assert.equal(G.viewFor(r,0,'AAAAAA').teamWon,false);
  r.solved=6;
  assert.equal(G.viewFor(r,0,'AAAAAA').teamWon,true);
});

test('late actions cannot solve a puzzle after the clock has expired',()=>{
  const r=room();G.beginRound(r,1000);
  assert.equal(G.authorize(r,1,r.puzzle.label,r.endAt+1),false);
  assert.equal(r.phase,'result');
  assert.equal(r.solved,0);
});


test('progressive challenge is symmetric across both players in every difficulty',()=>{
  for(const key of Object.keys(G.DIFFICULTIES)){
    const byPlayer=[[],[]];
    for(let i=0;i<8;i++)byPlayer[i%2].push(G.tierFor(i,key));
    assert.deepEqual(byPlayer[0].sort(),byPlayer[1].sort(),key);
  }
});
