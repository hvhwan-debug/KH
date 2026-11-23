/* KTVoice: giọng đọc hướng dẫn dùng chung cho mọi màn đăng nhập / xác thực.
   - Ưu tiên file ghi sẵn /kiemtra/voice/*.mp3 (cùng một giọng trên mọi máy), không có thì dùng giọng tiếng Việt của máy.
   - HÀNG ĐỢI: câu đang đọc luôn được đọc HẾT; câu mới đến trong lúc đó chờ (chỉ giữ câu mới nhất), không cắt ngang.
   - KTVoice.wait(): chờ đọc xong (có giới hạn thời gian) — dùng trước khi tự chuyển màn hình.
   - KTVoice.stop(): dừng ngay (người dùng tự thoát / tắt loa).
   Dùng: KTVoice.say(text) · await KTVoice.wait(8000) · KTVoice.stop() · KTVoice.busy() */
(function(){
'use strict';
if (window.KTVoice) return;
var V = { map:null, buf:{}, raw:{}, ctx:null, src:null, busy:false, next:null, endT:null, waiters:[], voice:null, primed:false, gen:0 };
function norm(t){ return String(t || '').replace(/^[\s⚠✓!]+/, '').replace(/…/g, '.').replace(/\s+/g, ' ').trim(); }
try { fetch('/kiemtra/voice/index.json', { cache:'no-cache' }).then(function(r){ return r.json(); }).then(function(m){ V.map = m || {}; }).catch(function(){ V.map = {}; }); } catch (e) { V.map = {}; }
function file(k){ var m = V.map || {}; return m[k] || m[k.replace(/\.$/, '')] || m[k + '.'] || ''; }
function ctx(){
  if (V.ctx) return V.ctx; var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  try { V.ctx = new AC(); } catch (e) { return null; } return V.ctx;
}
function pickVoice(){
  try {
    var vs = (speechSynthesis.getVoices() || []).filter(function(v){ return /^vi/i.test(v.lang); });
    var sc = function(v){ var n = v.name || ''; return (/natural|online|neural/i.test(n) ? 4 : 0) + (/google/i.test(n) ? 3 : 0) + (/linh|hoaimy/i.test(n) ? 2 : 0) + (v.localService ? 1 : 0); };
    vs.sort(function(a, b){ return sc(b) - sc(a); }); V.voice = vs[0] || null;
  } catch (e) {}
}
try { if ('speechSynthesis' in window){ pickVoice(); speechSynthesis.addEventListener ? speechSynthesis.addEventListener('voiceschanged', pickVoice) : (speechSynthesis.onvoiceschanged = pickVoice); } } catch (e) {}
function unlock(){ // trình duyệt chỉ cho phát tiếng sau một thao tác của người dùng
  var c = ctx(); if (!c) return;
  try { if (c.state !== 'running') { var p = c.resume(); if (p && p.catch) p.catch(function(){}); } } catch (e) {}
  if (!V.primed){
    try { var b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); V.primed = true; } catch (e) {}
    try { if ('speechSynthesis' in window && V.voice){ var u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } } catch (e) {}
  }
}
['touchend', 'click', 'pointerup', 'keydown', 'mousedown'].forEach(function(ev){ document.addEventListener(ev, unlock, { passive:true, capture:true }); });

function flush(){ var w = V.waiters; V.waiters = []; w.forEach(function(f){ try { f(); } catch (e) {} }); }
function done(g){
  if (g !== V.gen) return; // lượt đọc cũ đã bị dừng/thay
  V.gen++; V.busy = false; clearTimeout(V.endT); V.src = null;
  if (V.next){ var n = V.next; V.next = null; play(n); return; }
  flush();
}
function clip(f, g){
  var c = ctx(); if (!c || c.state !== 'running') return false;
  V.endT = setTimeout(function(){ done(g); }, 5000); // tải file quá lâu: bỏ qua câu này
  var go = function(b){
    if (g !== V.gen) return; clearTimeout(V.endT);
    var s = c.createBufferSource(); s.buffer = b; s.connect(c.destination);
    s.onended = function(){ if (V.src === s) done(g); };
    try { s.start(); } catch (e) { done(g); return; }
    V.src = s; V.endT = setTimeout(function(){ done(g); }, b.duration * 1000 + 800);
  };
  if (V.buf[f]){ go(V.buf[f]); return true; }
  (V.raw[f] || (V.raw[f] = fetch('/kiemtra/voice/' + f).then(function(r){ if (!r.ok) throw 0; return r.arrayBuffer(); })))
    .then(function(ab){ return new Promise(function(res, rej){ c.decodeAudioData(ab.slice(0), res, rej); }); })
    .then(function(b){ V.buf[f] = b; go(b); })
    .catch(function(){ delete V.raw[f]; done(g); });
  return true;
}
function speech(t, g){
  if (!V.voice || !('speechSynthesis' in window)) return false;
  try {
    var u = new SpeechSynthesisUtterance(t); u.voice = V.voice; u.lang = V.voice.lang; u.rate = 1.02; u.volume = .95;
    u.onend = u.onerror = function(){ done(g); };
    speechSynthesis.cancel(); speechSynthesis.speak(u);
    V.endT = setTimeout(function(){ done(g); }, 1500 + t.length * 110);
    return true;
  } catch (e) { return false; }
}
function play(t){
  V.busy = true; var g = ++V.gen, k = norm(t), f = file(k);
  if (f && clip(f, g)) return;
  if (speech(t, g)) return;
  var fb = file(/^Xin chào/.test(k) ? 'Xin chào. Đăng nhập thành công.' : 'Vui lòng xem thông báo trên màn hình.');
  if (fb && clip(fb, g)) return;
  setTimeout(function(){ done(g); }, 0);
}
function say(t){
  if (!t) return;
  if (V.busy){ V.next = t; return; } // đang đọc: chờ đọc hết rồi mới đọc câu mới nhất
  play(t);
}
function stop(){
  V.next = null; V.gen++; clearTimeout(V.endT);
  var s = V.src; V.src = null; try { if (s) s.stop(); } catch (e) {}
  try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch (e) {}
  V.busy = false; flush();
}
function busy(){ return V.busy || !!V.next; }
function wait(max){
  return new Promise(function(res){
    if (!busy()) return res();
    var ok = false, fin = function(){ if (!ok){ ok = true; res(); } };
    V.waiters.push(fin); setTimeout(fin, max || 8000);
  });
}
window.KTVoice = { say:say, stop:stop, wait:wait, busy:busy, unlock:unlock, norm:norm, hasVoice:function(){ return !!V.voice; } };
})();
