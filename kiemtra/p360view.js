/* Hồ sơ nhân viên › Tổng quan năng lực › "Nhận định đa chiều": giao diện trực quan.
   Câu chuyện đọc từ trên xuống: ① Kết luận (có chuyện gì) → ② Bằng chứng (7 góc nhìn + từng mảng kiến thức)
   → ③ Nguyên nhân (giả thuyết xếp theo bằng chứng) → ④ Hành động (kế hoạch 30 ngày, có mục tiêu đo được) → ⑤ Chuẩn bị buổi 1-1.
   Dữ liệu và cách chẩn đoán giữ nguyên (api/_lib/person360.js); file này chỉ lo cách HIỂN THỊ.
   Dùng các hàm có sẵn của trang: esc(), vn(), p3Industry(), p3AiHtml(). Lỗi ở đây thì trang tự quay về giao diện cũ. */
(function () {
  'use strict';
  var LV = {
    good: { c: '#16794A', bg: '#DDF3E8', bar: '#22A35E', t: 'Điểm sáng' }, ok: { c: '#0B3F94', bg: '#E8F0FB', bar: '#7FA7DD', t: 'Ổn' },
    watch: { c: '#9A5B00', bg: '#FFF1D6', bar: '#E0A030', t: 'Cần chú ý' }, risk: { c: '#C0332B', bg: '#FDE8E7', bar: '#E2574C', t: 'Rủi ro' },
    na: { c: '#5B6B86', bg: '#EEF2F7', bar: '#CBD5E4', t: 'Thiếu dữ liệu' }
  };
  var OVERALL = { risk: 'Cần hành động', watch: 'Cần theo dõi', ok: 'Ổn định', good: 'Điểm sáng', na: 'Chưa đủ dữ liệu' };
  var KIND = { personal: ['Lỗ hổng riêng', '#C0332B', '#FDE8E7', '#E2574C'], shared: ['Yếu cả nhóm', '#9A5B00', '#FFF1D6', '#E0A030'], edge: ['Nổi trội', '#16794A', '#DDF3E8', '#22A35E'], par: ['Ngang đồng nghiệp', '#0B3F94', '#E8F0FB', '#7FA7DD'], unknown: ['Chưa có mốc so sánh', '#5B6B86', '#EEF2F7', '#B8C4D6'] };
  var ICON = {
    position: '<path d="M3 21h18M7 21V10M12 21V4M17 21v-7"/>', areas: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>', trend: '<path d="M3 17l6-6 4 4 7-8"/><path d="M14 7h6v6"/>',
    behavior: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', sales: '<path d="M6 6h15l-1.5 9h-12z"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M6 6L5 3H2"/>',
    team: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20c0-2.6-1.6-4.6-4-5.5"/>',
    engage: '<path d="M12 3c0 3-4 5-4 9a4 4 0 0 0 8 0c0-2-1-3-1-5 2 1 4 3 4 6a7 7 0 0 1-14 0c0-6 7-7 7-10z"/>'
  };
  var WEAK = 65;   // mốc "yếu" của máy chủ (api/_lib/person360.js)

  function e(s) { return typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function ea(s) { return e(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }   // dùng cho GIÁ TRỊ THUỘC TÍNH (esc của trang không escape dấu nháy)
  function n1(x) { return typeof vn === 'function' ? vn(x) : String(Math.round(x * 10) / 10).replace('.', ','); }
  function lv(k) { return LV[k] || LV.na; }
  function ico(name, size) { return '<svg viewBox="0 0 24 24" width="' + (size || 18) + '" height="' + (size || 18) + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON[name] || ICON.position) + '</svg>'; }
  function lens(r, id) { return (r.lenses || []).filter(function (l) { return l.id === id; })[0] || null; }
  function pct(x) { return Math.max(0, Math.min(100, x)); }
  // Cắt gọn cho thẻ (ưu tiên hết câu, rồi hết ý trước dấu chấm phẩy); bản đầy đủ nằm trong "Xem chi tiết"
  function short(t, n) {
    t = String(t || '').replace(/\s+/g, ' ').trim(); if (t.length <= n) return t;
    var cut = t.slice(0, n), k = cut.lastIndexOf('. '); if (k > n * 0.45) return cut.slice(0, k + 1);
    k = cut.lastIndexOf('; '); if (k > n * 0.45) return cut.slice(0, k) + '…';
    return cut.replace(/\s+\S*$/, '').replace(/[\s,;:(\-–]+$/, '') + '…';
  }
  function overall(ls) {
    var rank = { good: 0, ok: 1, watch: 2, risk: 3 }, n = { good: 0, ok: 0, watch: 0, risk: 0 }, w = null, used = 0, na = 0;
    ls.forEach(function (l) { if (l.level === 'na' || rank[l.level] == null) { na++; return; } used++; n[l.level]++; if (!w || rank[l.level] > rank[w]) w = l.level; });
    return { level: w || 'na', n: n, used: used, na: na };
  }
  function cssOnce() {
    if (document.getElementById('p4css')) return;
    var st = document.createElement('style'); st.id = 'p4css';
    st.textContent =
      '.p4-sec{margin-top:22px}.p4-sec:first-child{margin-top:0}' +
      '.p4-sh{display:flex;align-items:center;gap:10px;margin:0 0 10px}.p4-sh .no{flex:none;width:26px;height:26px;border-radius:50%;background:#0A63C4;color:#fff;display:grid;place-items:center;font-size:13px;font-weight:800}' +
      '.p4-sh b{font-size:15px;color:#0B2A5B}.p4-sh small{color:#5B6B86;font-size:12.5px;margin-left:4px}' +
      '.p4-hero{border-radius:16px;padding:16px 18px;border:1px solid #D6E4FA;border-left:6px solid var(--p4c,#7FA7DD);background:linear-gradient(135deg,#F2F7FF,#fff)}' +
      '.p4-st{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.p4-pill{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:99px;font-size:12.5px;font-weight:800;background:var(--p4b,#EEF2F7);color:var(--p4t,#5B6B86)}' +
      '.p4-pill i{width:8px;height:8px;border-radius:50%;background:var(--p4c,#7FA7DD)}.p4-st small{color:#5B6B86;font-size:12.5px}' +
      '.p4-hero h3{margin:10px 0 4px;font-size:19px;line-height:1.35;color:#0B2A5B;font-weight:800}.p4-hero p{margin:0;font-size:14px;line-height:1.6;color:#22324F}' +
      '.p4-hero details{margin-top:6px;font-size:13px;color:#5B6B86}.p4-hero summary{cursor:pointer;font-weight:700;color:#0A63C4}' +
      '.p4-conf{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:12.5px;color:#5B6B86}.p4-cm{display:inline-flex;gap:3px}.p4-cm i{width:22px;height:7px;border-radius:4px;background:#D5DEEB}.p4-cm i.on{background:#0A63C4}' +
      '.p4-kp{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-top:14px}' +
      '.p4-k{background:#fff;border:1px solid #E1E8F2;border-top:3px solid var(--c,#CBD5E4);border-radius:12px;padding:10px 12px}.p4-k .l{font-size:12px;font-weight:700;color:#5B6B86}' +
      '.p4-k .v{font-size:24px;font-weight:800;color:#0B2A5B;line-height:1.2;margin-top:2px;letter-spacing:-.01em}.p4-k .v small{font-size:13px;color:#5B6B86;font-weight:600;margin-left:2px}.p4-k .s{font-size:12px;color:#5B6B86;margin-top:2px}' +
      '.p4-m{position:relative;height:8px;border-radius:4px;background:#EEF2F8;margin:8px 0 2px}.p4-m .me{position:absolute;left:0;top:0;bottom:0;border-radius:4px;background:var(--c,#0A63C4)}.p4-m .pe{position:absolute;top:-4px;bottom:-4px;border-left:2px solid #0B2A5B}' +
      '.p4-strip{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px}.p4-chip{display:inline-flex;align-items:center;gap:7px;border:1px solid #E1E8F2;background:#fff;border-radius:99px;padding:5px 12px 5px 9px;font:inherit;font-size:12.5px;font-weight:700;color:#22324F;cursor:pointer}' +
      '.p4-chip i{width:10px;height:10px;border-radius:50%;background:var(--c,#CBD5E4)}.p4-chip small{font-weight:700;color:var(--t,#5B6B86)}.p4-chip:hover{background:#F6FAFF}' +
      '.p4-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px}' +
      '.p4-c{border:1px solid #E1E8F2;border-radius:14px;padding:12px 14px;background:#fff;border-top:4px solid var(--c,#CBD5E4)}.p4-c.na{opacity:.8;background:#FAFBFD}.p4-c.flash{box-shadow:0 0 0 3px rgba(10,99,196,.25)}' +
      '.p4-c .hh{display:flex;align-items:center;gap:8px;margin-bottom:6px}.p4-c .hh .ic{flex:none;width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:var(--bg,#EEF2F7);color:var(--t,#5B6B86)}' +
      '.p4-c .hh b{flex:1;font-size:13.5px;color:#0B2A5B;line-height:1.3}.p4-c p.s{margin:0;font-size:13px;line-height:1.55;color:#22324F}' +
      '.p4-c details{margin-top:8px;font-size:12.5px;color:#5B6B86}.p4-c summary{cursor:pointer;font-weight:700;color:#0A63C4}.p4-c details p{margin:6px 0 0;font-size:12.5px;line-height:1.55;color:#22324F}.p4-c details ul{margin:6px 0 0;padding-left:16px}' +
      '.p4-ar{display:grid;grid-template-columns:minmax(120px,210px) 1fr minmax(96px,150px);gap:6px 14px;align-items:center;padding:10px 0;border-top:1px dashed #E1E8F2}.p4-ar:first-of-type{border-top:0}' +
      '.p4-ar .nm b{display:block;font-size:13px;color:#0B2A5B;line-height:1.35}.p4-ar .kd{display:inline-block;margin-top:3px;padding:1px 8px;border-radius:99px;font-size:11px;font-weight:800;background:var(--bg);color:var(--t)}' +
      '.p4-tr{position:relative;height:14px;border-radius:7px;background:#EEF2F8;overflow:visible}.p4-tr .zone{position:absolute;left:0;top:0;bottom:0;width:' + WEAK + '%;border-radius:7px 0 0 7px;background:repeating-linear-gradient(135deg,#FBEAE8,#FBEAE8 4px,#FDF3F2 4px,#FDF3F2 8px)}' +
      '.p4-tr .me{position:absolute;left:0;top:2px;bottom:2px;border-radius:5px;background:var(--c)}.p4-tr .pe{position:absolute;top:-4px;bottom:-4px;width:0;border-left:3px solid #0B2A5B}' +
      '.p4-ar .nv{text-align:right}.p4-ar .nv b{font-size:16px;color:#0B2A5B}.p4-ar .nv small{display:block;font-size:11.5px;color:#5B6B86}.p4-ar .tp{grid-column:1 / -1;font-size:12px;color:#5B6B86}' +
      '.p4-lg{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:#5B6B86;margin:0 0 6px}.p4-lg span{display:inline-flex;align-items:center;gap:6px}.p4-lg i{display:inline-block;width:14px;height:8px;border-radius:3px}.p4-lg i.pk{width:0;height:12px;border-left:3px solid #0B2A5B;border-radius:0}' +
      '.p4-take{margin-top:10px;padding:10px 12px;border-radius:10px;background:#F4F8FF;border:1px solid #D6E4FA;font-size:13px;line-height:1.55;color:#22324F}' +
      '.p4-hy{border:1px solid #E1E8F2;border-radius:14px;padding:12px 14px;background:#fff;margin-bottom:10px}.p4-hy .top{display:flex;align-items:flex-start;gap:10px}.p4-hy .n{flex:none;width:24px;height:24px;border-radius:50%;background:#E8F0FB;color:#0B3F94;display:grid;place-items:center;font-size:12.5px;font-weight:800}' +
      '.p4-hy .top b{font-size:14px;color:#0B2A5B;line-height:1.4}.p4-mt{display:flex;height:9px;border-radius:5px;overflow:hidden;background:#EEF2F8;margin:10px 0 4px}.p4-mt .f{background:#22A35E}.p4-mt .a{background:#E2574C}' +
      '.p4-hy .mm{font-size:12px;color:#5B6B86}.p4-hy .mm b{color:#16794A}.p4-hy .mm b.x{color:#C0332B}.p4-hy details{margin-top:6px;font-size:12.5px}.p4-hy summary{cursor:pointer;font-weight:700;color:#0A63C4}' +
      '.p4-hy ul{margin:6px 0 0;padding-left:18px;color:#2F4468}.p4-hy li.x{color:#9A2A22}.p4-vf{margin-top:8px;display:flex;gap:8px;align-items:flex-start;padding:7px 10px;border-radius:9px;background:#F4F8FF;font-size:12.5px;color:#22324F}.p4-vf b{color:#0A63C4;white-space:nowrap}' +
      '.p4-tl{position:relative;padding-left:34px}.p4-tl:before{content:"";position:absolute;left:13px;top:8px;bottom:8px;width:2px;background:#D6E4FA}' +
      '.p4-st2{position:relative;border:1px solid #E1E8F2;border-radius:14px;padding:12px 14px;background:#fff;margin-bottom:10px}.p4-st2 .no{position:absolute;left:-34px;top:12px;width:28px;height:28px;border-radius:50%;background:#0A63C4;color:#fff;display:grid;place-items:center;font-size:13px;font-weight:800;border:3px solid #fff;box-shadow:0 0 0 1px #D6E4FA}' +
      '.p4-st2 .tt{font-size:14px;line-height:1.5;color:#0F2549;font-weight:600}.p4-st2 .tags{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.p4-tag{display:inline-flex;align-items:center;gap:5px;padding:2px 10px;border-radius:99px;font-size:12px;font-weight:700;background:#EEF2F7;color:#33425E}' +
      '.p4-goal{margin-top:10px}.p4-goal .gl{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:#5B6B86;margin-bottom:4px}.p4-goal .gl b{color:#0B2A5B}' +
      '.p4-gt{position:relative;height:12px;border-radius:6px;background:#EEF2F8}.p4-gt .cur{position:absolute;left:0;top:0;bottom:0;border-radius:6px;background:#E2574C}.p4-gt .tg{position:absolute;top:-4px;bottom:-4px;border-left:3px solid #16794A}' +
      '.p4-kp2{margin-top:8px;font-size:12.5px;color:#33425E}.p4-kp2 b{color:#0B2A5B}' +
      '.p4-talk{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}.p4-ct{border-left:3px solid #E0A030;background:#FFF9EE;border-radius:0 10px 10px 0;padding:8px 12px;font-size:13px;color:#5A3E00;margin-bottom:8px}' +
      '.p4-q{display:flex;gap:10px;align-items:flex-start;margin-bottom:8px}.p4-q .qn{flex:none;width:22px;height:22px;border-radius:50%;background:#0A63C4;color:#fff;display:grid;place-items:center;font-size:11.5px;font-weight:800;margin-top:4px}' +
      '.p4-q div.bb{background:#F2F7FF;border:1px solid #D6E4FA;border-radius:4px 14px 14px 14px;padding:8px 12px;font-size:13px;line-height:1.5;color:#1B2F52}' +
      '.p4-sub{font-size:12px;font-weight:800;color:#5B6B86;text-transform:uppercase;letter-spacing:.04em;margin:0 0 8px}' +
      '@media(max-width:640px){.p4-ar{grid-template-columns:1fr}.p4-ar .nv{text-align:left}.p4-hero h3{font-size:17px}}';
    document.head.appendChild(st);
  }

  // ---------- ① Kết luận ----------
  function hero(r) {
    var ls = r.lenses || [], o = overall(ls), L = lv(o.level), h = r.headline || {}, conf = h.confidence === 'cao' ? 3 : h.confidence === 'vừa' ? 2 : 1;
    var parts = []; if (o.n.risk) parts.push(o.n.risk + ' rủi ro'); if (o.n.watch) parts.push(o.n.watch + ' cần chú ý'); if (o.n.ok) parts.push(o.n.ok + ' ổn'); if (o.n.good) parts.push(o.n.good + ' điểm sáng'); if (o.na) parts.push(o.na + ' thiếu dữ liệu');
    var pos = lens(r, 'position'), areas = lens(r, 'areas'), trend = lens(r, 'trend'), sales = lens(r, 'sales'), tiles = [];
    if (pos && pos.bar && pos.bar.me != null) {
      var pl = lv(pos.level);
      tiles.push('<div class="p4-k" style="--c:' + pl.bar + '"><div class="l">Năng lực so với đồng nghiệp</div><div class="v">' + n1(pos.bar.me) + '<small>%</small></div>' +
        (pos.bar.peer != null ? '<div class="p4-m" role="img" aria-label="Người này ' + n1(pos.bar.me) + ' phần trăm, đồng nghiệp ' + n1(pos.bar.peer) + ' phần trăm"><i class="me" style="width:' + pct(pos.bar.me) + '%;background:' + pl.bar + '"></i><i class="pe" style="left:' + pct(pos.bar.peer) + '%"></i></div><div class="s">vạch đen: ' + e(pos.bar.label || 'đồng nghiệp') + ' ' + n1(pos.bar.peer) + '%</div>' : '<div class="s">chưa có mốc so sánh</div>') + '</div>');
    }
    if (areas && areas.areas && areas.areas.length) {
      var A = areas.areas, weak = A.filter(function (a) { return a.pct < WEAK; }).length, al = lv(areas.level);
      tiles.push('<div class="p4-k" style="--c:' + al.bar + '"><div class="l">Mảng kiến thức yếu</div><div class="v">' + weak + '<small>/ ' + A.length + ' mảng dưới ' + WEAK + '%</small></div><div class="s">' + (weak ? 'Yếu nhất: ' + e(A.slice().sort(function (x, y) { return x.pct - y.pct; })[0].name) : 'Không mảng nào dưới mốc yếu') + '</div></div>');
    }
    if (trend) {
      var tl = lv(trend.level), sp = trend.spark;
      if (sp && sp.length >= 2) { var d = sp[sp.length - 1] - sp[0]; tiles.push('<div class="p4-k" style="--c:' + tl.bar + '"><div class="l">Xu hướng qua các kỳ</div><div class="v">' + (d > 0 ? '▲ +' : d < 0 ? '▼ ' : '') + n1(d) + '<small>điểm</small></div><div class="s">qua ' + sp.length + ' kỳ kiểm tra</div></div>'); }
      else tiles.push('<div class="p4-k" style="--c:' + tl.bar + '"><div class="l">Xu hướng qua các kỳ</div><div class="v" style="font-size:16px">' + tl.t + '</div><div class="s">' + e(short(trend.insight, 70)) + '</div></div>');
    }
    if (sales) { var sl = lv(sales.level); tiles.push('<div class="p4-k" style="--c:' + sl.bar + '"><div class="l">Kết quả kinh doanh</div><div class="v" style="font-size:16px">' + sl.t + '</div><div class="s">' + e(short(sales.insight, 70)) + '</div></div>'); }
    return '<div class="p4-hero" style="--p4c:' + L.bar + ';--p4b:' + L.bg + ';--p4t:' + L.c + '">' +
      '<div class="p4-st"><span class="p4-pill"><i></i>' + OVERALL[o.level] + '</span><small>' + (parts.join(' · ') || 'Chưa có góc nhìn nào đủ dữ liệu') + '</small></div>' +
      '<h3>' + e(h.title || 'Chưa có kết luận nổi bật') + '</h3>' +
      (h.text ? '<p>' + e(short(h.text, 230)) + '</p>' + (String(h.text).length > 230 ? '<details><summary>Xem lập luận đầy đủ</summary><p style="margin-top:6px">' + e(h.text) + '</p></details>' : '') : '') +
      '<div class="p4-conf">Độ tin cậy của kết luận<span class="p4-cm" role="img" aria-label="Độ tin cậy ' + ea(h.confidence || 'thấp') + '"><i class="' + (conf >= 1 ? 'on' : '') + '"></i><i class="' + (conf >= 2 ? 'on' : '') + '"></i><i class="' + (conf >= 3 ? 'on' : '') + '"></i></span><b style="color:#0B2A5B">' + e(h.confidence || 'thấp') + '</b></div>' +
      (tiles.length ? '<div class="p4-kp">' + tiles.join('') + '</div>' : '') + '</div>';
  }

  // ---------- ② Bằng chứng ----------
  function strip(ls) {
    return '<div class="p4-strip" role="list">' + ls.map(function (l) { var x = lv(l.level); return '<button type="button" class="p4-chip" role="listitem" data-p4go="' + ea(l.id) + '" style="--c:' + x.bar + ';--t:' + x.c + '" title="Xem góc nhìn: ' + ea(l.name) + '"><i></i>' + e(l.name) + '<small>' + x.t + '</small></button>'; }).join('') + '</div>';
  }
  function card(l) {
    var x = lv(l.level), vis = '';
    if (l.bar && l.bar.me != null && l.bar.peer != null) vis = '<div class="p4-m" role="img" aria-label="Người này ' + n1(l.bar.me) + ' phần trăm, ' + ea(l.bar.label || 'đồng nghiệp') + ' ' + n1(l.bar.peer) + ' phần trăm"><i class="me" style="width:' + pct(l.bar.me) + '%;background:' + x.bar + '"></i><i class="pe" style="left:' + pct(l.bar.peer) + '%"></i></div><div class="s" style="font-size:11.5px;color:#5B6B86">Người này <b>' + n1(l.bar.me) + '%</b> · vạch đen: ' + e(l.bar.label || 'đồng nghiệp') + ' ' + n1(l.bar.peer) + '%</div>';
    else if (l.spark && l.spark.length > 1 && typeof p3Spark === 'function') vis = p3Spark(l.spark);
    else if (l.id === 'areas' && l.areas && l.areas.length) vis = '<div style="font-size:11.5px;color:#5B6B86;margin-top:6px">Xem biểu đồ từng mảng ngay bên dưới ↓</div>';
    var full = String(l.insight || ''), sh = short(full, 130);
    return '<div class="p4-c ' + (l.level === 'na' ? 'na' : '') + '" id="p4l-' + ea(l.id) + '" style="--c:' + x.bar + ';--bg:' + x.bg + ';--t:' + x.c + '"><div class="hh"><span class="ic">' + ico(l.id, 17) + '</span><b>' + e(l.name) + '</b><span class="p3-lv ' + ea(l.level) + '">' + x.t + '</span></div>' +
      '<p class="s">' + e(sh) + '</p>' + vis +
      ((l.evidence || []).length || full.length > sh.length ? '<details><summary>Xem chi tiết' + ((l.evidence || []).length ? ' và bằng chứng (' + l.evidence.length + ')' : '') + '</summary>' + (full.length > sh.length ? '<p>' + e(full) + '</p>' : '') + ((l.evidence || []).length ? '<ul>' + l.evidence.map(function (t) { return '<li>' + e(t) + '</li>'; }).join('') + '</ul>' : '') + '</details>' : '') + '</div>';
  }
  function areasChart(l) {
    if (!l || !l.areas || !l.areas.length) return '';
    var A = l.areas.slice().sort(function (a, b) { return (a.gap == null ? 1e3 + a.pct : a.gap) - (b.gap == null ? 1e3 + b.pct : b.gap); });
    var rows = A.map(function (a) {
      var k = KIND[a.kind] || KIND.unknown;
      return '<div class="p4-ar"><div class="nm"><b>' + e(a.name) + '</b><span class="kd" style="--bg:' + k[2] + ';--t:' + k[1] + '">' + k[0] + '</span></div>' +
        '<div class="p4-tr" style="--c:' + k[3] + '" role="img" aria-label="' + ea(a.name) + ': ' + n1(a.pct) + ' phần trăm' + (a.peer != null ? ', đồng nghiệp ' + n1(a.peer) + ' phần trăm' : '') + '"><i class="zone"></i><i class="me" style="width:' + pct(a.pct) + '%"></i>' + (a.peer != null ? '<i class="pe" style="left:' + pct(a.peer) + '%"></i>' : '') + '</div>' +
        '<div class="nv"><b>' + n1(a.pct) + '%</b><small>' + (a.peer != null ? 'đồng nghiệp ' + n1(a.peer) + '% · ' + (a.gap > 0 ? '+' : '') + n1(a.gap) + ' điểm' : 'chưa có mốc') + ' · ' + a.n + ' câu</small></div>' +
        ((a.topics || []).length ? '<div class="tp">Chủ đề yếu: ' + a.topics.map(e).join(', ') + '</div>' : '') + '</div>';
    }).join('');
    var per = A.filter(function (a) { return a.kind === 'personal'; }), sh = A.filter(function (a) { return a.kind === 'shared'; }), ed = A.filter(function (a) { return a.kind === 'edge'; }), t = [];
    if (per.length) t.push('<b>Lỗ hổng riêng</b> (' + per.map(function (a) { return e(a.name); }).join(', ') + '): đồng nghiệp làm được, nên cần <b>kèm cặp 1-1 cho cá nhân</b>.');
    if (sh.length) t.push('<b>Yếu cả nhóm</b> (' + sh.map(function (a) { return e(a.name); }).join(', ') + '): nhiều khả năng do <b>nội dung hoặc cách đào tạo</b>, không nên quy cho cá nhân.');
    if (ed.length) t.push('<b>Nổi trội</b> (' + ed.slice(0, 2).map(function (a) { return e(a.name); }).join(', ') + '): có thể nhờ người này chia sẻ lại cho đồng nghiệp.');
    return '<div class="p4-c" style="--c:#7FA7DD;margin-top:12px"><div class="hh"><span class="ic" style="--bg:#E8F0FB;--t:#0B3F94">' + ico('areas', 17) + '</span><b>Điểm từng mảng kiến thức, so với đồng nghiệp cùng vị trí</b></div>' +
      '<div class="p4-lg"><span><i style="background:#E2574C"></i>Người này</span><span><i class="pk"></i>Đồng nghiệp trung bình</span><span><i style="background:repeating-linear-gradient(135deg,#F3C9C5,#F3C9C5 3px,#FDF3F2 3px,#FDF3F2 6px)"></i>Vùng dưới ' + WEAK + '% (yếu)</span></div>' +
      rows + (t.length ? '<div class="p4-take">' + t.join('<br>') + '</div>' : '') + '</div>';
  }

  // ---------- ③ Nguyên nhân ----------
  function hyps(r) {
    var H = r.hypotheses || []; if (!H.length) return '<div class="empty">Chưa có giả thuyết nổi bật.</div>';
    return H.map(function (x, i) {
      var f = (x['for'] || []).length, a = (x.against || []).length, tot = Math.max(1, f + a);
      return '<div class="p4-hy"><div class="top"><span class="n">' + (i + 1) + '</span><b>' + e(x.title) + (i === 0 ? ' <span class="p3-lv ok" style="margin-left:6px">Nhiều bằng chứng nhất</span>' : '') + '</b></div>' +
        '<div class="p4-mt" role="img" aria-label="Ủng hộ ' + f + ' bằng chứng, phản bác ' + a + '"><i class="f" style="flex:' + (f || 0.0001) + '"></i><i class="a" style="flex:' + (a || 0.0001) + '"></i></div>' +
        '<div class="mm">Ủng hộ <b>' + f + '</b> · Phản bác <b class="x">' + a + '</b> bằng chứng (' + Math.round(f / tot * 100) + '% ủng hộ)</div>' +
        '<details><summary>Xem bằng chứng</summary><ul>' + (x['for'] || []).map(function (t) { return '<li>' + e(t) + '</li>'; }).join('') + (x.against || []).map(function (t) { return '<li class="x">Phản bác: ' + e(t) + '</li>'; }).join('') + '</ul></details>' +
        (x.verify ? '<div class="p4-vf"><b>Kiểm chứng trước:</b><span>' + e(x.verify) + '</span></div>' : '') + '</div>';
    }).join('');
  }

  // ---------- ④ Hành động ----------
  function owner(w) {
    w = String(w || ''); var c = /Đào tạo/i.test(w) ? ['#EFE9F8', '#6B4BA6'] : /Quản lí/i.test(w) ? ['#E4EEFC', '#0B3F94'] : ['#EEF2F7', '#33425E'];
    return '<span class="p4-tag" style="background:' + c[0] + ';color:' + c[1] + '">' + ico('team', 13) + e(w) + '</span>';
  }
  function plan(r) {
    var P = r.plan || []; if (!P.length) return '';
    var H = r.hypotheses || [];
    return '<div class="p4-tl">' + P.map(function (x, i) {
      var m = /từ\s*([\d.,]+)\s*%\s*lên\s*[≥>=]*\s*([\d.,]+)\s*%/i.exec(String(x.kpi || '')), cur = m ? parseFloat(m[1].replace(',', '.')) : NaN, tg = m ? parseFloat(m[2].replace(',', '.')) : NaN;
      var goal = isFinite(cur) && isFinite(tg)
        ? '<div class="p4-goal"><div class="gl"><span>Mục tiêu cần đạt</span><span><b>' + n1(cur) + '%</b> → <b style="color:#16794A">≥ ' + n1(tg) + '%</b></span></div><div class="p4-gt" role="img" aria-label="Hiện tại ' + n1(cur) + ' phần trăm, mục tiêu ' + n1(tg) + ' phần trăm"><i class="cur" style="width:' + pct(cur) + '%"></i><i class="tg" style="left:' + pct(tg) + '%"></i></div>' + (m && /\(([^)]+)\)\s*$/.test(x.kpi) ? '<div class="p4-kp2">' + e(/\(([^)]+)\)\s*$/.exec(x.kpi)[1]) + '</div>' : '') + '</div>'
        : (x.kpi ? '<div class="p4-kp2"><b>Đo bằng:</b> ' + e(x.kpi) + '</div>' : '');
      var hi = H.map(function (y) { return y.id; }).indexOf(x.hid);
      return '<div class="p4-st2"><span class="no">' + (i + 1) + '</span><div class="tt">' + e(x.t) + '</div><div class="tags">' + owner(x.who) + '<span class="p4-tag">' + ico('behavior', 13) + e(x.when) + '</span>' + (hi >= 0 ? '<span class="p4-tag" style="background:#E8F0FB;color:#0B3F94">Xử lý giả thuyết ' + (hi + 1) + '</span>' : '') + '</div>' + goal + '</div>';
    }).join('') + '</div>';
  }

  // ---------- ⑤ Buổi 1-1 ----------
  function talk(r) {
    var c = r.contradictions || [], q = r.questions || []; if (!c.length && !q.length) return '';
    return '<div class="p4-talk">' + (c.length ? '<div><div class="p4-sub">Mâu thuẫn cần đào sâu</div>' + c.map(function (t) { return '<div class="p4-ct">' + e(t) + '</div>'; }).join('') + '</div>' : '') +
      (q.length ? '<div><div class="p4-sub">Câu hỏi gợi ý cho buổi 1-1</div>' + q.map(function (t, i) { return '<div class="p4-q"><span class="qn">' + (i + 1) + '</span><div class="bb">“' + e(t) + '”</div></div>'; }).join('') + '</div>' : '') + '</div>';
  }

  function sec(no, title, sub, body) { return body ? '<div class="p4-sec"><div class="p4-sh"><span class="no">' + no + '</span><div><b>' + title + '</b><small>' + sub + '</small></div></div>' + body + '</div>' : ''; }

  // r: dữ liệu person360 (đã có kết luận). Trả về HTML phần thân của thẻ "Nhận định đa chiều".
  window.p360Body = function (r) {
    cssOnce();
    var ls = r.lenses || [], A = lens(r, 'areas');
    var ind = typeof p3Industry === 'function' ? p3Industry(r.industry) : '', ai = typeof p3AiHtml === 'function' ? p3AiHtml() : '';
    return sec(1, 'Kết luận', 'Điều gì đang xảy ra', hero(r)) +
      sec(2, 'Bằng chứng', '7 góc nhìn đối chiếu nhau. Màu: <span style="color:#C0332B">đỏ rủi ro</span> · <span style="color:#9A5B00">vàng cần chú ý</span> · <span style="color:#0B3F94">xanh ổn</span> · <span style="color:#16794A">lá điểm sáng</span>', strip(ls) + '<div class="p4-grid">' + ls.map(card).join('') + '</div>' + areasChart(A)) +
      sec(3, 'Nguyên nhân', 'Các giả thuyết, xếp theo mức bằng chứng ủng hộ', hyps(r)) +
      sec(4, 'Hành động', 'Kế hoạch 30 ngày, theo thứ tự ưu tiên của chẩn đoán', plan(r)) +
      sec(5, 'Chuẩn bị buổi 1-1', 'Điều cần hỏi để kiểm chứng trước khi kết luận', talk(r)) +
      ind + ai + '<div class="q" style="margin-top:12px">' + e(r.method || '') + ' Dữ liệu năng lực tổng hợp lúc ' + e(typeof vnDT === 'function' ? vnDT(r.cachedAt) : '') + '. Là gợi ý để quản lí kiểm chứng, không dùng để quyết định nhân sự.</div>';
  };
  // bấm chip ở dải 7 góc nhìn: cuộn tới thẻ, mở chi tiết, nháy viền
  window.p4Go = function (id) {
    var el = document.getElementById('p4l-' + id); if (!el) return;
    var d = el.querySelector('details'); if (d) d.open = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); setTimeout(function () { el.classList.remove('flash'); }, 1600);
  };
  document.addEventListener('click', function (ev) { var b = ev.target.closest && ev.target.closest('[data-p4go]'); if (b) window.p4Go(b.getAttribute('data-p4go')); });
})();
