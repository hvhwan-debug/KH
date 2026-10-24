/* Gửi thông báo cho thí sinh theo mẫu: Zalo, tin nhắn SMS hoặc email.
   - Zalo / SMS: mở sẵn ứng dụng với đúng người nhận, người gửi bấm gửi (Zalo cần dán nội dung vì Zalo không cho điền sẵn).
   - Email: hệ thống gửi trực tiếp tới email đã lưu trong hồ sơ.
   Dùng chung cho trang quản trị (tab Thông báo) và trang quản lí (cửa sổ Gửi thông báo).
   KTNotify.mount(container, { recipients, exam, origin, sendEmail }) */
(function(){
'use strict';
var TEMPLATES = [
  { id:'remind', name:'Nhắc làm bài', filter:'todo', subject:'Nhắc làm bài kiểm tra: {ten_de}',
    text:'Chào {ten}, bạn chưa hoàn thành bài kiểm tra “{ten_de}”. Hạn làm bài: {han}.\nVui lòng truy cập {link} và nhập mã nhân viên, email công ty để làm bài.\nCảm ơn bạn.' },
  { id:'open', name:'Sắp mở đề', filter:'todo', subject:'Bài kiểm tra “{ten_de}” sắp mở',
    text:'Chào {ten}, bài kiểm tra “{ten_de}” sẽ mở lúc {mo}.\nBạn truy cập {link} và nhập mã nhân viên, email công ty để làm bài.\nChúc bạn hoàn thành tốt.' },
  { id:'close', name:'Sắp đóng đề', filter:'todo', subject:'Bài kiểm tra “{ten_de}” sắp đóng',
    text:'Chào {ten}, bài kiểm tra “{ten_de}” sẽ đóng lúc {han} và bạn chưa hoàn thành bài.\nVui lòng làm bài sớm tại {link}.\nCảm ơn bạn.' },
  { id:'result', name:'Thông báo kết quả', filter:'done', subject:'Kết quả bài kiểm tra: {ten_de}',
    text:'Chào {ten}, bạn đã hoàn thành bài kiểm tra “{ten_de}” với kết quả {diem}/{tong} câu đúng ({phan_tram}).\nXem kết quả đã xác thực tại: {link_ket_qua}' },
  { id:'custom', name:'Tự soạn', filter:'all', subject:'Thông báo về bài kiểm tra: {ten_de}', text:'Chào {ten},\n' }
];
var VARS = [['ten','Tên'],['ma_nv','Mã NV'],['ten_de','Tên đề'],['link','Link làm bài'],['mo','Giờ mở'],['han','Hạn làm bài'],['diem','Số câu đúng'],['tong','Tổng số câu'],['phan_tram','Phần trăm'],['link_ket_qua','Link kết quả'],['quan_li','Quản lí']];
var CHANNELS = [['zalo','Zalo'],['sms','Tin nhắn SMS'],['email','Email']];

function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmt(ms){
  if (!ms) return '';
  try {
    var p = {}; new Intl.DateTimeFormat('en-GB', { timeZone:'Asia/Ho_Chi_Minh', hour12:false, hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', year:'numeric' }).formatToParts(new Date(ms)).forEach(function(x){ p[x.type] = x.value; });
    return p.hour + ':' + p.minute + ' ' + p.day + '/' + p.month + '/' + p.year;
  } catch(e){ return ''; }
}
function render(tpl, r, ex, origin){
  var NONE = 'theo thông báo của quản lý';
  var vals = {
    ten: r.name || r.code, ma_nv: r.code, ten_de: (ex && ex.title) || '', quan_li: r.manager || '',
    link: ex && ex.id ? origin + '/kiemtra/?exam=' + encodeURIComponent(ex.id) : origin + '/kiemtra/',
    mo: fmt(ex && ex.openAt) || NONE, han: fmt(ex && ex.closeAt) || NONE,
    diem: r.result ? r.result.score : '', tong: r.result ? r.result.total : '', phan_tram: r.result ? r.result.pct + '%' : '',
    link_ket_qua: r.result && r.result.verify ? origin + '/kiemtra/ketqua.html?t=' + encodeURIComponent(r.result.verify) : ''
  };
  return String(tpl).replace(/\{(\w+)\}/g, function(m, k){ return k in vals ? String(vals[k]) : m; });
}
function css(){
  if (document.getElementById('ntCss')) return;
  var s = document.createElement('style'); s.id = 'ntCss';
  s.textContent = '.nt{--c:var(--brand,#0A63C4);--l:var(--line,#D8E2F0);--m:var(--muted,#4F6486);--k:var(--ink,#0A2552)}'+
  '.nt-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:18px;align-items:start}'+
  '@media(max-width:900px){.nt-grid{grid-template-columns:1fr}}'+
  '.nt-box{border:1px solid var(--l);border-radius:16px;padding:16px;background:#fff}'+
  '.nt label.nl{display:block;font-size:13px;font-weight:700;margin:12px 0 6px;color:var(--k)}.nt label.nl:first-child{margin-top:0}'+
  '.nt select,.nt input[type=text],.nt textarea{width:100%;border:1.5px solid var(--l);border-radius:12px;padding:10px 12px;font:inherit;font-size:14px;background:#FBFDFF;color:var(--k)}'+
  '.nt textarea{min-height:150px;line-height:1.55;resize:vertical}'+
  '.nt-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}'+
  '.nt-chip{border:1px solid var(--l);background:#F3F8FE;color:#0B3F94;border-radius:999px;padding:4px 10px;font-size:12px;font-weight:600;cursor:pointer}'+
  '.nt-chip:hover{background:#E6F0FC}'+
  '.nt-seg{display:flex;gap:6px;flex-wrap:wrap}'+
  '.nt-seg button{flex:1 1 0;min-width:90px;border:1.5px solid var(--l);background:#fff;border-radius:12px;padding:9px 10px;font:inherit;font-size:13.5px;font-weight:700;color:var(--m);cursor:pointer}'+
  '.nt-seg button.on{border-color:var(--c);background:#E6F0FC;color:#0B3F94}'+
  '.nt-prev{margin-top:12px;border:1px dashed #9fc7ff;background:#F4F9FF;border-radius:12px;padding:10px 12px;font-size:13px;line-height:1.55;white-space:pre-wrap;color:var(--k)}'+
  '.nt-prev small{display:block;color:var(--m);font-weight:700;margin-bottom:4px}'+
  '.nt-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}'+
  '.nt-f{border:1.5px solid var(--l);background:#fff;border-radius:999px;padding:6px 12px;font:inherit;font-size:13px;font-weight:700;color:var(--m);cursor:pointer}'+
  '.nt-f.on{background:var(--c);border-color:var(--c);color:#fff}'+
  '.nt-bar input[type=search]{flex:1 1 150px;min-width:0;border:1.5px solid var(--l);border-radius:999px;padding:7px 12px;font:inherit;font-size:13px}'+
  '.nt-rows{max-height:520px;overflow:auto;border:1px solid var(--l);border-radius:12px}'+
  '.nt-row{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--l)}'+
  '.nt-row:last-child{border-bottom:0}.nt-row.sent{background:#F2FAF5}'+
  '.nt-row b{display:block;font-size:14px;color:var(--k)}.nt-row small{display:block;font-size:12px;color:var(--m);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
  '.nt-no{display:inline-block;background:#FBE3E0;color:#B3261E;border-radius:999px;padding:1px 8px;font-size:11.5px;font-weight:700}'+
  '.nt-st{font-size:12px;font-weight:700}.nt-st.ok{color:#1E7F4F}.nt-st.er{color:#B3261E}'+
  '.nt-act{border:1.5px solid var(--c);background:#fff;color:#0B3F94;border-radius:10px;padding:7px 12px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;text-decoration:none;white-space:nowrap;display:inline-block}'+
  '.nt-act:hover{background:#E6F0FC}.nt-act[disabled],.nt-act.dis{opacity:.45;pointer-events:none}'+
  '.nt-foot{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:12px}'+
  '.nt-go{border:0;border-radius:12px;padding:12px 18px;font:inherit;font-weight:800;font-size:14px;color:#fff;background:linear-gradient(100deg,#0869df,#08b9d4);cursor:pointer}'+
  '.nt-go[disabled]{opacity:.5;cursor:default}'+
  '.nt-hint{font-size:12.5px;line-height:1.5;color:var(--m)}'+
  '.nt-msg{font-size:13px;margin-top:8px;padding:8px 12px;border-radius:10px}.nt-msg.ok{background:#DDF1E6;color:#17794A}.nt-msg.er{background:#FBE3E0;color:#B3261E}';
  document.head.appendChild(s);
}
function mount(root, cfg){
  css();
  var all = (cfg.recipients || []).filter(function(r){ return r.eligible !== false; });
  var origin = cfg.origin || location.origin, ex = cfg.exam || {};
  var S = { tpl:'remind', text:'', subj:'', channel:'zalo', filter:'todo', q:'', sel:{}, sent:{}, err:{} };
  function tplOf(id){ return TEMPLATES.filter(function(t){ return t.id === id; })[0]; }
  function setTpl(id){ var t = tplOf(id); S.tpl = id; S.text = t.text; S.subj = t.subject; S.filter = t.filter; selVisible(); }
  function visible(){
    var q = S.q.trim().toLowerCase();
    return all.filter(function(r){
      if (S.filter === 'todo' && r.status === 'done') return false;
      if (S.filter === 'done' && r.status !== 'done') return false;
      if (S.filter === 'nophone' && r.phone) return false;
      return !q || (r.name + ' ' + r.code + ' ' + (r.phone || '') + ' ' + (r.manager || '')).toLowerCase().indexOf(q) >= 0;
    });
  }
  function selVisible(){ S.sel = {}; visible().forEach(function(r){ S.sel[r.code] = true; }); }
  function msgFor(r){ return render(S.text, r, ex, origin); }
  function count(f){ return all.filter(function(r){ return f === 'all' ? true : f === 'todo' ? r.status !== 'done' : f === 'done' ? r.status === 'done' : !r.phone; }).length; }
  function draw(){
    var vis = visible(), first = vis.filter(function(r){ return S.sel[r.code]; })[0] || vis[0];
    var nsel = vis.filter(function(r){ return S.sel[r.code]; }).length;
    var nmail = vis.filter(function(r){ return S.sel[r.code] && r.email; }).length;
    root.innerHTML = '<div class="nt"><div class="nt-grid">'+
      '<div class="nt-box"><label class="nl" for="ntTpl">Mẫu thông báo</label><select id="ntTpl">'+TEMPLATES.map(function(t){ return '<option value="'+t.id+'"'+(t.id===S.tpl?' selected':'')+'>'+esc(t.name)+'</option>'; }).join('')+'</select>'+
      '<label class="nl" for="ntText">Nội dung</label><textarea id="ntText">'+esc(S.text)+'</textarea>'+
      '<div class="nt-chips" aria-label="Chèn thông tin tự động">'+VARS.map(function(v){ return '<button type="button" class="nt-chip" data-v="'+v[0]+'" title="Chèn {'+v[0]+'}">'+esc(v[1])+'</button>'; }).join('')+'</div>'+
      '<label class="nl">Kênh gửi</label><div class="nt-seg">'+CHANNELS.map(function(c){ return '<button type="button" data-ch="'+c[0]+'" class="'+(c[0]===S.channel?'on':'')+'">'+c[1]+'</button>'; }).join('')+'</div>'+
      (S.channel === 'email' ? '<label class="nl" for="ntSubj">Tiêu đề email</label><input type="text" id="ntSubj" value="'+esc(render(S.subj, first || {}, ex, origin))+'">' : '')+
      '<div class="nt-prev"><small>Xem trước'+(first ? ' (cho '+esc(first.name || first.code)+')' : '')+'</small>'+(first ? esc(msgFor(first)) : 'Chưa có người nhận trong danh sách.')+'</div>'+
      '<p class="nt-hint" style="margin:10px 0 0">'+(S.channel==='zalo' ? 'Bấm “Mở Zalo” ở từng người: nội dung được sao chép sẵn, bạn chỉ cần dán (Cmd/Ctrl+V) rồi gửi.' : S.channel==='sms' ? 'Bấm “Soạn SMS” ở từng người: ứng dụng tin nhắn mở sẵn với nội dung và số điện thoại.' : 'Hệ thống gửi email trực tiếp tới email đã lưu của những người được chọn.')+'</p></div>'+
      '<div class="nt-box"><div class="nt-bar">'+
        [['todo','Chưa làm'],['done','Đã làm'],['all','Tất cả'],['nophone','Thiếu SĐT']].map(function(f){ return '<button type="button" class="nt-f'+(S.filter===f[0]?' on':'')+'" data-f="'+f[0]+'">'+f[1]+' ('+count(f[0])+')</button>'; }).join('')+
        '<input type="search" id="ntQ" placeholder="Tìm tên, mã NV, SĐT…" value="'+esc(S.q)+'"></div>'+
      '<label style="display:flex;gap:8px;align-items:center;font-size:13px;font-weight:700;margin:0 0 8px"><input type="checkbox" id="ntAll"'+(vis.length && nsel === vis.length ? ' checked' : '')+'> Chọn tất cả ('+nsel+'/'+vis.length+')</label>'+
      '<div class="nt-rows">'+(vis.length ? vis.map(function(r){ return rowHtml(r); }).join('') : '<div style="padding:18px;text-align:center" class="nt-hint">Không có ai trong bộ lọc này.</div>')+'</div>'+
      '<div class="nt-foot">'+(S.channel==='email' ? '<button type="button" class="nt-go" id="ntSend"'+(nmail?'':' disabled')+'>Gửi email cho '+nmail+' người</button>'+(nmail < nsel ? '<span class="nt-hint">'+(nsel-nmail)+' người đã chọn chưa có email nên sẽ bị bỏ qua.</span>' : '') : '<span class="nt-hint">Bấm nút ở từng dòng để gửi. Dòng đã mở sẽ được tô xanh.</span>')+'</div><div id="ntRes"></div></div>'+
    '</div></div>';
    wire();
  }
  function rowHtml(r){
    var act = '';
    if (S.channel === 'zalo') act = '<button type="button" class="nt-act'+(r.phone?'':' dis')+'" data-zalo="'+esc(r.code)+'">'+(S.sent[r.code]?'Mở lại Zalo':'Mở Zalo')+'</button>';
    else if (S.channel === 'sms') act = '<a class="nt-act'+(r.phone?'':' dis')+'" data-sms="'+esc(r.code)+'" href="'+(r.phone ? 'sms:'+r.phone+'?&body='+encodeURIComponent(msgFor(r)) : '#')+'">Soạn SMS</a>';
    else act = S.err[r.code] ? '<span class="nt-st er">'+esc(S.err[r.code])+'</span>' : (S.sent[r.code] ? '<span class="nt-st ok">Đã gửi</span>' : (r.email ? '' : '<span class="nt-no">Chưa có email</span>'));
    var contact = S.channel === 'email' ? (r.email || '') : (r.phone || '');
    return '<div class="nt-row'+(S.sent[r.code]?' sent':'')+'"><input type="checkbox" data-sel="'+esc(r.code)+'"'+(S.sel[r.code]?' checked':'')+' aria-label="Chọn '+esc(r.name||r.code)+'"><div><b>'+esc(r.name||r.code)+'</b><small>'+esc(r.code)+(r.manager?' · '+esc(r.manager):'')+' · '+(contact ? esc(contact) : '<span class="nt-no">'+(S.channel==='email'?'Chưa có email':'Chưa có SĐT')+'</span>')+' · '+(r.status==='done'?'Đã làm':'Chưa làm')+'</small></div><div>'+act+'</div></div>';
  }
  function byCode(code){ return all.filter(function(r){ return r.code === code; })[0]; }
  function copy(t){ return (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t) : Promise.reject()).catch(function(){ window.prompt('Sao chép nội dung:', t); }); }
  function wire(){
    var q = function(s){ return root.querySelector(s); }, qa = function(s){ return [].slice.call(root.querySelectorAll(s)); };
    q('#ntTpl').addEventListener('change', function(e){ setTpl(e.target.value); draw(); });
    q('#ntText').addEventListener('input', function(e){ S.text = e.target.value; refresh(); });
    qa('.nt-chip').forEach(function(b){ b.addEventListener('click', function(){ var t = q('#ntText'), v = '{'+b.dataset.v+'}', a = t.selectionStart || t.value.length, z = t.selectionEnd || a; t.value = t.value.slice(0,a)+v+t.value.slice(z); S.text = t.value; t.focus(); t.selectionStart = t.selectionEnd = a+v.length; refresh(); }); });
    qa('[data-ch]').forEach(function(b){ b.addEventListener('click', function(){ S.channel = b.dataset.ch; draw(); }); });
    qa('[data-f]').forEach(function(b){ b.addEventListener('click', function(){ S.filter = b.dataset.f; selVisible(); draw(); }); });
    q('#ntQ').addEventListener('input', function(e){ S.q = e.target.value; selVisible(); var pos = e.target.selectionStart; draw(); var n = q('#ntQ'); n.focus(); try { n.setSelectionRange(pos,pos); } catch(_){} });
    q('#ntAll').addEventListener('change', function(e){ S.sel = {}; if (e.target.checked) visible().forEach(function(r){ S.sel[r.code] = true; }); draw(); });
    qa('[data-sel]').forEach(function(c){ c.addEventListener('change', function(){ if (c.checked) S.sel[c.dataset.sel] = true; else delete S.sel[c.dataset.sel]; draw(); }); });
    qa('[data-zalo]').forEach(function(b){ b.addEventListener('click', function(){ var r = byCode(b.dataset.zalo); if (!r || !r.phone) return; copy(msgFor(r)).then(function(){ S.sent[r.code] = true; window.open('https://zalo.me/'+r.phone, '_blank', 'noopener'); var row = b.closest('.nt-row'); if (row) row.classList.add('sent'); b.textContent = 'Mở lại Zalo'; }); }); });
    qa('[data-sms]').forEach(function(a){ a.addEventListener('click', function(){ S.sent[a.dataset.sms] = true; var row = a.closest('.nt-row'); if (row) row.classList.add('sent'); }); });
    var send = q('#ntSend');
    if (send) send.addEventListener('click', async function(){
      var rows = visible().filter(function(r){ return S.sel[r.code] && r.email; });
      if (!rows.length){ q('#ntRes').innerHTML = '<div class="nt-msg er">Chưa chọn ai có email.</div>'; return; }
      if (!confirm('Gửi email cho ' + rows.length + ' người đã chọn?')) return;
      var subj = (q('#ntSubj') || {}).value || '';
      send.disabled = true; send.textContent = 'Đang gửi…'; q('#ntRes').innerHTML = '';
      var j = null;
      try { j = await cfg.sendEmail(rows.map(function(r){ return { code:r.code, text: msgFor(r) }; }), subj); } catch(e){ j = null; }
      var bad = {}; ((j && j.failed) || []).forEach(function(f){ bad[f.code] = f.error || 'Lỗi'; });
      ((j && j.skipped) || []).forEach(function(f){ bad[f.code] = f.reason || 'Bỏ qua'; });
      rows.forEach(function(r){ if (bad[r.code]) S.err[r.code] = bad[r.code]; else if (j && (j.ok || j.sent)) { S.sent[r.code] = true; delete S.err[r.code]; } });
      draw();
      q('#ntRes').innerHTML = j ? '<div class="nt-msg '+(j.ok && !(j.failed||[]).length ? 'ok' : 'er')+'">'+(j.error ? esc(j.error) : 'Đã gửi '+(j.sent||0)+' email'+((j.failed||[]).length ? ', lỗi '+j.failed.length : '')+((j.skipped||[]).length ? ', bỏ qua '+j.skipped.length : '')+'.')+'</div>' : '<div class="nt-msg er">Không kết nối được máy chủ, thử lại sau.</div>';
    });
  }
  function refresh(){ // chỉ cập nhật phần xem trước và liên kết SMS khi đang gõ, không vẽ lại cả khung (giữ con trỏ)
    var vis = visible(), first = vis.filter(function(r){ return S.sel[r.code]; })[0] || vis[0];
    var p = root.querySelector('.nt-prev'); if (p) p.innerHTML = '<small>Xem trước'+(first ? ' (cho '+esc(first.name||first.code)+')' : '')+'</small>'+(first ? esc(msgFor(first)) : 'Chưa có người nhận trong danh sách.');
    [].forEach.call(root.querySelectorAll('[data-sms]'), function(a){ var r = byCode(a.dataset.sms); if (r && r.phone) a.href = 'sms:'+r.phone+'?&body='+encodeURIComponent(msgFor(r)); });
  }
  setTpl('remind'); draw();
}
window.KTNotify = { mount: mount };
})();
