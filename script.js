/* ===================== STORAGE ===================== */
const DB = {
  get(k, fallback){ try{ return JSON.parse(localStorage.getItem(k)) ?? fallback; }catch{ return fallback; } },
  set(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
};

const ADMIN_PASSWORD = "444";

let state = {
  user: null,
  chatTimer: null,
  currentSection: 'homework',
  currentCalc: 'basic',
  basicExpr: '',
  sciExpr: ''
};

/* ===================== HELPERS ===================== */
function $(id){ return document.getElementById(id); }
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

/* ===================== TOAST ===================== */
function toast(msg, type='success'){
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show ' + (type === 'error' ? 'error' : type === 'info' ? 'info' : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=> t.className = 'toast', 2600);
}

/* ===================== CUSTOM MODAL ===================== */
function showModal({title, message, icon='✓', iconType='', buttons}){
  $('modalIcon').textContent = icon;
  $('modalIcon').className = 'modal-icon ' + iconType;
  $('modalTitle').textContent = title;
  $('modalMsg').textContent = message;
  const actions = $('modalActions');
  actions.innerHTML = '';
  const btns = buttons || [{label:'OK', style:'', onClick: closeModal}];
  btns.forEach(b => {
    const el = document.createElement('button');
    el.textContent = b.label;
    if(b.style) el.className = b.style;
    el.onclick = () => { closeModal(); if(b.onClick) b.onClick(); };
    actions.appendChild(el);
  });
  $('modalOverlay').classList.remove('hidden');
}
function closeModal(){ $('modalOverlay').classList.add('hidden'); }
function confirmModal(title, message, onYes){
  showModal({
    title, message, icon:'?', iconType:'question',
    buttons:[
      {label:'Cancel', style:'secondary'},
      {label:'Yes', style:'danger', onClick:onYes}
    ]
  });
}

/* ===================== LOGIN ===================== */
function switchTab(t){
  $('tabStudent').classList.toggle('active', t==='student');
  $('tabAdmin').classList.toggle('active', t==='admin');
  $('studentLogin').classList.toggle('hidden', t==='admin');
  $('adminLogin').classList.toggle('hidden', t==='student');
}

function studentLogin(){
  const user = $('sUser').value.trim();
  const code = $('sCode').value.trim().toUpperCase();
  if(!user){ return toast('Please choose a username', 'error'); }
  if(!code){ return toast('Please enter your code', 'error'); }

  const codes = DB.get('codes', []);
  const idx = codes.findIndex(c => c.code === code && !c.used && c.enabled !== false);
  if(idx === -1){ return toast('Invalid, used, or disabled code', 'error'); }

  codes[idx].used = true;
  codes[idx].usedBy = user;
  DB.set('codes', codes);

  DB.set('session', { name: user, isAdmin: false });
  enterApp({ name: user, isAdmin: false });
}

function adminLogin(){
  if($('aPass').value !== ADMIN_PASSWORD){ return toast('Wrong password', 'error'); }
  DB.set('session', { name: 'Admin', isAdmin: true });
  enterApp({ name: 'Admin', isAdmin: true });
}

function logout(){
  confirmModal('Logout', 'Are you sure you want to logout?', () => {
    DB.set('session', null);
    state.user = null;
    clearInterval(state.chatTimer);
    $('app').classList.add('hidden');
    $('loginScreen').classList.remove('hidden');
    $('sUser').value = ''; $('sCode').value = ''; $('aPass').value = '';
  });
}

/* ===================== ENTER APP ===================== */
function enterApp(user){
  state.user = user;
  $('loginScreen').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('whoami').textContent = user.name + (user.isAdmin ? ' (Admin)' : '');

  document.querySelectorAll('.admin-only').forEach(el => {
    el.classList.toggle('hidden', !user.isAdmin);
  });

  showSection('homework');
  renderAll();

  clearInterval(state.chatTimer);
  state.chatTimer = setInterval(renderChat, 2000);
}

/* ===================== SECTION NAV ===================== */
function showSection(name){
  state.currentSection = name;
  document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
  const sec = $('sec-' + name);
  if(sec) sec.classList.remove('hidden');

  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.section === name);
  });

  if(name === 'chat') renderChat();
  if(name === 'calc' && state.currentCalc === 'graph') drawGraph();
}

