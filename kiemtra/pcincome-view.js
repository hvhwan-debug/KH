/* Hồ sơ nhân viên › tab "Ước tính thu nhập" (CHỈ chức danh PC, chỉ quản trị viên).
   Tính ở máy chủ (api/_lib/pcincome.js, theo "Chính sách thu nhập Phòng Kinh doanh GT"); file này chỉ lo HIỂN THỊ và ô nhập tay.
   Đọc từ trên xuống: kết quả → cách tính từng bước (doanh thu → hoa hồng → điểm tuân thủ → thưởng tháng → tổng) → thưởng quý → dữ liệu nhập tay.
   Mục nào chưa có dữ liệu thì hiện KHOẢNG (tối thiểu – tối đa), không đưa một con số dễ gây hiểu nhầm.
   Dùng hàm có sẵn của trang: api(), esc(). Gọi: pcIncomeMount(phần_tử, mã_nv). */
(function () {
  'use strict';
  var COL = { base: '#7FA7DD', review: '#A99BE0', bonus: '#22A35E', allow: '#E0A030' };
  var SRC = { system: ['Hệ thống', '#16794A', '#DDF3E8'], input: ['Đã nhập', '#0B3F94', '#E8F0FB'], unknown: ['Chưa có dữ liệu', '#9A5B00', '#FFF1D6'], partial: ['Nhập một phần', '#9A5B00', '#FFF1D6'] };

  function e(s) { return typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function vnd(n) { return Math.round(n || 0).toLocaleString('vi-VN') + ' đ'; }
  function tr(n) { return (Math.round((n || 0) / 1e4) / 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' triệu'; }
  function n1(x) { return (Math.round(x * 10) / 10).toLocaleString('vi-VN', { maximumFractionDigits: 1 }); }
  function rt(x) { return x.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'; }   // tỷ lệ hoa hồng luôn 1 chữ số thập phân như bảng chính sách (2,0%)
  function mon(m) { return 'T' + (+m.slice(5)) + '/' + m.slice(0, 4); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function range(a, b, f) { return a === b ? f(a) : f(a) + ' – ' + f(b); }

  function css() {
    if (document.getElementById('piCss')) return;
    var st = document.createElement('style'); st.id = 'piCss';
    st.textContent =
      '.pi-hd{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 12px}.pi-hd select{height:36px;border:1px solid #CFD9EA;border-radius:10px;padding:0 10px;font:inherit;background:#fff;color:#0B2A5B;font-weight:700}' +
      '.pi-seg{display:inline-flex;border:1px solid #CFD9EA;border-radius:10px;overflow:hidden}.pi-seg button{border:0;background:#fff;color:#33425E;font:inherit;font-size:13px;font-weight:700;padding:8px 12px;cursor:pointer}.pi-seg button[aria-pressed="true"]{background:#0A63C4;color:#fff}' +
      '.pi-hero{border:1px solid #D6E4FA;border-left:6px solid #22A35E;border-radius:16px;padding:16px 18px;background:linear-gradient(135deg,#F3FBF6,#fff)}.pi-hero .l{font-size:13px;font-weight:700;color:#5B6B86}' +
      '.pi-big{font-size:clamp(26px,5vw,36px);font-weight:800;color:#0B2A5B;letter-spacing:-.02em;line-height:1.15;margin:4px 0}.pi-big small{font-size:15px;color:#5B6B86;font-weight:700;margin-left:6px}' +
      '.pi-stack{display:flex;height:16px;border-radius:8px;overflow:hidden;background:#EEF2F8;margin:12px 0 8px}.pi-stack i{display:block;height:100%}' +
      '.pi-lg{display:flex;gap:6px 16px;flex-wrap:wrap;font-size:12.5px;color:#33425E}.pi-lg span{display:inline-flex;align-items:center;gap:6px}.pi-lg i{width:10px;height:10px;border-radius:3px}.pi-lg b{color:#0B2A5B}' +
      '.pi-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.pi-chip{display:inline-flex;gap:6px;align-items:center;padding:4px 12px;border-radius:99px;font-size:12.5px;font-weight:700;background:#EEF2F7;color:#33425E}' +
      '.pi-warn{margin-top:12px;padding:10px 12px;border-radius:10px;background:#FFF4DE;border:1px solid #F0D49A;font-size:13px;line-height:1.55;color:#6B4400}.pi-warn.bad{background:#FDECEA;border-color:#F3C3BE;color:#8A241C}.pi-warn ul{margin:4px 0 0;padding-left:18px}' +
      '.pi-sec{margin-top:20px}.pi-sh{display:flex;align-items:center;gap:10px;margin:0 0 10px}.pi-sh .no{flex:none;width:26px;height:26px;border-radius:50%;background:#0A63C4;color:#fff;display:grid;place-items:center;font-size:13px;font-weight:800}.pi-sh b{font-size:15px;color:#0B2A5B}.pi-sh small{color:#5B6B86;font-size:12.5px}' +
      '.pi-c{border:1px solid #E1E8F2;border-radius:14px;padding:12px 14px;background:#fff;margin-bottom:10px}.pi-fm{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:14px;color:#22324F}.pi-fm .v{padding:6px 12px;border-radius:10px;background:#F1F6FD;border:1px solid #DCE7F7;font-weight:800;color:#0B2A5B}.pi-fm .op{color:#5B6B86;font-weight:800}.pi-fm .v.res{background:#0A63C4;border-color:#0A63C4;color:#fff}' +
      '.pi-sub{font-size:12.5px;color:#5B6B86;margin-top:6px;line-height:1.5}' +
      '.pi-mt{position:relative;height:12px;border-radius:6px;background:#EEF2F8;margin:12px 0 6px}.pi-mt .f{position:absolute;left:0;top:0;bottom:0;border-radius:6px;background:var(--c,#0A63C4)}.pi-mt .k{position:absolute;top:-5px;bottom:-5px;border-left:2px dashed #7C8AA5}.pi-mt .kl{position:absolute;top:16px;transform:translateX(-50%);font-size:11px;color:#5B6B86;white-space:nowrap}' +
      '.pi-tbl{width:100%;border-collapse:collapse;font-size:13px}.pi-tbl th,.pi-tbl td{padding:7px 10px;border-bottom:1px solid #E6EDF7;text-align:right;white-space:nowrap}.pi-tbl th:first-child,.pi-tbl td:first-child{text-align:left}.pi-tbl th{font-size:12px;color:#5B6B86;font-weight:700;background:#F6F9FD}.pi-tbl tr.on td{background:#EAF6EE;font-weight:800;color:#0B2A5B}.pi-tbl td.on{background:#22A35E;color:#fff;font-weight:800;border-radius:6px}.pi-tw{overflow-x:auto}' +
      '.pi-pt{display:grid;grid-template-columns:130px 1fr 110px;gap:8px 12px;align-items:center;padding:8px 0;border-top:1px dashed #E1E8F2}.pi-pt:first-child{border-top:0}.pi-pt b{font-size:13.5px;color:#0B2A5B}.pi-pt .bar{height:10px;border-radius:5px;background:#EEF2F8;overflow:hidden}.pi-pt .bar i{display:block;height:100%;background:#0A63C4;border-radius:5px}.pi-pt .pv{text-align:right;font-weight:800;color:#0B2A5B;font-size:14px}.pi-pt .pv small{color:#5B6B86;font-weight:600}' +
      '.pi-sb{display:inline-block;padding:1px 8px;border-radius:99px;font-size:11px;font-weight:800;margin-left:6px;vertical-align:middle}.pi-it{grid-column:1 / -1;display:flex;gap:8px 16px;flex-wrap:wrap;font-size:12px;color:#33425E;padding-left:12px}.pi-it span b{color:#0B2A5B}' +
      '.pi-ck{display:flex;gap:8px;align-items:flex-start;font-size:13.5px;padding:4px 0;color:#22324F}.pi-ck i{flex:none;width:20px;height:20px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-size:12px;font-weight:800;color:#fff;margin-top:1px}.pi-ck i.y{background:#22A35E}.pi-ck i.n{background:#E2574C}.pi-ck small{color:#5B6B86}' +
      '.pi-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}.pi-form label{display:block;font-size:12.5px;font-weight:700;color:#33425E;margin-bottom:3px}.pi-form input,.pi-form select{width:100%;height:38px;border:1px solid #CFD9EA;border-radius:10px;padding:0 10px;font:inherit;background:#fff;color:#0B2A5B}.pi-form .h{font-size:11.5px;color:#7C8AA5;margin-top:2px}' +
      '.pi-act{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.pi-act button{height:38px;padding:0 16px;border-radius:10px;border:1px solid #CFE0FA;background:#fff;color:#0A63C4;font:inherit;font-size:13.5px;font-weight:800;cursor:pointer}.pi-act button.pri{background:#0A63C4;color:#fff;border-color:#0A63C4}.pi-act button:disabled{opacity:.55;cursor:default}' +
      '.pi-msg{margin-top:10px;font-size:13px;color:#5B6B86}.pi-msg.ok{color:#16794A}.pi-msg.err{color:#C0332B}.pi-hist tr{cursor:pointer}.pi-hist tr:hover td{background:#F4F8FF}' +
      '@media(max-width:640px){.pi-pt{grid-template-columns:1fr}.pi-pt .pv{text-align:left}}';
    document.head.appendChild(st);
  }
  function sec(no, title, sub, body) { return '<div class="pi-sec"><div class="pi-sh"><span class="no">' + no + '</span><div><b>' + title + '</b> <small>' + sub + '</small></div></div>' + body + '</div>'; }

  // ---------- phần kết quả ----------
  function hero(P, M, Q, unk) {
    var H = P.high, L = P.low, total = unk ? range(L.total, H.total, tr) : tr(M.total);
    var parts = [['Lương cơ bản', M.base, COL.base], ['Thưởng đánh giá', M.review, COL.review], ['Thưởng doanh thu tháng', M.bonus || 0, COL.bonus], ['Phụ cấp', M.allowances.total, COL.allow]];
    var sum = parts.reduce(function (a, x) { return a + x[1]; }, 0) || 1;
    var warns = (M.warns || []);
    return '<div class="pi-hero"><div class="l">Thu nhập ước tính ' + e(mon(P.month)) + ' · ' + e(P.name) + '</div>' +
      '<div class="pi-big">' + total + '<small>(gộp, chưa trừ BHXH/thuế)</small></div>' +
      '<div class="pi-stack" role="img" aria-label="Cơ cấu thu nhập tháng">' + parts.map(function (x) { return x[1] > 0 ? '<i style="width:' + (x[1] / sum * 100) + '%;background:' + x[2] + '" title="' + e(x[0] + ': ' + vnd(x[1])) + '"></i>' : ''; }).join('') + '</div>' +
      '<div class="pi-lg">' + parts.map(function (x) { return '<span><i style="background:' + x[2] + '"></i>' + e(x[0]) + ' <b>' + vnd(x[1]) + '</b></span>'; }).join('') + '</div>' +
      '<div class="pi-chips"><span class="pi-chip">Hoàn thành doanh thu: <b>' + (M.completion == null ? '–' : n1(M.completion) + '%') + '</b></span>' +
        (M.group ? '<span class="pi-chip">' + e(M.group.label) + (M.group.byInput ? ' (chọn tay)' : '') + ' · hoa hồng <b>' + rt(M.rate) + '</b></span>' : '') +
        '<span class="pi-chip">Điểm tuân thủ: <b>' + n1(M.score.total) + '</b> → mức hưởng <b>' + M.factor + '%</b></span>' +
        (Q ? '<span class="pi-chip">' + e(Q.label) + ': thưởng quý ước tính <b>' + vnd(Q.q3) + '</b></span>' : '') + '</div>' +
      (unk ? '<div class="pi-warn"><b>Chưa đủ dữ liệu điểm tuân thủ</b> (' + e(missing(M).join(', ')) + '), nên đang hiện <b>khoảng</b>: mức thấp nhất là các mục chưa có tính 0 điểm, mức cao nhất là đủ điểm. Nhập số thật ở mục ⑥ để ra một con số.</div>' : '') +
      (warns.length ? '<div class="pi-warn' + (M.score.total < P.policy.warnBelow ? ' bad' : '') + '"><b>Lưu ý</b><ul>' + warns.map(function (w) { return '<li>' + e(w) + '</li>'; }).join('') + '</ul></div>' : '') + '</div>';
  }
  function missing(M) { var m = []; M.score.parts.forEach(function (p) { if (p.source === 'unknown' || p.source === 'partial') m.push(p.label.toLowerCase()); }); return m; }

  // ---------- ① ② doanh thu & hoa hồng ----------
  function revenue(P, M) {
    var s = P.sale, pol = P.policy;
    if (M.noTarget) return '<div class="pi-c"><div class="pi-fm">Tháng này <b>chưa có chỉ tiêu doanh số</b> trong file Salerep, nên chưa tính được hoa hồng. Thực đạt: <span class="v">' + vnd(M.actual) + '</span></div><div class="pi-sub">Hãy cập nhật chỉ tiêu ở trang Kết quả số bán.</div></div>';
    var comp = M.completion, w = clamp(comp, 0, 100), marks = [60, 80, 100];
    var c1 = '<div class="pi-c"><div class="pi-fm"><span>Doanh thu thực đạt</span><span class="v">' + vnd(M.actual) + '</span><span class="op">÷</span><span>Chỉ tiêu</span><span class="v">' + vnd(M.effTarget) + '</span><span class="op">=</span><span class="v res">' + n1(comp) + '%</span></div>' +
      '<div class="pi-mt" style="--c:' + (comp >= 100 ? '#22A35E' : comp >= 60 ? '#E0A030' : '#E2574C') + '" role="img" aria-label="Hoàn thành ' + n1(comp) + ' phần trăm"><i class="f" style="width:' + w + '%"></i>' + marks.map(function (k) { return '<i class="k" style="left:' + k + '%"></i><span class="kl" style="left:' + k + '%">' + k + '%</span>'; }).join('') + '</div>' +
      '<div class="pi-sub" style="margin-top:22px">' + (M.effTarget > M.target ? 'Chỉ tiêu được giao ' + vnd(M.target) + ' thấp hơn mức tối thiểu của ' + e(M.group.label) + ', nên tính theo <b>' + vnd(M.effTarget) + '</b>. ' : '') + 'Mốc nhận thưởng doanh thu: từ 60%. Doanh thu ghi nhận tối đa 100% chỉ tiêu, phần vượt chi trả theo chính sách vượt mục tiêu (mục ⑤).</div></div>';
    return c1;
  }
  function commission(P, M) {
    var pol = P.policy;
    var rows = pol.groups.map(function (g) {
      var cur = M.group && g.key === M.group.key;
      return '<tr class="' + (cur ? 'on' : '') + '"><td>' + e(g.label) + '</td><td>' + (g.max === Infinity || g.max == null ? '≥ ' + Math.round(g.min / 1e6) + ' tr' : Math.round(g.min / 1e6) + ' – ' + Math.round(g.max / 1e6) + ' tr') + '</td>' +
        g.rates.map(function (r, i) { return '<td' + (cur && M.tier === i ? ' class="on"' : '') + '>' + rt(r) + '</td>'; }).join('') + '</tr>';
    }).join('');
    var c2 = '<div class="pi-c"><div class="pi-fm"><span>Doanh thu ghi nhận (tối đa 100%)</span><span class="v">' + vnd(M.counted) + '</span><span class="op">×</span><span>Tỷ lệ hoa hồng</span><span class="v">' + rt(M.rate) + '</span><span class="op">=</span><span class="v res">' + vnd(M.q2dt) + '</span></div>' +
      '<div class="pi-sub">Thưởng hoàn thành doanh thu tháng (Q2dt). ' + (M.group ? 'Nhóm điểm bán ' + (M.group.byInput ? 'do bạn chọn' : 'suy ra từ chỉ tiêu tháng') + ': <b>' + e(M.group.label) + '</b>.' : '') + '</div>' +
      '<div class="pi-tw" style="margin-top:8px"><table class="pi-tbl"><thead><tr><th>Phân loại điểm bán</th><th>Chỉ tiêu tháng</th><th>≥ 60%</th><th>≥ 80%</th><th>≥ 100%</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
    return c2;
  }

  // ---------- ③ điểm tuân thủ ----------
  function score(P, M) {
    var pol = P.policy, sc = M.score, tot = sc.total;
    var parts = sc.parts.map(function (p) {
      var s = SRC[p.source] || SRC.unknown, pctw = p.max ? clamp(p.points / p.max * 100, 0, 100) : 0;
      var note = p.source === 'unknown' ? ' <small style="color:#9A5B00">(chưa có: đang tính ' + (p.points > 0 ? 'đủ điểm' : '0') + ')</small>' : '';
      var items = p.items ? '<div class="pi-it">' + p.items.map(function (x) { return '<span>' + e(x.label) + ': <b>' + n1(x.points) + '/' + x.max + '</b>' + (x.source === 'unknown' ? ' ·' : '') + '</span>'; }).join('') + '</div>' : (p.note || p.detail ? '<div class="pi-it"><span>' + e(p.note || p.detail) + '</span></div>' : '');
      return '<div class="pi-pt"><b>' + e(p.label) + ' <span class="pi-sb" style="background:' + s[2] + ';color:' + s[1] + '">' + s[0] + '</span></b><div class="bar" role="img" aria-label="' + e(p.label) + ' ' + n1(p.points) + ' trên ' + p.max + '"><i style="width:' + pctw + '%"></i></div><div class="pv">' + n1(p.points) + '<small> / ' + p.max + '</small>' + note + '</div>' + items + '</div>';
    }).join('');
    var lv = [['Từ 90 đến 100 điểm', 'Tính thưởng 100%', 90], ['Từ 80 đến dưới 90 điểm', 'Tính thưởng 90%', 80], ['Từ 70 đến dưới 80 điểm', 'Tính thưởng 80%', 70], ['Từ 60 đến dưới 70 điểm', 'Tính thưởng 70%', 60], ['Dưới 60 điểm', 'Không thưởng', -1]];
    var cur = lv.filter(function (x) { return tot >= x[2]; })[0] || lv[lv.length - 1];
    return '<div class="pi-c"><div class="pi-fm"><span>Tuân thủ</span><span class="v">' + n1(sc.parts[0].points) + '</span><span class="op">+</span><span>Kiến thức</span><span class="v">' + n1(sc.parts[1].points) + '</span><span class="op">+</span><span>Model định hướng</span><span class="v">' + n1(sc.parts[2].points) + '</span><span class="op">=</span><span class="v res">' + n1(tot) + ' điểm</span></div>' + parts +
      '<div class="pi-tw" style="margin-top:8px"><table class="pi-tbl"><thead><tr><th>Điểm tuân thủ</th><th>Mức hưởng thưởng tháng</th></tr></thead><tbody>' + lv.map(function (x) { return '<tr class="' + (x === cur ? 'on' : '') + '"><td>' + x[0] + '</td><td>' + x[1] + '</td></tr>'; }).join('') +
      '<tr><td>Dưới ' + pol.warnBelow + ' điểm</td><td>Cảnh cáo bằng văn bản và xem xét chấm dứt hợp đồng</td></tr></tbody></table></div></div>';
  }

  // ---------- ④ thưởng tháng và tổng ----------
  function monthTotal(P, M) {
    return '<div class="pi-c"><div class="pi-fm"><span>Thưởng hoàn thành doanh thu</span><span class="v">' + vnd(M.q2dt) + '</span><span class="op">×</span><span>Mức hưởng</span><span class="v">' + M.factor + '%</span><span class="op">=</span><span class="v res">' + vnd(M.bonus || 0) + '</span></div><div class="pi-sub">Thưởng tháng thực lĩnh (ví dụ trong chính sách: 5.000.000 × 90% = 4.500.000 đ).</div></div>' +
      '<div class="pi-c"><div class="pi-fm"><span>Lương cơ bản</span><span class="v">' + vnd(M.base) + '</span><span class="op">+</span><span>Thưởng đánh giá</span><span class="v">' + vnd(M.review) + '</span><span class="op">+</span><span>Thưởng tháng</span><span class="v">' + vnd(M.bonus || 0) + '</span><span class="op">+</span><span>Phụ cấp</span><span class="v">' + vnd(M.allowances.total) + '</span><span class="op">=</span><span class="v res">' + vnd(M.total) + '</span></div>' +
      '<div class="pi-sub">Phụ cấp gồm ăn trưa ' + vnd(M.allowances.lunch) + ' (30.000 đ/ngày) và điện thoại ' + vnd(M.allowances.phone) + '. Thưởng đánh giá tháng (nếu có) do bạn nhập ở mục ⑥. Chưa gồm thưởng quý và thưởng năm.</div></div>';
  }

  // ---------- ⑤ thưởng quý ----------
  function quarter(P, Q, Mscn) {
    var pol = P.policy.q3;
    var rows = Q.months.map(function (r) {
      if (r.none) return '<tr><td>' + e(mon(r.month)) + '</td><td colspan="4" style="text-align:left;color:#7C8AA5">chưa có dữ liệu</td></tr>';
      if (r.noTarget) return '<tr><td>' + e(mon(r.month)) + '</td><td>–</td><td>' + vnd(r.actual) + '</td><td>–</td><td>' + n1(r.score.total) + '</td></tr>';
      return '<tr><td>' + e(mon(r.month)) + '</td><td>' + vnd(r.effTarget) + '</td><td>' + vnd(r.actual) + '</td><td>' + n1(r.completion) + '%</td><td>' + n1(r.score.total) + '</td></tr>';
    }).join('');
    var tfTxt = Q.timeFactorMode === 'months' ? Q.monthsWithTarget + ' (số tháng)' : n1(Q.timeFactor) + ' (' + Q.monthsWithTarget + '/3 tháng)';
    return '<div class="pi-c"><div class="pi-sub" style="margin:0 0 8px"><b>' + e(Q.label) + '</b>' + (Q.complete ? '' : ' · mới có dữ liệu ' + Q.months.filter(function (r) { return !r.none; }).length + '/3 tháng, ước tính sẽ thay đổi khi đủ quý') + '</div>' +
      '<div class="pi-tw"><table class="pi-tbl"><thead><tr><th>Tháng</th><th>Chỉ tiêu</th><th>Thực đạt</th><th>% HT</th><th>Điểm tuân thủ</th></tr></thead><tbody>' + rows +
      '<tr class="on"><td>Cả quý</td><td>' + vnd(Q.target) + '</td><td>' + vnd(Q.actual) + '</td><td>' + (Q.ratio == null ? '–' : n1(Q.ratio) + '%') + '</td><td>' + (Q.avgScore == null ? '–' : 'TB ' + n1(Q.avgScore)) + '</td></tr></tbody></table></div>' +
      '<div class="pi-fm" style="margin-top:12px"><span>Doanh thu tính thưởng = thực đạt quý − 87% × chỉ tiêu quý</span><span class="v">' + vnd(Q.rewardBase) + '</span></div>' +
      '<div class="pi-fm" style="margin-top:8px"><span>Doanh thu tính thưởng</span><span class="v">' + vnd(Q.rewardBase) + '</span><span class="op">×</span><span>Tỷ lệ</span><span class="v">' + n1(Q.rate) + '%</span><span class="op">×</span><span>Hệ số thời gian</span><span class="v">' + tfTxt + '</span><span class="op">=</span><span class="v res">' + vnd(Q.q3) + '</span></div>' +
      '<div style="margin-top:10px"><div class="pi-sub" style="margin:0 0 4px"><b>Điều kiện nhận thưởng quý</b></div>' + Q.conditions.map(function (c) { return '<div class="pi-ck"><i class="' + (c.ok ? 'y' : 'n') + '">' + (c.ok ? '✓' : '✕') + '</i><span>' + e(c.label) + ' <small>(' + e(c.detail) + ')</small></span></div>'; }).join('') + '</div>' +
      '<div class="pi-sub">Chính sách ghi “hệ số thời gian là số tháng làm việc và có nhận chỉ tiêu trong quý” nhưng chưa nói rõ có chia cho 3 hay không. Hệ thống đang hiểu là <b>' + (Q.timeFactorMode === 'months' ? 'số tháng' : 'số tháng ÷ 3 (đủ quý = 1)') + '</b>; cần phòng Kinh doanh xác nhận. Thưởng thành tích năm / vượt trội năm: chính sách chưa nêu công thức nên chưa tính.</div></div>';
  }

  function sens(P) {
    return '<div class="pi-c"><div class="pi-sub" style="margin:0 0 6px">Cùng doanh thu của tháng này, thưởng tháng thay đổi thế nào theo điểm tuân thủ:</div><div class="pi-tw"><table class="pi-tbl"><thead><tr><th>Điểm tuân thủ</th><th>Mức hưởng</th><th>Thưởng tháng</th><th>Tổng thu nhập tháng</th></tr></thead><tbody>' +
      P.sensitivity.map(function (x) { return '<tr><td>' + (x.score === 59 ? 'Dưới 60 (59)' : x.score) + '</td><td>' + x.factor + '%</td><td>' + vnd(x.bonus) + '</td><td>' + vnd(x.total) + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
  }

  // ---------- ⑥ nhập tay ----------
  function form(P) {
    var inp = P.inputs[P.month] || {}, w = inp.work || {}, kn = P.knowledge[P.month], pol = P.policy;
    var f = function (id, label, val, ph, hint, step) { return '<div><label for="' + id + '">' + label + '</label><input id="' + id + '" type="number" inputmode="decimal" min="0" step="' + (step || 'any') + '" value="' + (val == null ? '' : e(val)) + '" placeholder="' + e(ph || '') + '">' + (hint ? '<div class="h">' + hint + '</div>' : '') + '</div>'; };
    return '<div class="pi-c"><div class="pi-sub" style="margin:0 0 10px">Các mục hệ thống chưa có số liệu. Để trống nghĩa là “chưa có” (ước tính sẽ hiện khoảng). Số nhập được lưu theo từng tháng.</div><div class="pi-form">' +
      pol.work.map(function (it) { return f('pi-w-' + it.key, e(it.label) + ' (tối đa ' + it.max + ')', w[it.key], 'chưa nhập', 'Đã trừ điểm vi phạm trong tháng'); }).join('') +
      f('pi-k', 'Điểm kiến thức (tối đa ' + pol.knowledgeMax + ')', inp.knowledge, kn ? 'hệ thống: ' + kn.points : 'chưa có', kn ? 'Lấy từ đợt “' + e(kn.title) + '”; nhập để ghi đè' : 'Chưa có đợt điểm tuân thủ của tháng này') +
      f('pi-ma', 'Số model định hướng thực đạt', inp.modelAch, 'chưa nhập', '') + f('pi-mt', 'Số model định hướng chỉ tiêu', inp.modelTarget, 'chưa nhập', 'Điểm = đạt ÷ chỉ tiêu × 30 (tối đa 30)') +
      f('pi-rv', 'Thưởng đánh giá tháng (đồng)', inp.review, '0', 'Nếu có', '1000') +
      '<div><label for="pi-g">Nhóm điểm bán</label><select id="pi-g"><option value="">Tự động theo chỉ tiêu tháng</option>' + pol.groups.map(function (g) { return '<option value="' + e(g.key) + '"' + (inp.group === g.key ? ' selected' : '') + '>' + e(g.label) + '</option>'; }).join('') + '</select><div class="h">Chọn tay nếu phân loại điểm bán khác với suy ra từ chỉ tiêu</div></div></div>' +
      '<div class="pi-act"><button type="button" data-pi="calc">Tính thử (chưa lưu)</button><button type="button" class="pri" data-pi="save">Lưu cho ' + e(mon(P.month)) + '</button><button type="button" data-pi="clear">Xoá số đã nhập</button></div><div class="pi-msg" id="pi-msg" role="status"></div></div>';
  }
  function history(P) {
    return '<div class="pi-c"><div class="pi-tw"><table class="pi-tbl pi-hist"><thead><tr><th>Tháng</th><th>% HT</th><th>Điểm tuân thủ</th><th>Thu nhập tháng (chưa gồm thưởng quý)</th></tr></thead><tbody>' +
      P.history.slice().reverse().map(function (h) { return '<tr data-pi-month="' + e(h.month) + '" class="' + (h.month === P.month ? 'on' : '') + '"><td>' + e(mon(h.month)) + '</td><td>' + (h.completion == null ? '–' : n1(h.completion) + '%') + '</td><td>' + (h.unknown ? n1(h.scoreMin) + ' – ' + n1(h.score) : n1(h.score)) + '</td><td>' + (h.unknown ? range(h.totalLow, h.totalHigh, tr) : tr(h.totalHigh)) + '</td></tr>'; }).join('') + '</tbody></table></div><div class="pi-sub">Bấm vào một tháng để xem chi tiết.</div></div>';
  }

  function html(st) {
    var P = st.data;
    if (!P) return '<div class="card"><div class="empty" style="padding:40px 14px">' + (st.err ? e(st.err) : 'Đang tính ước tính thu nhập…') + '</div></div>';
    if (!P.isPC) return '<div class="card"><div class="empty" style="padding:40px 14px">' + e(P.reason || 'Chính sách này chỉ áp dụng chức danh PC.') + '</div></div>';
    if (P.empty) return '<div class="card"><div class="empty" style="padding:40px 14px">Chưa có doanh số của mã NV <b>' + e(P.code) + '</b> trong file Salerep nên chưa ước tính được thu nhập.<br><span style="font-size:12.5px">Hãy tải file ở trang Kết quả số bán.</span></div></div>';
    var hi = st.assume !== 'min', M = hi ? P.high : P.low, Q = hi ? P.quarterHigh : P.quarterLow, unk = P.unknown;
    var head = '<div class="pi-hd"><label for="pi-m" style="font-weight:700;color:#33425E">Tháng</label><select id="pi-m">' + P.months.slice().reverse().map(function (m) { return '<option value="' + e(m) + '"' + (m === P.month ? ' selected' : '') + '>' + e(mon(m)) + '</option>'; }).join('') + '</select>' +
      (unk ? '<div class="pi-seg" role="group" aria-label="Cách tính các mục chưa có dữ liệu"><button type="button" data-pi="max" aria-pressed="' + hi + '">Mục chưa có = đủ điểm</button><button type="button" data-pi="min" aria-pressed="' + !hi + '">Mục chưa có = 0 điểm</button></div>' : '') +
      '<span class="pi-sub" style="margin:0">' + (st.preview ? '<b style="color:#9A5B00">Đang xem thử số chưa lưu</b>' : 'Đã lưu') + '</span></div>';
    return '<div class="card"><div class="card-h"><h2>Ước tính thu nhập · chính sách PC</h2><span class="sub">Chỉ áp dụng chức danh PC · lương, thưởng tháng, thưởng quý, phụ cấp</span></div><div class="card-b">' + head +
      hero(P, M, Q, unk) +
      sec(1, 'Doanh thu', 'Hoàn thành chỉ tiêu tháng', revenue(P, M)) +
      (M.noTarget ? '' : sec(2, 'Hoa hồng', 'Thưởng hoàn thành doanh thu (Q2dt)', commission(P, M))) +
      sec(3, 'Điểm tuân thủ', 'Tuân thủ 50 + Kiến thức 20 + Model định hướng 30', score(P, M)) +
      sec(4, 'Thưởng tháng và tổng thu nhập', 'Thưởng × mức hưởng + lương + phụ cấp', monthTotal(P, M)) +
      sec(5, 'Thưởng quý', 'Vượt mục tiêu quý (Q3)', quarter(P, Q, M)) +
      sec(6, 'Dữ liệu nhập tay của ' + e(mon(P.month)), 'Phần hệ thống chưa có', form(P)) +
      sec(7, 'Điểm tuân thủ ảnh hưởng thế nào', 'Bảng so sánh các mức', sens(P)) +
      sec(8, 'Các tháng có dữ liệu', 'Lịch sử ước tính', history(P)) +
      '<div class="q" style="margin-top:14px">' + e(P.note) + ' Nguồn: doanh số thực đạt và chỉ tiêu từ file Salerep GT; điểm kiến thức từ đợt “Điểm tuân thủ học tập” của tháng; phần còn lại do quản trị viên nhập. Công thức và mức thưởng theo “Chính sách thu nhập Phòng Kinh doanh GT”. Chỉ để tham khảo, không thay cho bảng lương.</div></div></div>';
  }

  // ---------- gắn vào trang ----------
  function readInputs(box) {
    var g = function (id) { var el = box.querySelector('#' + id); return el && el.value !== '' ? Number(el.value) : null; };
    var o = { work: {}, knowledge: g('pi-k'), modelAch: g('pi-ma'), modelTarget: g('pi-mt'), review: g('pi-rv'), group: (box.querySelector('#pi-g') || {}).value || '' };
    ['time', 'look', 'display', 'report'].forEach(function (k) { var v = g('pi-w-' + k); if (v != null) o.work[k] = v; });
    return o;
  }
  var CACHE = {};
  window.pcIncomeMount = function (box, code) {
    if (!box) return; css();
    var st = CACHE[code] || (CACHE[code] = { data: null, err: '', assume: 'max', preview: false });
    function paint() { box.innerHTML = html(st); bind(); }
    function msg(t, c) { var m = box.querySelector('#pi-msg'); if (m) { m.textContent = t; m.className = 'pi-msg ' + (c || ''); } }
    async function load(month, over) {
      try {
        var r = over ? await api('POST', '/api/kt-admin', { op: over.op, code: code, month: month, inputs: over.inputs }) : await api('GET', '/api/kt-admin?op=pcIncome&code=' + encodeURIComponent(code) + (month ? '&month=' + encodeURIComponent(month) : ''));
        if (!r.j || !r.j.ok) { st.err = (r.j && r.j.error) || 'Không tính được ước tính thu nhập.'; if (!over) st.data = null; paint(); if (over) msg(st.err, 'err'); return false; }
        st.data = r.j; st.err = ''; st.preview = !!(over && over.op === 'pcIncomeCalc'); paint(); return true;
      } catch (e) { st.err = 'Mất kết nối máy chủ.'; paint(); return false; }
    }
    function bind() {
      var m = box.querySelector('#pi-m'); if (m) m.onchange = function () { load(m.value); };
      Array.prototype.forEach.call(box.querySelectorAll('[data-pi]'), function (b) {
        b.onclick = async function () {
          var a = b.getAttribute('data-pi'), month = st.data && st.data.month;
          if (a === 'max' || a === 'min') { st.assume = a; paint(); return; }
          b.disabled = true;
          if (a === 'calc') { msg('Đang tính thử…', ''); await load(month, { op: 'pcIncomeCalc', inputs: readInputs(box) }); msg('Đã tính thử, chưa lưu. Bấm “Lưu” để giữ lại.', 'ok'); }
          else if (a === 'save') { msg('Đang lưu…', ''); if (await load(month, { op: 'pcIncomeSave', inputs: readInputs(box) })) msg('Đã lưu cho ' + mon(month) + '.', 'ok'); }
          else if (a === 'clear') { if (!confirm('Xoá số đã nhập của ' + mon(month) + '?')) { b.disabled = false; return; } if (await load(month, { op: 'pcIncomeSave', inputs: {} })) msg('Đã xoá số nhập tay.', 'ok'); }
          b.disabled = false;
        };
      });
      Array.prototype.forEach.call(box.querySelectorAll('[data-pi-month]'), function (tr_) { tr_.onclick = function () { load(tr_.getAttribute('data-pi-month')); box.scrollIntoView({ behavior: 'smooth', block: 'start' }); }; });
    }
    if (st.data && st.data.code === code) { paint(); return; }
    st.data = null; paint(); load('');
  };
  window.pcIncomeHtml = html;   // dùng cho kiểm thử / xem trước
})();
