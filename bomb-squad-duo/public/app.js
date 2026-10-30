'use strict';
(()=>{
  const app=document.getElementById('app');
  const conn=document.getElementById('connection');
  const toastEl=document.getElementById('toast');
  const LINK_ROOM=(new URL(location.href)).searchParams.get('room')?.trim().toUpperCase()||'';
  const URL_BASE=location.origin+location.pathname;
  let ws, state=null, joined=null, online=false, pendingResume=false, countdownAt=Date.now(), draft='', chatCount=0;
  let toastTimer;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const me=()=>state?.players?.[state.you];
  const send=(type,props={})=>{if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type,...props}));else toast('Connection lost. Reconnecting…');};
  function toast(message){toastEl.textContent=message;toastEl.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove('show'),3300);}
  function connect(){
    ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);
    ws.addEventListener('open',()=>{
      online=true;conn.classList.add('online');conn.innerHTML='<span class="indicator"></span> Server connected';
      const room=sessionStorage.getItem('bsd-room'),token=sessionStorage.getItem('bsd-token');
      if(room&&token){pendingResume=true;send('resume',{room,token});}
      else render();
    });
    ws.addEventListener('message',e=>{
      let m;try{m=JSON.parse(e.data)}catch{return;}
      if(m.type==='welcome'){
        pendingResume=false;
        joined={room:m.room,token:m.token,player:m.player};
        sessionStorage.setItem('bsd-room',m.room);sessionStorage.setItem('bsd-token',m.token);
        history.replaceState({},'',URL_BASE+'?room='+m.room);
        render();
      }
      if(m.type==='state'){
        if(!joined)return;
        const old=state;
        state=m;countdownAt=Date.now();
        if(old?.phase==='playing'&&m.phase==='result'&&m.lastResult){toast(m.lastResult.success?'🎉 Module secured! Well done!':'💥 Module lost! Next round is a fresh start.');}
        if(old?.phase==='playing'&&m.phase==='finished')toast('🏆 The mission is complete!');
        if(old?.phase==='playing'&&m.phase==='playing'&&old.puzzle?.strikes<m.puzzle?.strikes)toast('⚠️ Wrong move! Strike and time penalty.');
        if(old?.phase==='playing'&&m.phase==='playing'&&!old.puzzle?.authorized&&m.puzzle?.authorized)toast('✓ Authorized! The panel is unlocked.');
        render();
        if(m.chat?.length>chatCount){const scroller=document.querySelector('.chat-scroller');if(scroller)scroller.scrollTop=scroller.scrollHeight;}
        chatCount=m.chat?.length||0;
      }
      if(m.type==='error'){
        toast(m.message||'Something went wrong.');
        if(pendingResume){pendingResume=false;sessionStorage.removeItem('bsd-room');sessionStorage.removeItem('bsd-token');joined=null;state=null;render();}
      }
    });
    ws.addEventListener('close',()=>{
      online=false;conn.classList.remove('online');conn.innerHTML='<span class="indicator"></span> Reconnecting…';
      setTimeout(connect,1800);render();
    });
    ws.addEventListener('error',()=>{});
  }
  function timerNow(){if(!state||state.phase!=='playing')return 0;return Math.max(0,state.remainingMs-(state.paused?0:Date.now()-countdownAt));}
  function updateTimer(){
    const timer=document.getElementById('timer-num');const bar=document.getElementById('timer-bar');
    if(!timer)return;
    const left=timerNow();timer.textContent=`${String(Math.floor(left/60000)).padStart(2,'0')}:${String(Math.ceil(left%60000/1000)).padStart(2,'0')}`;
    if(bar){bar.style.width=`${Math.max(0,left/90000*100)}%`;bar.classList.toggle('urgent',left<20000);}
  }
  setInterval(updateTimer,140);
  const copy=async t=>{try{await navigator.clipboard.writeText(t);toast('Copied to clipboard!');}catch{toast('Copy this: '+t);}};
  const getRoomUrl=()=>URL_BASE+'?room='+joined.room;
  function enter(){
    return `<div class="entry">
      <section>
        <div class="eyebrow">⚡ Cooperative chaos, competitive glory</div>
        <h1 class="hero-title">ONE MISSION.<br><em>TWO MINDS.</em></h1>
        <p class="hero-desc">Your shared sci-fi control panel is acting up. One player reads the secret manual. The other races against the clock to unlock each puzzle. Save the ship together, then see who earns the most badges.</p>
        <div class="pill-row"><span class="feature-pill">🔐 Private room code</span><span class="feature-pill">⏱ 90-sec rounds</span><span class="feature-pill">🔄 Fair role swaps</span><span class="feature-pill">💬 Built-in team chat</span></div>
        <div class="mission-illustration"><div class="illustration-top"><span>STARSHIP AURORA // CONTROL SYSTEM</span><span>MISSION 08</span></div><div class="mock-wires"><div class="mock-wire"></div><div class="mock-wire"></div><div class="mock-wire"></div><div class="mock-wire"></div></div><div class="illustration-bottom">✳ SYSTEMS READY FOR TWO ✳</div></div>
      </section>
      <section class="panel entry-card"><div class="eyebrow">Your next date-night mission</div><h2>Welcome, agents.</h2><p class="subtle">Play on separate computers. You only need a browser, a friend, and a little trust.</p>
        <form class="form-set" id="create-form"><div><label class="field-label" for="create-name">Your agent name</label><input class="field" id="create-name" name="name" required maxlength="20" autocomplete="nickname" placeholder="e.g. Agent Moon" value="${esc(localStorage.getItem('bsd-name')||'')}"></div><button class="btn btn-primary btn-wide" ${!online?'disabled':''} type="submit">✳ Create private room →</button></form>
        <div class="divider-words">or join a partner</div>
        <form class="form-set" id="join-form"><div><label class="field-label" for="join-name">Your agent name</label><input class="field" id="join-name" required maxlength="20" placeholder="e.g. Agent Star" value="${esc(localStorage.getItem('bsd-name')||'')}"></div><div><label class="field-label" for="join-code">6-character room code</label><input class="field" id="join-code" maxlength="6" required style="letter-spacing:3px;text-transform:uppercase" placeholder="ABC123" value="${esc(LINK_ROOM)}"></div><button class="btn btn-wide" ${!online?'disabled':''} type="submit">Join mission →</button></form>
      </section>
    </div>`;
  }
  function playerCards(){return `<div class="cards-row">${state.players.map((p,i)=>`<div class="player-card"><div class="avatar">${i===0?'🧑‍🚀':'👩‍🚀'}</div><div class="small-label" style="color:var(--muted)">AGENT 0${i+1}${state.you===i?' · YOU':''}</div><div class="name">${esc(p.name)}</div><div class="muted-small ${p.connected?'status-online':'status-offline'}">${p.connected?'● Online':'○ Offline'}</div></div>`).join('')}</div>`;}
  function lobby(){return `<div class="lobby-layout"><section><span class="eyebrow">Mission control // Waiting area</span><h1 class="back-title">Better together.<br><span style="color:var(--aqua)">Dangerously fun.</span></h1><p class="subtle">Share the secret room code below. When both agents arrive, the room creator can launch your eight-round mission.</p>${playerCards()}<div class="hint-box"><strong>HOW THE GAME WORKS</strong><ol class="rules-list"><li>One of you becomes the <strong>Defuser</strong> and sees a puzzle panel.</li><li>The other becomes the <strong>Expert</strong> and sees a secret instruction manual.</li><li>Tell your partner the badge shown on the device. The Expert authorizes it and guides the Defuser through the correct moves.</li><li>Swap roles every round. Secure <strong>5 of 8 modules</strong> to win together; personal badge points decide the friendly individual winner.</li></ol><strong>Pro tip:</strong> Use the built-in chat, or call one another for maximum chaos!</div></section><aside class="panel room-card"><div class="small-label" style="color:var(--muted)">YOUR PRIVATE ROOM CODE</div><div class="room-code">${esc(joined.room)}</div><p class="subtle">Only share this with your partner.</p><div class="room-actions"><button class="btn" data-action="copycode">📋 Copy code</button><button class="btn" data-action="copylink">🔗 Copy invite link</button></div><div class="divider-words">agents ready</div><p class="subtle">${state.players.filter(p=>p.connected).length} of 2 online</p>${state.host?`<button class="btn btn-primary btn-wide" data-action="start" ${!state.players[1].connected||!online?'disabled':''}>🚀 Start mission</button>`:`<div class="hint-box">⏳ Waiting for the room creator to launch the mission…</div>`}</aside></div>`;}
  const wireStyle={CORAL:'#ff8193',CYAN:'#7fead8',LIME:'#b9ed95',GOLD:'#ffc875',VIOLET:'#b39bff'};
  function puzzleControls(p){
    if(p.kind==='glyphs')return `<div class="module-note">SELECT THE SYMBOLS IN EXACTLY THE RIGHT ORDER</div><div class="glyph-grid">${p.choices.map(item=>`<button class="control" data-action="interact" data-value="${esc(item)}">${esc(item)}</button>`).join('')}</div>`;
    if(p.kind==='wires')return `<div class="module-note">TAP TO DISCONNECT THE RIGHT WIRES IN SEQUENCE</div><div class="wire-grid">${p.choices.map(w=>`<button class="wire-btn" data-action="interact" data-value="${w}"><span class="wire-line" style="background:${wireStyle[w]};color:${wireStyle[w]}"></span><span>${w}</span></button>`).join('')}</div>`;
    if(p.kind==='circuits')return `<div class="module-note">ACTIVATE THREE SIGNAL PADS IN ORDER</div><div class="circuit-grid">${p.choices.map(w=>`<button class="circuit-btn" data-action="interact" data-value="${w}"><span class="orb" style="--orb:${wireStyle[w]}"></span>${w}</button>`).join('')}</div>`;
    return `<div class="module-note">THREE-DIGIT OVERRIDE CODE</div><div class="keypad-top">${esc(p.typed.padEnd(3,'·'))}</div><div class="keys">${['1','2','3','4','5','6','7','8','9','CLEAR','0','BACK'].map(n=>`<button class="key ${n==='CLEAR'?'clear':''}" data-action="interact" data-value="${n}">${n==='BACK'?'⌫':n==='CLEAR'?'CLR':n}</button>`).join('')}<button class="key confirm" data-action="interact" data-value="CONFIRM">✓ CONFIRM</button></div>`;
  }
  function manual(p){return `<div class="module-note" style="text-align:left">READ THE DEFUSER'S BADGE, THEN TRANSMIT THE MATCHING MANUAL ENTRY. GUIDE THEM THROUGH THE INSTRUCTION!</div><div class="manual">${p.manual.map(r=>`<div class="manual-row"><strong>${esc(r.label)}</strong><p>${esc(r.instruction)}</p><button class="btn ${p.authorized?'':'btn-gold'}" data-action="authorize" data-value="${esc(r.label)}" ${p.authorized?'disabled':''}>${p.authorized?'SENT':'TRANSMIT'}</button></div>`).join('')}</div>`;}
  function game(){
    const p=state.puzzle,defuser=state.role==='defuser';
    return `<div class="game-layout"><div class="main-column">
      <section class="panel"><div class="game-top"><div><div class="round-num">MISSION <b>${String(state.round).padStart(2,'0')} / ${state.rounds}</b> &nbsp; · &nbsp; ${state.solved} SECURED</div><div class="mission-track">${Array.from({length:state.rounds},(_,i)=>`<span class="${i===state.round-1?'now':state.results[i]?(state.results[i].success?'win':'lose'):''}"></span>`).join('')}</div></div><div class="timer-wrap"><span class="small-label subtle">TIME LEFT</span><span id="timer-num" class="timer-number">01:30</span></div></div><div class="timer-track"><div class="timer-progress" id="timer-bar"></div></div></section>
      <div class="role-banner"><div class="role-icon">${defuser?'🎛️':'📖'}</div><div><div class="tag">YOUR ROLE THIS ROUND</div><div class="role-text">${defuser?'DEFUSER':'EXPERT'}</div><div class="role-desc">${defuser?'Read the badge to your partner. Tap the correct controls.':'Read your manual, authorize the right badge, and guide your partner.'}</div></div></div>
      ${state.paused?'<div class="pause-banner">⏸ Mission paused because an agent disconnected. The clock will resume automatically when they return.</div>':''}
      <section class="panel"><div class="module-header"><div><div class="tag">${defuser?'DEVICE INTERFACE · LIVE':'CLASSIFIED FIELD MANUAL'}</div><h2>${esc(p.title)}</h2><p class="subtle" style="margin:0">${defuser?esc(p.description):'Find the correct badge in the manual and guide your partner.'}</p></div>${defuser?`<div><div class="small-label subtle">DEVICE BADGE</div><div class="label-chip">${esc(p.label)}</div></div>`:''}</div>
      <div class="status-strip"><span class="muted-small">${defuser?'STEP PROGRESS':'AUTHORIZATION'}</span>${defuser?`<strong>${p.progress} / ${p.stepsRequired}${p.kind==='keypad'?' · '+p.typed.length+' DIGITS':''}</strong>`:`<strong class="${p.authorized?'success-text':''}">${p.authorized?'✓ TRANSMITTED':'AWAITING EXPERT'}</strong>`}<div class="counter-dots">${Array.from({length:3},(_,i)=>`<i class="${i<p.strikes?'hit':''}"></i>`).join('')}</div><span class="muted-small">${p.strikes}/3 STRIKES</span></div>
      <div class="mod-panel"><div class="mod-content">${defuser?(p.authorized&&!state.paused?puzzleControls(p):`<div class="locked-shield"><div class="lock">${state.paused?'⏸':'🔒'}</div><h3>${state.paused?'Mission temporarily paused':'Awaiting expert authorization'}</h3><p>${state.paused?'Your partner is reconnecting. You will not lose time.':`Tell your partner the badge <strong>${esc(p.label)}</strong> and ask them to transmit the matching manual entry.`}</p></div>`):manual(p)}</div></div></section>
    </div><aside class="side-column"><section class="panel"><div class="tag">LIVE LEADERBOARD</div><h3 style="margin:7px 0 12px">Friendly rivalry 🏅</h3>${scoreboard()}<p class="muted-small">Both players earn badges for quick, clean rounds. Roles swap every round, so everyone gets four turns in each role.</p></section>
      <section class="panel"><div class="tag">TEAM OBJECTIVE</div><h3 style="margin:8px 0">Secure 5 of 8 modules</h3><p class="subtle">${state.solved} secured so far · ${Math.max(0,5-state.solved)} more needed to win together.</p><div class="mission-track">${Array.from({length:8},(_,i)=>`<span class="${i<state.solved?'win':''}"></span>`).join('')}</div></section>
      ${chatPanel()}</aside></div>`;
  }
  function scoreboard(){return state.players.map((p,i)=>`<div class="score-item"><div><div class="score-name">${esc(p.name)} ${i===state.you?'<span style="color:var(--aqua)">(You)</span>':''}</div><div class="role-small">${state.round>0?((state.round-1)%2===i?'Defuser':'Expert'):'Agent'} · ${p.connected?'Online':'Disconnected'}</div></div><div class="score-number">${p.score}</div></div>`).join('');}
  function chatPanel(){return `<section class="panel chat-panel"><div class="tag">SQUAD RADIO</div><h3 style="margin:5px 0">Team chat 💬</h3><div class="quick-msgs">${["What's the badge?","Check the manual!","I'm ready!","We got this 💙"].map(text=>`<button data-action="quickchat" data-value="${esc(text)}">${esc(text)}</button>`).join('')}</div><div class="chat-scroller" role="log">${state.chat.length?state.chat.map(c=>`<div class="chat-line ${c.from===state.you?'mine':''}"><b>${esc(state.players[c.from]?.name)}</b>${esc(c.text)}</div>`).join(''):'<div class="muted-small">No messages yet. Start by sharing your badge!</div>'}</div><form id="chat-form" class="chat-form"><input type="text" class="field" name="message" id="chat-text" aria-label="Team message" maxlength="180" placeholder="Type a message..." value="${esc(draft)}"><button class="btn btn-primary" type="submit">Send</button></form></section>`;}
  function result(){
    const r=state.lastResult,success=r?.success;
    const isLast=state.phase==='finished';
    const winner=state.players[0].score===state.players[1].score?-1:state.players[0].score>state.players[1].score?0:1;
    return `<div class="game-layout"><div class="main-column"><div class="panel end-panel"><div class="eyebrow">${isLast?'Operation complete':`Module ${state.round} / ${state.rounds}`}</div><div class="end-icon">${isLast?(state.teamWon?'🏆':'🚀'):(success?'✨':'⚡')}</div><div class="end-title">${isLast?(state.teamWon?'MISSION ACCOMPLISHED!':'MISSION COMPLETE'):(success?'MODULE SECURED!':'MODULE LOST!')}</div>
       <p class="end-desc">${isLast?state.teamWon?`Together you secured ${state.solved} of 8 modules and saved the starship! Amazing teamwork.`:`You secured ${state.solved} of 8 modules. The ship needs five; next mission, you've got this!`:success?'Nicely played! A little teamwork, a little speed, and a whole lot of trust.':'No worries. Every good squad has a messy round. New roles and a fresh device are coming up.'}</p>
       ${!isLast?`<div class="tag">THIS ROUND'S BADGES</div><div class="result-score">${state.players.map((p,i)=>`<div><div class="small-label subtle">${esc(p.name)}</div><div class="big">+${r.awarded[i]}</div></div>`).join('')}</div><p class="muted-small">${r.strikes} strikes · ${success?'Success':'Unsuccessful'} · ${Math.ceil(r.remainingMs/1000)} seconds remaining</p>`:
        `<div class="result-score">${state.players.map((p,i)=>`<div><div class="small-label subtle">${esc(p.name)}</div><div class="big">${p.score}</div></div>`).join('')}</div><h3 style="margin:14px 0">${winner===-1?'🤝 A perfect badge-point tie!':`🏅 ${esc(state.players[winner].name)} wins the friendly badge challenge!`}</h3><p class="muted-small">Personal points are just for bragging rights. The real mission is won together.</p><div class="result-history">${state.results.map((s,i)=>`<span class="${s.success?'':'lost'}">${i+1}. ${s.success?'✓':'×'} ${esc(s.kind.toUpperCase())}</span>`).join('')}</div>`}
       ${isLast?state.host?`<button class="btn btn-primary" data-action="rematch" style="margin-top:27px" ${state.players.some(p=>!p.connected)?'disabled':''}>↻ Start a rematch</button>`:`<p class="hint-box" style="margin-top:26px">Waiting for the host to start a rematch…</p>`:`<div class="ready-strip">${state.players.map((p,i)=>`<span class="ready-chip ${state.ready[i]?'yes':''}">${esc(p.name)} ${state.ready[i]?'✓ READY':'⌛ WAITING'}</span>`).join('')}</div><button class="btn btn-primary" data-action="ready" ${state.ready[state.you]?'disabled':''}>${state.ready[state.you]?'✓ Ready — waiting for partner':'Ready for next mission →'}</button>`}
      </div></div><aside class="side-column"><section class="panel"><div class="tag">MISSION STATS</div><h3>Squad performance</h3><p><strong>${state.solved} / 8</strong> modules secured</p><p class="subtle">${Math.round(state.solved/8*100)}% success rate</p><div class="mission-track">${state.results.map(r=>`<span class="${r.success?'win':'lose'}"></span>`).join('')}</div><div class="divider-words">scoreboard</div>${scoreboard()}</section>${!isLast?chatPanel():`<section class="panel"><div class="eyebrow">Play again?</div><p class="subtle">You can run another full eight-module mission in the same room. Your roles reset and your scoreboard starts fresh.</p><button class="btn btn-wide" data-action="copylink">Copy invitation link</button></section>`}</aside></div>`;
  }
  function render(){
    const focusChat=document.activeElement?.id==='chat-text';
    const selection=focusChat?document.activeElement.selectionStart:null;
    if(pendingResume&&!state){app.innerHTML='<div class="loading">Reconnecting to your squad…</div>';return;}
    if(!state||!joined)app.innerHTML=enter();
    else if(state.phase==='lobby')app.innerHTML=lobby();
    else if(state.phase==='playing')app.innerHTML=game();
    else app.innerHTML=result();
    updateTimer();
    if(focusChat){const input=document.getElementById('chat-text');if(input){input.focus();if(selection!==null)input.setSelectionRange(Math.min(selection,input.value.length),Math.min(selection,input.value.length));}}
  }
  document.addEventListener('input',e=>{if(e.target?.id==='chat-text')draft=e.target.value;});
  document.addEventListener('submit',e=>{
    const form=e.target;
    if(!['create-form','join-form','chat-form'].includes(form.id))return;
    e.preventDefault();
    if(form.id==='create-form'){const name=form.elements.name.value.trim();if(!name)return;localStorage.setItem('bsd-name',name);send('create',{name});}
    if(form.id==='join-form'){const name=form.querySelector('#join-name').value.trim(),room=form.querySelector('#join-code').value.trim().toUpperCase();if(!name||room.length!==6){toast('Please enter a name and six-character room code.');return;}localStorage.setItem('bsd-name',name);send('join',{name,room});}
    if(form.id==='chat-form'){const text=draft.trim();if(!text)return;send('chat',{text});draft='';const el=document.getElementById('chat-text');if(el)el.value='';}
  });
  document.addEventListener('click',e=>{
    const btn=e.target.closest('button[data-action]');if(!btn||btn.disabled)return;
    const act=btn.dataset.action,val=btn.dataset.value;
    if(act==='copycode')return copy(joined.room);
    if(act==='copylink')return copy(getRoomUrl());
    if(act==='quickchat')return send('chat',{text:val});
    if(['start','ready','rematch'].includes(act))return send(act);
    if(act==='authorize')return send('authorize',{label:val});
    if(act==='interact')return send('interact',{value:val});
  });
  render();connect();
})();
