(() => {
  const $ = (s) => document.querySelector(s);
  const els = {
    iframe: $('#vkPlayer'), shell: $('#videoShell'), canvas: $('#drawCanvas'), banner: $('#coachBanner'),
    url: $('#videoUrl'), load: $('#loadBtn'), status: $('.status'), statusText: $('#statusText'),
    timeChip: $('#timeChip'), timeInput: $('#markerTime'), playerName: $('#playerName'),
    note: $('#markerNote'), form: $('#markerForm'), markers: $('#markers'), empty: $('#emptyState'),
    count: $('#markerCount'), search: $('#searchMarkers'), sort: $('#sortMarkers'),
    capture: $('#captureTimeBtn'), undo: $('#undoBtn'), clear: $('#clearBtn'), width: $('#lineWidth'),
    exportBtn: $('#exportBtn'), importBtn: $('#importBtn'), importInput: $('#importInput'), hint: $('#drawHint'), template: $('#markerTemplate')
  };
  const ctx = els.canvas.getContext('2d');
  const state = { player:null, current:0, tool:'cursor', color:'#ff4d5e', drawing:false, start:null, draft:null, strokes:[], markers:[], videoKey:'-123531646_456239405' };

  function parseVkUrl(value) {
    const match = String(value).match(/(?:video|live)(-?\d+)_(\d+)/);
    return match ? { oid:match[1], id:match[2], key:`${match[1]}_${match[2]}` } : null;
  }
  function embedUrl(v) { return `https://vkvideo.ru/video_ext.php?oid=${encodeURIComponent(v.oid)}&id=${encodeURIComponent(v.id)}&hd=2&js_api=1`; }
  function formatTime(seconds) {
    seconds = Math.max(0, Math.floor(Number(seconds)||0));
    const h=Math.floor(seconds/3600), m=Math.floor(seconds%3600/60), s=seconds%60;
    return h ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  function parseTime(value) {
    const p=String(value).trim().split(':').map(Number);
    if (!p.length || p.some(Number.isNaN)) return NaN;
    if (p.length===1) return p[0];
    if (p.length===2) return p[0]*60+p[1];
    return p[p.length-3]*3600+p[p.length-2]*60+p[p.length-1];
  }
  function storageKey(){ return `hockey-review:${state.videoKey}`; }
  function save(){ localStorage.setItem(storageKey(), JSON.stringify(state.markers)); }
  function loadSaved(){
    try { state.markers=JSON.parse(localStorage.getItem(storageKey())||'[]'); }
    catch { state.markers=[]; }
    renderMarkers();
  }
  function setStatus(kind,text){ els.status.className=`status ${kind||''}`; els.statusText.textContent=text; }
  function setPaused(paused){ els.shell.classList.toggle('paused',Boolean(paused)); }
  function initPlayer(){
    if (!window.VK?.VideoPlayer) { setStatus('error','Не удалось загрузить API VK'); return; }
    try {
      state.player?.destroy?.();
      state.player=VK.VideoPlayer(els.iframe);
      state.player.on('inited',()=>setStatus('ready','VK Видео подключено'));
      state.player.on('timeupdate',(e)=>{ state.current=e.time||0; els.timeChip.textContent=formatTime(state.current); });
      state.player.on('started',()=>{ setPaused(false); setStatus('ready','Видео воспроизводится'); });
      state.player.on('resumed',()=>{ setPaused(false); setStatus('ready','Видео воспроизводится'); });
      state.player.on('paused',(e)=>{ state.current=e.time||state.current; els.timeChip.textContent=formatTime(state.current); setPaused(true); setStatus('ready','Пауза — можно отметить эпизод'); });
      state.player.on('error',()=>setStatus('error','VK не разрешил воспроизведение'));
    } catch { setStatus('error','Плеер VK недоступен'); }
  }
  function loadVideo(){
    const parsed=parseVkUrl(els.url.value);
    if (!parsed) { setStatus('error','Проверьте ссылку на VK Видео'); return; }
    state.videoKey=parsed.key; state.current=0; state.strokes=[]; setPaused(false); els.timeChip.textContent='00:00'; redraw();
    els.iframe.src=embedUrl(parsed);
    setStatus('','Подключаем VK Видео…');
    els.iframe.onload=()=>initPlayer();
    loadSaved();
  }

  function resizeCanvas(){
    const r=els.shell.getBoundingClientRect(), dpr=Math.min(devicePixelRatio||1,2);
    els.canvas.width=Math.round(r.width*dpr); els.canvas.height=Math.round(r.height*dpr);
    els.canvas.style.width=`${r.width}px`; els.canvas.style.height=`${r.height}px`;
    ctx.setTransform(dpr,0,0,dpr,0,0); redraw();
  }
  function point(e){ const r=els.canvas.getBoundingClientRect(); return {x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height}; }
  function px(p){ const r=els.canvas.getBoundingClientRect(); return {x:p.x*r.width,y:p.y*r.height}; }
  function drawStroke(s){
    if (!s?.points?.length) return;
    ctx.save(); ctx.strokeStyle=s.color; ctx.fillStyle=s.color; ctx.lineWidth=s.width; ctx.lineCap='round'; ctx.lineJoin='round';
    const pts=s.points.map(px), a=pts[0], b=pts[pts.length-1];
    ctx.beginPath();
    if (s.tool==='pen') { ctx.moveTo(a.x,a.y); pts.slice(1).forEach(p=>ctx.lineTo(p.x,p.y)); }
    if (s.tool==='arrow') { ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); }
    if (s.tool==='circle') { const rx=Math.abs(b.x-a.x)/2, ry=Math.abs(b.y-a.y)/2; ctx.ellipse((a.x+b.x)/2,(a.y+b.y)/2,Math.max(rx,1),Math.max(ry,1),0,0,Math.PI*2); }
    if (s.tool==='rect') { ctx.rect(a.x,a.y,b.x-a.x,b.y-a.y); }
    ctx.stroke();
    if (s.tool==='arrow') {
      const ang=Math.atan2(b.y-a.y,b.x-a.x), size=14+s.width;
      ctx.beginPath(); ctx.moveTo(b.x,b.y); ctx.lineTo(b.x-size*Math.cos(ang-Math.PI/6),b.y-size*Math.sin(ang-Math.PI/6)); ctx.lineTo(b.x-size*Math.cos(ang+Math.PI/6),b.y-size*Math.sin(ang+Math.PI/6)); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  function redraw(){ ctx.clearRect(0,0,els.canvas.width,els.canvas.height); state.strokes.forEach(drawStroke); if(state.draft) drawStroke(state.draft); }
  function selectTool(tool){
    state.tool=tool; els.shell.classList.toggle('drawing',tool!=='cursor');
    document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));
    if(tool!=='cursor'){ state.player?.pause(); setPaused(true); els.hint.textContent='Рисуйте поверх остановленного кадра. При переходе к другой метке рисунок очистится.'; }
    else els.hint.textContent='Выберите инструмент рисования — видео автоматически остановится. При переходе к другой метке рисунок очистится.';
  }
  els.canvas.addEventListener('pointerdown',(e)=>{
    if(state.tool==='cursor') return; e.preventDefault(); els.canvas.setPointerCapture(e.pointerId);
    state.drawing=true; state.start=point(e); state.draft={tool:state.tool,color:state.color,width:Number(els.width.value),points:[state.start]};
  });
  els.canvas.addEventListener('pointermove',(e)=>{
    if(!state.drawing) return; const p=point(e);
    if(state.tool==='pen') state.draft.points.push(p); else state.draft.points=[state.start,p]; redraw();
  });
  function endDraw(e){ if(!state.drawing)return; if(e) { const p=point(e); if(state.tool!=='pen') state.draft.points=[state.start,p]; } state.strokes.push(state.draft); state.draft=null; state.drawing=false; redraw(); }
  els.canvas.addEventListener('pointerup',endDraw); els.canvas.addEventListener('pointercancel',endDraw);

  function captureTime(){ const t=state.player?.getCurrentTime?.() ?? state.current; state.current=Number(t)||0; els.timeInput.value=formatTime(state.current); }
  function renderMarkers(){
    const q=els.search.value.trim().toLowerCase(); let items=state.markers.filter(m=>`${m.player} ${m.note}`.toLowerCase().includes(q));
    items.sort((a,b)=>els.sort.value==='new' ? b.created-a.created : a.time-b.time);
    els.markers.innerHTML=''; els.empty.hidden=items.length>0; els.count.textContent=state.markers.length;
    items.forEach(m=>{
      const node=els.template.content.firstElementChild.cloneNode(true);
      node.querySelector('time').textContent=formatTime(m.time); node.querySelector('strong').textContent=m.player; node.querySelector('p').textContent=m.note||'Без комментария';
      node.querySelector('.marker-main').addEventListener('click',()=>{
        state.player?.seek(m.time); state.player?.pause(); state.current=m.time; els.timeChip.textContent=formatTime(m.time);
        setPaused(true);
        state.strokes=[]; state.draft=null; redraw(); selectTool('cursor');
      });
      node.querySelector('.delete-marker').addEventListener('click',()=>{ state.markers=state.markers.filter(x=>x.id!==m.id); save(); renderMarkers(); });
      els.markers.append(node);
    });
  }
  els.form.addEventListener('submit',(e)=>{
    e.preventDefault(); const time=parseTime(els.timeInput.value);
    if(!Number.isFinite(time)){ els.timeInput.focus(); return; }
    state.markers.push({id:crypto.randomUUID(),time,player:els.playerName.value.trim(),note:els.note.value.trim(),created:Date.now()});
    save(); renderMarkers(); els.note.value=''; els.timeInput.value=''; state.strokes=[]; redraw(); selectTool('cursor');
  });
  function exportData(){
    const data={type:'hockey-match-review',version:2,video:els.url.value,exportedAt:new Date().toISOString(),markers:state.markers.map(m=>({time:m.time,player:m.player,note:m.note||'',created:m.created}))};
    const blobUrl=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    const a=document.createElement('a'); a.href=blobUrl; a.download=`match-review-${state.videoKey}.json`; a.click();
    setTimeout(()=>URL.revokeObjectURL(blobUrl),1000);
    setStatus('ready',`Экспортировано меток: ${state.markers.length}`);
  }
  function normalizeImportedMarkers(markers){
    if(!Array.isArray(markers)) return [];
    return markers.map(m=>{
      const time=Number(m?.time);
      return {id:crypto.randomUUID(),time,player:String(m?.player||'Без имени').trim().slice(0,120)||'Без имени',note:String(m?.note||'').trim().slice(0,5000),created:Number(m?.created)||Date.now()};
    }).filter(m=>Number.isFinite(m.time)&&m.time>=0);
  }
  async function importData(file){
    try {
      const data=JSON.parse(await file.text());
      const imported=normalizeImportedMarkers(data?.markers);
      if(!imported.length) throw new Error('В файле нет меток');
      const importedVideo=typeof data?.video==='string' ? data.video.trim() : '';
      if(importedVideo){
        if(!parseVkUrl(importedVideo)) throw new Error('В файле указана неверная ссылка VK Видео');
        els.url.value=importedVideo;
        loadVideo();
      }
      state.markers=imported; save(); renderMarkers();
      state.strokes=[]; state.draft=null; redraw(); selectTool('cursor');
      setStatus('ready',`Загружено меток: ${imported.length}`);
    } catch(error) {
      setStatus('error',error?.message||'Не удалось загрузить файл меток');
    } finally {
      els.importInput.value='';
    }
  }
  document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>selectTool(b.dataset.tool)));
  document.querySelectorAll('[data-color]').forEach(b=>b.addEventListener('click',()=>{ state.color=b.dataset.color; document.querySelectorAll('[data-color]').forEach(x=>x.classList.toggle('active',x===b)); }));
  els.undo.addEventListener('click',()=>{state.strokes.pop();redraw();}); els.clear.addEventListener('click',()=>{state.strokes=[];redraw();});
  els.capture.addEventListener('click',captureTime); els.load.addEventListener('click',loadVideo); els.url.addEventListener('keydown',(e)=>{if(e.key==='Enter')loadVideo();});
  els.search.addEventListener('input',renderMarkers); els.sort.addEventListener('change',renderMarkers); els.exportBtn.addEventListener('click',exportData);
  els.importBtn.addEventListener('click',()=>els.importInput.click());
  els.importInput.addEventListener('change',()=>{ const file=els.importInput.files?.[0]; if(file) importData(file); });
  new ResizeObserver(resizeCanvas).observe(els.shell);
  loadVideo();
})();