/* ===================== ACCESS CODES ===================== */
function generateCode(){
  const code = 'MATH-' + Math.random().toString(36).substring(2,7).toUpperCase();
  const codes = DB.get('codes', []);
  codes.push({ code, used: false, enabled: true });
  DB.set('codes', codes);
  renderCodes();
  showModal({
    title:'Code Created!',
    message:'Share this code with a student: ' + code,
    icon:'🔑',
    buttons:[
      {label:'Copy', style:'secondary', onClick:() => copyText(code)},
      {label:'Done', style:'', onClick: () => {}}
    ]
  });
}

function renderCodes(){
  const codes = DB.get('codes', []);
  const el = $('codesList');
  if(!el) return;
  if(!codes.length){
    el.innerHTML = '<div class="empty">No codes yet. Click "Generate New Code".</div>';
    return;
  }
  el.innerHTML = codes.map((c,i) => {
    const disabled = c.enabled === false;
    const status = disabled ? 'off' : c.used ? 'used' : 'available';
    const label = disabled ? 'disabled' : c.used ? 'used by ' + escapeHtml(c.usedBy || '?') : 'available';
    return `<div class="code-row ${disabled?'disabled':''}">
      <span class="code-text">${c.code}</span>
      <span class="code-status ${status}">${label}</span>
      <div class="code-actions">
        <button class="icon-btn" onclick="copyText('${c.code}')" title="Copy">📋</button>
        <button class="icon-btn danger" onclick="toggleCode(${i})" title="${disabled?'Enable':'Disable'}">${disabled?'✅':'🚫'}</button>
        <button class="icon-btn danger" onclick="deleteCode(${i})" title="Delete">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

function copyText(text){
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(
      () => toast('Copied: ' + text),
      () => fallbackCopy(text)
    );
  } else {
    fallbackCopy(text);
  }
}
function fallbackCopy(text){
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); toast('Copied: ' + text); }
  catch(e){ toast('Copy failed', 'error'); }
  document.body.removeChild(ta);
}

function toggleCode(i){
  const codes = DB.get('codes', []);
  if(!codes[i]) return;
  codes[i].enabled = codes[i].enabled === false ? true : false;
  DB.set('codes', codes);
  renderCodes();
  toast(codes[i].enabled ? 'Code enabled' : 'Code disabled', 'info');
}
function deleteCode(i){
  const codes = DB.get('codes', []);
  if(!codes[i]) return;
  confirmModal('Delete Code', 'Delete code ' + codes[i].code + '?', () => {
    codes.splice(i,1);
    DB.set('codes', codes);
    renderCodes();
    toast('Code deleted');
  });
}

/* ===================== HOMEWORK ===================== */
function addHomework(){
  const title = $('hwTitle').value.trim();
  const desc  = $('hwDesc').value.trim();
  const due   = $('hwDue').value;
  const file  = $('hwFile').files[0];

  if(!title){ return toast('Enter a title', 'error'); }

  const save = (fileData, fileType, fileName) => {
    const hw = DB.get('homework', []);
    hw.unshift({
      id: Date.now(), title, desc, due,
      file: fileData || '', fileType: fileType || '', fileName: fileName || ''
    });
    DB.set('homework', hw);
    $('hwTitle').value=''; $('hwDesc').value=''; $('hwDue').value=''; $('hwFile').value='';
    renderAll();
    toast('Homework posted');
  };

  if(file){
    if(file.size > 3 * 1024 * 1024){
      return toast('File too large (max 3MB)', 'error');
    }
    const reader = new FileReader();
    reader.onload = e => save(e.target.result, file.type, file.name);
    reader.readAsDataURL(file);
  } else {
    save();
  }
}

function homeworkAttachmentHtml(h){
  if(!h.file) return '';
  if(h.fileType && h.fileType.startsWith('image/')){
    return `<div class="hw-attach"><img src="${h.file}" alt="attachment"></div>`;
  }
  return `<div class="hw-attach">
    <a href="${h.file}" download="${escapeHtml(h.fileName || 'file.pdf')}">📄 Download ${escapeHtml(h.fileName || 'attachment')}</a>
  </div>`;
}

function renderHomework(){
  const hw = DB.get('homework', []);
  const list = $('hwList');
  if(list){
    list.innerHTML = hw.length
      ? hw.map(h => `<div class="hw-item">
          <h4>${escapeHtml(h.title)}</h4>
          <p>${escapeHtml(h.desc)}</p>
          ${h.due ? `<small>Due: ${h.due}</small>` : ''}
          ${homeworkAttachmentHtml(h)}
        </div>`).join('')
      : '<div class="empty">No homework posted yet.</div>';
  }

  const adminList = $('hwAdminList');
  if(adminList){
    adminList.innerHTML = hw.length
      ? hw.map(h => `<div class="hw-item">
          <button class="del danger small" onclick="delHomework(${h.id})">Delete</button>
          <h4>${escapeHtml(h.title)}</h4>
          <p>${escapeHtml(h.desc)}</p>
          ${h.due ? `<small>Due: ${h.due}</small>` : ''}
          ${homeworkAttachmentHtml(h)}
        </div>`).join('')
      : '<div class="empty">No homework yet.</div>';
  }
}
function delHomework(id){
  confirmModal('Delete Homework', 'Delete this homework post?', () => {
    DB.set('homework', DB.get('homework', []).filter(h => h.id !== id));
    renderAll();
    toast('Homework deleted');
  });
}

/* ===================== CHAT ===================== */
function sendChat(){
  const txt = $('chatInput').value.trim();
  if(!txt) return;
  const msgs = DB.get('chat', []);
  msgs.push({ id: Date.now(), user: state.user.name, text: txt, ts: Date.now() });
  if(msgs.length > 200) msgs.splice(0, msgs.length - 200);
  DB.set('chat', msgs);
  $('chatInput').value = '';
  renderChat();
}
function renderChat(){
  if(state.currentSection !== 'chat') return;
  const msgs = DB.get('chat', []);
  const box = $('chatBox');
  if(!box) return;
  const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
  box.innerHTML = msgs.length
    ? msgs.map(m => {
        const mine = m.user === state.user.name;
        const time = new Date(m.ts).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
        return `<div class="msg ${mine?'mine':'other'}">
          ${escapeHtml(m.text)}
          <small>${escapeHtml(m.user)} • ${time}</small>
        </div>`;
      }).join('')
    : '<div class="empty">No messages yet. Say hi!</div>';
  if(atBottom) box.scrollTop = box.scrollHeight;
}
function clearChat(){
  confirmModal('Clear Chat', 'Delete all chat messages?', () => {
    DB.set('chat', []);
    renderChat();
    toast('Chat cleared');
  });
}

/* ===================== LEADERBOARD ===================== */
function addMark(){
  const name = $('mName').value.trim();
  const marks = Number($('mMarks').value);
  if(!name){ return toast('Enter a name', 'error'); }
  if(isNaN(marks) || marks < 0){ return toast('Enter valid marks', 'error'); }
  const m = DB.get('marks', []);
  m.push({ id: Date.now(), name, marks });
  DB.set('marks', m);
  $('mName').value = ''; $('mMarks').value = '';
  renderAll();
  toast('Marks added');
}
function renderLeaderboard(){
  const marks = DB.get('marks', []);
  const sorted = [...marks].sort((a,b) => b.marks - a.marks).slice(0,10);
  const lb = $('leaderboard');
  if(lb){
    lb.innerHTML = sorted.length
      ? sorted.map((s,i) => {
          const cls = i===0?'gold':i===1?'silver':i===2?'bronze':'';
          return `<div class="leader-row">
            <div class="rank ${cls}">${i+1}</div>
            <div class="name">${escapeHtml(s.name)}</div>
            <div class="marks">${s.marks}</div>
          </div>`;
        }).join('')
      : '<div class="empty">No marks uploaded yet.</div>';
  }

  const ml = $('marksList');
  if(ml){
    ml.innerHTML = marks.length
      ? marks.map(m => `<div class="hw-item">
          <button class="del danger small" onclick="delMark(${m.id})">Delete</button>
          <strong>${escapeHtml(m.name)}</strong> — ${m.marks}
        </div>`).join('')
      : '<div class="empty">No marks yet.</div>';
  }
}
function delMark(id){
  DB.set('marks', DB.get('marks', []).filter(m => m.id !== id));
  renderAll();
}

/* ===================== SHOP ===================== */
function addShopItem(){
  const name = $('shopName').value.trim();
  const desc = $('shopDesc').value.trim();
  const price = Number($('shopPrice').value);
  const file = $('shopImg').files[0];
  if(!name){ return toast('Enter a name', 'error'); }
  if(isNaN(price) || price < 0){ return toast('Enter valid price', 'error'); }

  const save = (imgData) => {
    const items = DB.get('shop', []);
    items.unshift({ id: Date.now(), name, desc, price, img: imgData || '' });
    DB.set('shop', items);
    $('shopName').value=''; $('shopDesc').value=''; $('shopPrice').value=''; $('shopImg').value='';
    renderAll();
    toast('Item added');
  };

  if(file){
    if(file.size > 2 * 1024 * 1024){
      return toast('Image too large (max 2MB)', 'error');
    }
    const reader = new FileReader();
    reader.onload = e => save(e.target.result);
    reader.readAsDataURL(file);
  } else {
    save('');
  }
}
function renderShop(){
  const items = DB.get('shop', []);
  const grid = $('shopGrid');
  if(grid){
    grid.innerHTML = items.length
      ? items.map(it => `<div class="shop-item">
          ${it.img ? `<img src="${it.img}" alt="">` : `<img alt="" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='150'><rect width='200' height='150' fill='%23334155'/><text x='100' y='80' font-family='sans-serif' font-size='14' fill='%2394a3b8' text-anchor='middle'>No image</text></svg>">`}
          <div class="info">
            <h4>${escapeHtml(it.name)}</h4>
            <p>${escapeHtml(it.desc)}</p>
            <div class="price">$${it.price.toFixed(2)}</div>
          </div>
        </div>`).join('')
      : '<div class="empty">No items yet.</div>';
  }

  const al = $('shopAdminList');
  if(al){
    al.innerHTML = items.length
      ? items.map(it => `<div class="hw-item">
          <button class="del danger small" onclick="delShop(${it.id})">Delete</button>
          <strong>${escapeHtml(it.name)}</strong> — $${it.price.toFixed(2)}<br>
          <small>${escapeHtml(it.desc)}</small>
        </div>`).join('')
      : '<div class="empty">No items yet.</div>';
  }
}
function delShop(id){
  DB.set('shop', DB.get('shop', []).filter(s => s.id !== id));
  renderAll();
}

/* ===================== RESET ===================== */
function clearAll(){
  confirmModal('Reset Everything', 'This erases ALL data (homework, chat, marks, shop, codes). Continue?', () => {
    ['homework','chat','marks','shop','codes'].forEach(k => localStorage.removeItem(k));
    renderAll();
    toast('Everything reset');
  });
}

/* ===================== CALCULATOR — BASIC ===================== */
function switchCalc(t){
  state.currentCalc = t;
  document.querySelectorAll('.calc-panel').forEach(p => p.classList.add('hidden'));
  const panel = $('calc-' + t);
  if(panel) panel.classList.remove('hidden');
  document.querySelectorAll('.calc-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.calc === t);
  });
  if(t === 'graph') drawGraph();
}

function basicInput(ch){
  state.basicExpr += ch;
  updateBasicDisplay();
}
function basicClear(){
  state.basicExpr = '';
  $('basicHistory').innerHTML = '&nbsp;';
  updateBasicDisplay();
}
function basicBack(){
  state.basicExpr = state.basicExpr.slice(0,-1);
  updateBasicDisplay();
}
function updateBasicDisplay(){
  $('basicOutput').textContent = state.basicExpr || '0';
}
function basicEquals(){
  if(!state.basicExpr) return;
  try {
    const result = safeEval(state.basicExpr);
    $('basicHistory').textContent = state.basicExpr + ' =';
    $('basicOutput').textContent = result;
    state.basicExpr = String(result);
  } catch(e){
    toast('Invalid expression', 'error');
  }
}

/* ===================== CALCULATOR — SCIENTIFIC ===================== */
function sciInput(ch){ state.sciExpr += ch; updateSciDisplay(); }
function sciFn(fn){
  if(fn === 'pi'){ state.sciExpr += 'Math.PI'; }
  else if(fn === 'e'){ state.sciExpr += 'Math.E'; }
  else if(fn === 'sqrt'){ state.sciExpr += 'Math.sqrt('; }
  else if(fn === '^'){ state.sciExpr += '**'; }
  else if(fn === 'fact'){ state.sciExpr += '!'; }
  else { state.sciExpr += 'Math.' + fn + '('; }
  updateSciDisplay();
}
function sciClear(){
  state.sciExpr = '';
  $('sciHistory').innerHTML = '&nbsp;';
  updateSciDisplay();
}
function sciBack(){
  state.sciExpr = state.sciExpr.slice(0,-1);
  updateSciDisplay();
}
function updateSciDisplay(){
  $('sciOutput').textContent = state.sciExpr || '0';
}
function sciEquals(){
  if(!state.sciExpr) return;
  try {
    let expr = state.sciExpr;
    // handle factorial: replace number! with fact(number)
    expr = expr.replace(/(\d+(\.\d+)?)!/g, (_, n) => 'fact(' + n + ')');
    const result = safeEval(expr);
    $('sciHistory').textContent = state.sciExpr + ' =';
    $('sciOutput').textContent = result;
    state.sciExpr = String(result);
  } catch(e){
    toast('Invalid expression', 'error');
  }
}

/* ===================== SAFE EVAL ===================== */
function factorial(n){
  n = Math.floor(n);
  if(n < 0) return NaN;
  if(n > 170) return Infinity;
  let r = 1;
  for(let i = 2; i <= n; i++) r *= i;
  return r;
}

function safeEval(expr){
  // Whitelist characters and words
  // Replace Math functions are expected as Math.sin etc
  // Convert simple ^ to ** for user ease
  let clean = expr.replace(/\^/g, '**');
  // Allow: digits, operators, parentheses, dot, spaces, Math.xxx, PI, E, fact(
  // Basic sanity check: reject anything with letters except allowed tokens
  const allowed = /^[0-9+\-*/%().\s]*(Math\.(sin|cos|tan|log|ln|sqrt|abs|PI|E))*[0-9+\-*/%().\s]*$/;
  // Simpler approach: strip known function names and check remainder
  let test = clean
    .replace(/Math\.(sin|cos|tan|log|sqrt|abs|PI|E|round|floor|ceil|pow|max|min)/g,'')
    .replace(/fact\(/g,'')
    .replace(/Math\.LN2|Math\.LN10/g,'');
  if(/[a-zA-Z]/.test(test)){
    throw new Error('Invalid characters');
  }
  // Build evaluator with whitelisted globals
  const fn = new Function('Math','fact','sin','cos','tan','log','ln','sqrt','abs','PI','E', 'return (' + clean + ');');
  const result = fn(
    Math,
    factorial,
    Math.sin, Math.cos, Math.tan,
    Math.log10,
    Math.log,
    Math.sqrt, Math.abs,
    Math.PI, Math.E
  );
  if(typeof result !== 'number' || !isFinite(result) && result !== Infinity){
    throw new Error('Bad result');
  }
  // Round tiny float errors
  return Math.round(result * 1e10) / 1e10;
}

/* ===================== GRAPH ===================== */
function drawGraph(){
  const canvas = $('graphCanvas');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);

  // background
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0,0,W,H);

  // grid
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  const step = 40;
  for(let x = 0; x < W; x += step){
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke();
  }
  for(let y = 0; y < H; y += step){
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
  }

  // axes
  const cx = W/2, cy = H/2;
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0,cy); ctx.lineTo(W,cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx,0); ctx.lineTo(cx,H); ctx.stroke();

  // axis labels
  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px sans-serif';
  ctx.fillText('x', W-15, cy-6);
  ctx.fillText('y', cx+6, 14);

  // parse function
  const input = $('graphInput').value.trim() || 'x^2';
  let clean = input
    .replace(/\^/g, '**')
    .replace(/sin/g,'Math.sin')
    .replace(/cos/g,'Math.cos')
    .replace(/tan/g,'Math.tan')
    .replace(/sqrt/g,'Math.sqrt')
    .replace(/log/g,'Math.log10')
    .replace(/ln/g,'Math.log')
    .replace(/abs/g,'Math.abs')
    .replace(/pi/gi,'Math.PI')
    .replace(/\be\b/g,'Math.E');

  let f;
  try {
    f = new Function('x', 'return (' + clean + ');');
  } catch(e){
    toast('Invalid function', 'error');
    return;
  }

  // scale: 40px per unit
  const scale = 40;
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  let started = false;
  for(let px = 0; px < W; px++){
    const x = (px - cx) / scale;
    let y;
    try { y = f(x); } catch(e){ y = NaN; }
    if(typeof y !== 'number' || !isFinite(y)){ started = false; continue; }
    const py = cy - y * scale;
    if(py < -1000 || py > H+1000){ started = false; continue; }
    if(!started){ ctx.moveTo(px, py); started = true; }
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // plot title
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('f(x) = ' + input, 12, 24);
}

/* ===================== GEOMETRY ===================== */
function renderGeoInputs(){
  const shape = $('geoShape').value;
  const box = $('geoInputs');
  const fields = {
    circle: [['r','Radius']],
    square: [['a','Side length']],
    rect: [['w','Width'],['h','Height']],
    triangle: [['b','Base'],['h','Height']],
    sphere: [['r','Radius']],
    cylinder: [['r','Radius'],['h','Height']]
  }[shape] || [];
  box.innerHTML = fields.map(([id,label]) =>
    `<input id="geo_${id}" type="number" step="any" placeholder="${label}" />`
  ).join('');
}
function calcGeometry(){
  const shape = $('geoShape').value;
  const g = id => parseFloat($('geo_' + id).value);
  const out = $('geoResult');
  let html = '';

  if(shape === 'circle'){
    const r = g('r');
    if(isNaN(r)){ return toast('Enter radius', 'error'); }
    html = `Area: <strong>${(Math.PI*r*r).toFixed(4)}</strong><br>Circumference: <strong>${(2*Math.PI*r).toFixed(4)}</strong>`;
  }
  else if(shape === 'square'){
    const a = g('a');
    if(isNaN(a)){ return toast('Enter side', 'error'); }
    html = `Area: <strong>${(a*a).toFixed(4)}</strong><br>Perimeter: <strong>${(4*a).toFixed(4)}</strong>`;
  }
  else if(shape === 'rect'){
    const w = g('w'), h = g('h');
    if(isNaN(w)||isNaN(h)){ return toast('Enter width and height', 'error'); }
    html = `Area: <strong>${(w*h).toFixed(4)}</strong><br>Perimeter: <strong>${(2*(w+h)).toFixed(4)}</strong>`;
  }
  else if(shape === 'triangle'){
    const b = g('b'), h = g('h');
    if(isNaN(b)||isNaN(h)){ return toast('Enter base and height', 'error'); }
    html = `Area: <strong>${(0.5*b*h).toFixed(4)}</strong>`;
  }
  else if(shape === 'sphere'){
    const r = g('r');
    if(isNaN(r)){ return toast('Enter radius', 'error'); }
    html = `Volume: <strong>${(4/3*Math.PI*r**3).toFixed(4)}</strong><br>Surface area: <strong>${(4*Math.PI*r*r).toFixed(4)}</strong>`;
  }
  else if(shape === 'cylinder'){
    const r = g('r'), h = g('h');
    if(isNaN(r)||isNaN(h)){ return toast('Enter radius and height', 'error'); }
    html = `Volume: <strong>${(Math.PI*r*r*h).toFixed(4)}</strong><br>Surface area: <strong>${(2*Math.PI*r*(r+h)).toFixed(4)}</strong>`;
  }
  out.innerHTML = html;
}

/* ===================== RENDER ALL ===================== */
function renderAll(){
  renderCodes();
  renderHomework();
  renderChat();
  renderLeaderboard();
  renderShop();
}

/* ===================== BOOT ===================== */
(function boot(){
  // initialize geometry inputs on load
  document.addEventListener('DOMContentLoaded', () => {
    if($('geoShape')) renderGeoInputs();
  });

  const sess = DB.get('session', null);
  if(sess && sess.name){
    enterApp(sess);
  }
})();