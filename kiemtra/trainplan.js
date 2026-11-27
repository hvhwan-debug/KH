/* Menu "Kế hoạch đào tạo" của trang quản trị: chọn tháng → xem khoảng cách năng lực theo vị trí (luật minh bạch)
   → AI (hoặc luật) lập bảng kế hoạch đào tạo tháng → sửa tay → lưu / xuất CSV.
   Dùng các hàm có sẵn của admin.html: $, esc, api, msg. Dữ liệu nhân sự chỉ ở máy chủ; trang này chỉ nhận số liệu tổng hợp theo vị trí. */
(function () {
  'use strict';
  var TP = { month: '', rows: [], source: 'manual', status: 'draft', dirty: false, biz: { goals: [], strategy: [] }, sales: null, bizDirty: false, approval: { status: 'draft', approver: '', note: '', decidedAt: null }, sendBefore: 3, flow: null, analysis: null, months: [], busy: false, inited: false };
  var COLS = [['stt', 'STT', 46], ['doiTuong', 'Đối tượng', 90], ['nganh', 'Ngành', 120], ['tenChuongTrinh', 'Tên chương trình', 200], ['noiDung', 'Nội dung chính', 320], ['mucTieu', 'Mục tiêu', 230],
    ['phuongPhap', 'Phương pháp', 150], ['thoiLuong', 'Thời lượng', 86], ['phuTrach', 'Phụ trách', 96], ['thoiGian', 'Thời gian tổ chức', 138], ['guiTruoc', 'Hạn gửi nội dung cho người duyệt', 130], ['tanSuat', 'Tần suất', 150], ['ghiChu', 'Ghi chú', 230], ['mucTieuKd', 'Gắn mục tiêu kinh doanh', 230], ['chiSoDo', 'Chỉ số đo hiệu quả', 230], ['coSo', 'Cơ sở số liệu', 230]];
  var SRC = { ai: 'AI lập', rules: 'Lập theo luật', manual: 'Nhập tay' };
  var AREA_LABEL = { mk: 'Thị trường & đối thủ', po: 'Chính sách, quy trình & tiêu chuẩn', sk: 'Kỹ năng bán hàng & tư vấn', n1: 'Sản phẩm ngành 1 · Máy lọc nước', n2: 'Sản phẩm ngành 2 · Điện gia dụng', sp: 'Kiến thức sản phẩm (chung)', gn: 'Kiến thức chung (không dùng)' };
  function svg(d, extra) { return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || '') + '>' + d + '</svg>'; }
  var ICON = { chart: svg('<path d="M4 20V11M10 20V4M16 20v-6M2 20h20"/>'), spark: svg('<path d="M12 3l1.9 5.3L19 10l-5.1 1.7L12 17l-1.9-5.3L5 10l5.1-1.7z" fill="currentColor"/><path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" fill="currentColor" stroke-width="1"/>'),
    list: svg('<path d="M9 6h11M9 12h11M9 18h11M3.5 6l1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2"/>'), save: svg('<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>'), plus: svg('<path d="M12 5v14M5 12h14"/>'),
    down: svg('<path d="M12 4v11M8 11l4 4 4-4M4 20h16"/>'), trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>') };
  function ib(k, label) { return '<span class="ic">' + ICON[k] + '</span>' + label; }
  var HERO = '<svg viewBox="0 0 320 180" width="100%" height="100%" aria-hidden="true"><defs><linearGradient id="tpg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4C9BFF"/><stop offset="1" stop-color="#0B4FD0"/></linearGradient></defs>'
    + '<path d="M40 150c-10-40 14-62 30-70-6 30 6 52 30 70z" fill="#7FD6D0" opacity=".75"/><path d="M270 150c14-34-2-58-20-70 2 26-8 50-28 70z" fill="#7FD6D0" opacity=".75"/>'
    + '<rect x="30" y="126" width="120" height="14" rx="3" fill="#2F7BEA"/><rect x="36" y="114" width="108" height="14" rx="3" fill="#7DB5FF"/>'
    + '<rect x="96" y="22" width="130" height="118" rx="12" fill="#fff" stroke="#BCD5FA" stroke-width="2"/><path d="M96 34a12 12 0 0 1 12-12h106a12 12 0 0 1 12 12v18H96z" fill="url(#tpg1)"/>'
    + '<g fill="#fff" stroke="#2F7BEA" stroke-width="2"><rect x="114" y="12" width="8" height="18" rx="4"/><rect x="138" y="12" width="8" height="18" rx="4"/><rect x="162" y="12" width="8" height="18" rx="4"/><rect x="186" y="12" width="8" height="18" rx="4"/></g>'
    + '<g stroke="#2F7BEA" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M110 70l4 4 7-8M110 92l4 4 7-8M110 114l4 4 7-8"/></g><g stroke="#CFE0F8" stroke-width="5" stroke-linecap="round"><path d="M128 70h24M128 92h24M128 114h24"/></g>'
    + '<g transform="translate(206 100)"><circle r="34" fill="#fff" stroke="#BCD5FA" stroke-width="2"/><circle r="25" fill="#2F7BEA"/><circle r="16" fill="#fff"/><circle r="8" fill="#2F7BEA"/><path d="M0 0L36 -36" stroke="#0B3FA8" stroke-width="4" stroke-linecap="round"/><path d="M30 -42l10 2-2 10z" fill="#0B3FA8"/></g></svg>';
  var EMPTY = '<svg viewBox="0 0 160 120" width="150" height="112" aria-hidden="true"><path d="M20 108c-8-26 8-42 20-48-4 20 4 36 20 48z" fill="#9FDDD8" opacity=".8"/><path d="M142 108c8-24-4-40-16-48 0 18-6 34-20 48z" fill="#9FDDD8" opacity=".8"/>'
    + '<rect x="46" y="14" width="68" height="88" rx="10" fill="#fff" stroke="#9CC4F7" stroke-width="3"/><rect x="66" y="8" width="28" height="14" rx="6" fill="#2F7BEA"/><g stroke="#2F7BEA" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M57 42l4 4 7-8M57 62l4 4 7-8M57 82l4 4 7-8"/></g><g stroke="#C9DBF6" stroke-width="5" stroke-linecap="round"><path d="M76 42h28M76 62h28M76 82h28"/></g></svg>';
  function ea(s) { return esc(s).replace(/"/g, '&quot;'); }
  function two(n) { return n < 10 ? '0' + n : '' + n; }
  function curMonth() { var d = new Date(); return d.getFullYear() + '-' + two(d.getMonth() + 1); }
  function mLabel(m) { return m ? m.slice(5) + '/' + m.slice(0, 4) : ''; }
  function dmy(iso) { return /^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.slice(8) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : ''; }
  var AP = { draft: 'Nháp', pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Không duyệt' };
  function durMin(v) { var m = /(\d+(?:[.,]\d+)?)/.exec(String(v || '')); if (!m) return 90; var n = parseFloat(m[1].replace(',', '.')); return /giờ|gio|\d\s*h\b/i.test(String(v)) ? Math.round(n * 60) : Math.round(n); }
  function hm(g) { var m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(g || '')); return m ? +m[1] * 60 + +m[2] : null; }
  // Khung giờ cho phép (ý kiến người phê duyệt): đầu ngày 08:00–09:30 hoặc cuối ngày từ 17:00, để không ảnh hưởng giờ bán của SR, PC
  function timeOk(gio, dur) { var a = hm(gio); if (a == null) return null; return a >= 1020 || (a >= 480 && a + dur <= 570); }
  function backWorkdays(iso, n) { if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return ''; var d = new Date(iso + 'T00:00:00Z'); while (n > 0) { d.setUTCDate(d.getUTCDate() - 1); var w = d.getUTCDay(); if (w !== 0 && w !== 6) n--; } return d.getUTCFullYear() + '-' + two(d.getUTCMonth() + 1) + '-' + two(d.getUTCDate()); }
  function emptyRow() { return { stt: 0, doiTuong: '', nganh: '', tenChuongTrinh: '', noiDung: [], mucTieu: '', phuongPhap: 'Đào tạo trực tuyến + Giải case', thoiLuong: '90 phút', phuTrach: 'ĐTKDGT', thoiGian: '', gio: '08:00', tanSuat: '1 lần/tháng hoặc khi có yêu cầu', ghiChu: '', mucTieuKd: '', chiSoDo: '', coSo: '' }; }
  function root() { return document.getElementById('tpRoot'); }
  function say(text, cls) { var el = document.getElementById('tpMsg'); if (el) el.innerHTML = text ? '<div class="msg ' + (cls || 'err') + '">' + esc(text) + '</div>' : ''; }
  function lock(on) { TP.busy = on; var r = root(); if (r) r.querySelectorAll('[data-tp-act]').forEach(function (b) { b.disabled = on; }); }

  function css() {
    if (document.getElementById('tpCss')) return;
    var st = document.createElement('style'); st.id = 'tpCss';
    st.textContent = '#tpRoot .tp-top{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;justify-content:space-between;margin-bottom:12px}#tpRoot h1{margin:0}'
      + '#tpRoot .tp-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}#tpRoot .tp-bar input[type=month]{padding:8px 10px;border:1px solid var(--line,#dbe3ee);border-radius:10px;font:inherit}'
      + '#tpRoot .tp-chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px}#tpRoot .tp-chip{border:1px solid var(--line,#dbe3ee);background:#fff;border-radius:99px;padding:4px 12px;font-size:12.5px;cursor:pointer}'
      + '#tpRoot .tp-chip.on{background:#0B5BD6;color:#fff;border-color:#0B5BD6}'
      + '#tpRoot .tp-sec{margin:18px 0 8px;font-size:15px;font-weight:800;color:#0B1F4B}'
      + '#tpRoot .tp-biz{border:1px solid #BFD6F5;background:#F3F8FF;border-radius:14px;padding:12px 14px;margin:6px 0 4px}#tpRoot .tp-biz .tp-sec{margin-top:0}#tpRoot .tp-bg{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}@media(max-width:800px){#tpRoot .tp-bg{grid-template-columns:1fr}}#tpRoot .tp-biz label{font-size:13px;font-weight:700;color:#29466e;display:block}#tpRoot .tp-biz textarea{width:100%;box-sizing:border-box;margin-top:4px;padding:8px 10px;border:1px solid var(--line,#dbe3ee);border-radius:10px;font:inherit;font-weight:400;font-size:13px;resize:vertical}#tpRoot .tp-biz .tp-ctx{font-size:12.5px;color:#475569;margin:8px 0}'
      + '#tpRoot .tp-aud{border:1px solid var(--line,#dbe3ee);border-radius:14px;padding:12px 14px;margin-bottom:10px;background:#fff}'
      + '#tpRoot .tp-aud h3{margin:0 0 4px;font-size:14px}#tpRoot .tp-aud .tp-meta{font-size:12.5px;color:#5b6b85;margin-bottom:8px}'
      + '#tpRoot table.tp-gap{width:100%;border-collapse:collapse;font-size:13px}#tpRoot table.tp-gap th,#tpRoot table.tp-gap td{padding:6px 8px;border-bottom:1px solid #eef2f8;text-align:left;vertical-align:top}'
      + '#tpRoot .tp-st{display:inline-block;border-radius:99px;padding:2px 10px;font-size:12px;font-weight:700;white-space:nowrap}'
      + '#tpRoot .tp-st.bad{background:#FEE4E2;color:#B42318}#tpRoot .tp-st.ok{background:#D1FADF;color:#067647}#tpRoot .tp-st.na{background:#EEF1F6;color:#5b6b85}'
      + '#tpRoot .tp-wrap{overflow-x:auto;border:1px solid #cfd8e6;border-radius:12px}'
      + '#tpRoot .tp-title{background:#1B2A55;color:#fff;text-align:center;font-weight:800;padding:12px;font-size:15px;letter-spacing:.2px}'
      + '#tpRoot .tp-sub{text-align:center;font-style:italic;color:#475569;font-size:12.5px;padding:6px;background:#f7f9fc}'
      + '#tpRoot table.tp-plan{border-collapse:collapse;width:100%;min-width:2400px;font-size:13px;background:#fff}'
      + '#tpRoot table.tp-plan th{background:#1B2A55;color:#fff;padding:10px 8px;text-align:center;font-weight:700;border:1px solid #3a4a78}'
      + '#tpRoot table.tp-plan td{border:1px solid #d5dce8;padding:4px;vertical-align:top}'
      + '#tpRoot table.tp-plan textarea,#tpRoot table.tp-plan input{width:100%;box-sizing:border-box;border:1px solid transparent;background:transparent;font:inherit;font-size:13px;padding:5px 6px;border-radius:6px;resize:vertical}'
      + '#tpRoot table.tp-plan textarea:hover,#tpRoot table.tp-plan input:hover{border-color:#cfd8e6}#tpRoot table.tp-plan textarea:focus,#tpRoot table.tp-plan input:focus{border-color:#1B78E8;background:#f5faff;outline:none}'
      + '#tpRoot table.tp-plan td.stt{text-align:center;font-weight:700;vertical-align:middle}#tpRoot table.tp-plan td.act{text-align:center;vertical-align:middle;width:36px}'
      + '#tpRoot .tp-off input{color:#B42318;font-weight:700}#tpRoot .tp-bad input[type=time]{color:#B42318;font-weight:700;background:#FEE4E2}#tpRoot td.gui{text-align:center;vertical-align:middle;color:#475569;font-size:12.5px}#tpRoot .tp-fl{border:1px solid #BFD6F5;background:#F8FBFF;border-radius:14px;padding:12px 14px;margin-top:14px}#tpRoot table.tp-fb{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;background:#fff}#tpRoot table.tp-fb th,#tpRoot table.tp-fb td{border:1px solid #d5dce8;padding:7px 8px;vertical-align:top;text-align:left}#tpRoot table.tp-fb th{background:#EAF2FD;color:#0B1F4B}#tpRoot .tp-fb .b{display:block;margin:4px 0 0}#tpRoot .tp-ap{border:1px solid var(--line,#dbe3ee);border-radius:14px;padding:12px 14px;margin-top:12px;background:#fff}#tpRoot .tp-ap .tp-apg{display:grid;grid-template-columns:150px 1fr 110px;gap:10px;align-items:start}@media(max-width:800px){#tpRoot .tp-ap .tp-apg{grid-template-columns:1fr}}#tpRoot .tp-ap label{font-size:13px;font-weight:700;color:#29466e;display:block}#tpRoot .tp-ap input,#tpRoot .tp-ap select,#tpRoot .tp-ap textarea{width:100%;box-sizing:border-box;margin-top:4px;padding:7px 9px;border:1px solid var(--line,#dbe3ee);border-radius:10px;font:inherit;font-size:13px;font-weight:400}#tpRoot .tp-empty{padding:26px;text-align:center;color:#5b6b85}'
      + '#tpRoot .tp-hero{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:6px}#tpRoot .tp-hero-t{flex:1;min-width:0}#tpRoot .tp-hero h1{font-size:30px;line-height:1.2;color:#0B1F4B;margin:0 0 8px;font-weight:800}#tpRoot .tp-hero p{margin:0;max-width:60em;font-size:14px;line-height:1.6;color:#33425E}'
      + '#tpRoot .tp-hero-art{flex:0 0 280px;height:150px}@media(max-width:800px){#tpRoot .tp-hero-art{display:none}#tpRoot .tp-hero h1{font-size:24px}}'
      + '#tpRoot .tp-ctl{display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px;margin:14px 0 10px}#tpRoot .tp-lab{display:block;font-size:14px;font-weight:700;color:#29466e}#tpRoot .tp-lab input{display:block;margin-top:6px;min-width:250px;padding:11px 14px;border:1px solid #CBD7EA;border-radius:14px;font:inherit;font-weight:700;font-size:15px;color:#0B1F4B;background:#fff}'
      + '#tpRoot .tp-bar .btn{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:10px 20px;font-weight:700;font-size:14.5px;line-height:1.2;border:1px solid #BFD0EA;background:#fff;color:#0B4FD0;box-shadow:none;cursor:pointer}'
      + '#tpRoot .tp-bar .btn .ic{display:inline-flex}#tpRoot .tp-bar .btn:hover{background:#EEF4FF}#tpRoot .tp-bar .btn:disabled{opacity:.55;cursor:default}'
      + '#tpRoot .tp-bar .btn:not(.ghost){background:linear-gradient(180deg,#1B5FD6,#0A3A9C);border-color:#0A3A9C;color:#fff;box-shadow:0 8px 18px -10px rgba(10,58,156,.8)}#tpRoot .tp-bar .btn:not(.ghost):hover{filter:brightness(1.07)}'
      + '#tpRoot .tp-bar .btn.danger{background:#FFF5F5;border-color:#F3B4B4;color:#C62828}#tpRoot .tp-bar .btn.danger:hover{background:#FFE9E9}'
      + '#tpRoot .tp-title{background:#0B2A66}#tpRoot table.tp-plan th{background:#0B2A66}'
      + '#tpRoot .tp-empty-art{display:flex;flex-direction:column;align-items:center;gap:4px;padding:30px 20px 34px}#tpRoot .tp-empty-art b{font-size:19px;color:#0B1F4B;margin-top:6px}#tpRoot .tp-empty-art span{font-size:14.5px}'
      + '#tpRoot .tp-st.warn{background:#FEF0C7;color:#93370D}#tpRoot tr.tp-unm td{background:#FFF8E6}#tpRoot .tp-diag{margin-top:10px;border:1px dashed #F0C36D;background:#FFFBF0;border-radius:10px;padding:8px 12px}#tpRoot .tp-diag summary{cursor:pointer;font-weight:700;color:#93370D;font-size:13.5px}'
      + '#tpRoot .tp-diag select{max-width:260px;padding:5px 8px;border:1px solid #CBD7EA;border-radius:8px;font:inherit;font-size:13px}';
    document.head.appendChild(st);
  }

  function shell() {
    var r = root(); if (!r || r.dataset.ready) return; r.dataset.ready = '1';
    r.innerHTML = '<div class="tp-hero"><div class="tp-hero-t"><h1>Kế hoạch đào tạo</h1><p>Đối chiếu năng lực thực tế của nhân sự (mọi bài kiểm tra, số bán, câu hỏi KAI…) với yêu cầu của từng vị trí để tìm khoảng cách cần giải quyết, rồi AI lập bảng kế hoạch đào tạo của tháng. '
      + 'AI chỉ nhận số liệu tổng hợp theo vị trí, không có tên hay mã nhân viên. Bạn xem, sửa lại rồi mới lưu.</p></div><div class="tp-hero-art">' + HERO + '</div></div>'
      + '<div class="tp-ctl"><label class="tp-lab">Tháng<input type="month" id="tpMonth"></label><div class="tp-bar">'
      + '<button type="button" class="btn ghost sm" data-tp-act="analyze">' + ib('chart', 'Phân tích năng lực') + '</button>'
      + '<button type="button" class="btn sm" data-tp-act="ai">' + ib('spark', 'AI lập kế hoạch') + '</button>'
      + '<button type="button" class="btn ghost sm" data-tp-act="rules" title="Lập theo luật từ bản phân tích, không dùng AI">' + ib('list', 'Lập theo luật') + '</button></div></div>'
      + '<div class="tp-chips" id="tpChips"></div><div id="tpMsg"></div><div id="tpBiz"></div><div id="tpAnalysis"></div>'
      + '<div class="tp-sec">Bảng kế hoạch đào tạo</div><div id="tpPlan"></div>'
      + '<div id="tpApprove"></div><div id="tpFlow"></div><div class="tp-bar" style="margin-top:12px"><button type="button" class="btn sm" data-tp-act="save">' + ib('save', 'Lưu kế hoạch') + '</button>'
      + '<button type="button" class="btn ghost sm" data-tp-act="add">' + ib('plus', 'Thêm dòng') + '</button><button type="button" class="btn ghost sm" data-tp-act="csv">' + ib('down', 'Xuất CSV') + '</button>'
      + '<button type="button" class="btn ghost sm danger" data-tp-act="del">' + ib('trash', 'Xoá kế hoạch tháng này') + '</button><span class="small" id="tpState"></span></div>';
    r.addEventListener('click', onClick); r.addEventListener('input', onInput); r.addEventListener('change', onInput);
    document.getElementById('tpMonth').addEventListener('change', function () { loadMonth(this.value); });
  }

  function renderChips() {
    var el = document.getElementById('tpChips'); if (!el) return;
    el.innerHTML = TP.months.length ? '<span class="small" style="align-self:center">Đã lưu:</span>' + TP.months.map(function (m) { return '<button type="button" class="tp-chip' + (m.month === TP.month ? ' on' : '') + '" data-tp-month="' + ea(m.month) + '">' + esc(mLabel(m.month)) + ' · ' + m.count + ' CT' + (m.status === 'final' ? ' ✓' : '') + '</button>'; }).join('') : '';
  }
  function num(n) { return Number(n || 0).toLocaleString('vi-VN'); }
  function renderBiz() {
    var el = document.getElementById('tpBiz'); if (!el) return; var S = TP.sales, ctx;
    if (S) ctx = 'Kết quả bán gần nhất trên hệ thống: <b>tháng ' + esc(mLabel(S.month)) + '</b> — thực đạt ' + num(S.actual) + ' / chỉ tiêu ' + num(S.target) + (S.pct != null ? ' = <b>' + S.pct + '%</b>' : '') + (S.elapsed != null && S.elapsed < 1 ? ' (mới qua ' + Math.round(S.elapsed * 100) + '% thời gian bán)' : '') + (S.sameMonth ? '' : ' · chưa có số bán của tháng ' + esc(mLabel(TP.month)));
    else ctx = 'Chưa có số bán nào trên hệ thống (trang Số bán): ưu tiên theo kết quả bán sẽ chưa được áp dụng.';
    el.innerHTML = '<div class="tp-biz"><div class="tp-sec">Mục tiêu kinh doanh &amp; chiến lược tháng ' + esc(mLabel(TP.month)) + ' <span class="tp-st bad" style="font-size:11px;vertical-align:middle">Bắt buộc nhập ít nhất một mục</span></div>'
      + '<div class="tp-bg"><label>Mục tiêu kinh doanh (mỗi dòng một mục tiêu)<textarea id="tpGoals" rows="4" placeholder="Ví dụ: Đạt 100% chỉ tiêu doanh số tháng">' + esc((TP.biz.goals || []).join('\n')) + '</textarea></label>'
      + '<label>Chiến lược / ưu tiên trọng tâm (mỗi dòng một ý)<textarea id="tpStrat" rows="4" placeholder="Ví dụ: Tăng cường kỹ năng tư vấn và chốt đơn tại điểm bán">' + esc((TP.biz.strategy || []).join('\n')) + '</textarea></label>'
      + '<label>Sản phẩm trọng tâm theo vị trí (mỗi dòng: Vị trí: sản phẩm, sản phẩm)<textarea id="tpFocus" rows="4" placeholder="Ví dụ:&#10;PC: sản phẩm A, sản phẩm B&#10;SR 1: sản phẩm C&#10;SR 2: sản phẩm D">' + esc((TP.biz.focus || []).map(function (f) { return f.short + ': ' + f.products.join(', '); }).join('\n')) + '</textarea></label></div>'
      + '<div class="tp-ctx">' + ctx + '</div><div class="small" style="margin-bottom:8px">Kế hoạch đào tạo ưu tiên vị trí đang hụt chỉ tiêu và các mảng nằm trong chiến lược; mỗi vị trí có sản phẩm trọng tâm sẽ có chương trình riêng; mỗi chương trình nêu góp phần vào mục tiêu nào và đo bằng chỉ số nào.</div>'
      + '<button type="button" class="btn sm" data-tp-act="biz">Lưu mục tiêu &amp; chiến lược</button></div>';
  }
  function renderApprove() {
    var el = document.getElementById('tpApprove'); if (!el) return; var A = TP.approval;
    el.innerHTML = '<div class="tp-ap"><div class="tp-sec" style="margin-top:0">Phê duyệt kế hoạch</div><div class="tp-apg">'
      + '<label>Trạng thái<select id="tpApSt">' + Object.keys(AP).map(function (k) { return '<option value="' + k + '"' + (A.status === k ? ' selected' : '') + '>' + AP[k] + '</option>'; }).join('') + '</select></label>'
      + '<label>Người phê duyệt<input id="tpApWho" value="' + ea(A.approver) + '" placeholder="Họ tên người phê duyệt"></label>'
      + '<label>Gửi nội dung trước (ngày làm việc)<input id="tpSendBefore" type="number" min="0" max="15" value="' + ea(TP.sendBefore) + '"></label></div>'
      + '<label style="margin-top:8px">Ý kiến phê duyệt<textarea id="tpApNote" rows="3" placeholder="Ghi lại ý kiến, lưu ý của người phê duyệt (khung giờ, nội dung cần gửi trước, trọng tâm của tháng…)">' + esc(A.note) + '</textarea></label>'
      + '<div class="small" style="margin-top:6px">' + (A.decidedAt ? 'Ngày ' + (A.status === 'rejected' ? 'không duyệt' : 'duyệt') + ': ' + esc(new Date(A.decidedAt).toLocaleString('vi-VN')) + ' · ' : '') + 'Nội dung từng chương trình cần gửi cho người phê duyệt trước buổi học để đánh giá mức độ chuẩn bị; cột “Hạn gửi nội dung” tính theo số ngày làm việc ở trên.</div></div>';
  }
  function fl(k, i, label, cls) { return '<button type="button" class="btn ' + (cls || 'ghost') + ' sm b" data-tp-act="flowbtn" data-tp-flow="' + k + '" data-i="' + i + '">' + label + '</button>'; }
  function renderFlow() {
    var el = document.getElementById('tpFlow'); if (!el) return; var F = TP.flow, saved = TP.months.some(function (m) { return m.month === TP.month; });
    var head = '<div class="tp-fl"><div class="tp-sec" style="margin-top:0">Luồng đào tạo</div><div class="small" style="max-width:70em">Từ bảng kế hoạch đã lưu, hệ thống tự tạo cho từng chương trình: <b>chương trình đăng ký</b> (người nhận bấm 1 nút trong email), <b>bài kiểm tra sau đào tạo</b> (đề riêng, chỉ đúng người của chương trình; câu hỏi AI chỉ soạn từ tài liệu có thật và để ở dạng nháp) và <b>khảo sát sau buổi học</b> (nháp). '
      + '<b>Tạo luồng không gửi email nào.</b> Mỗi lần gửi thư đều có bước xem trước đúng số người và xác nhận, và chỉ gửi khi kế hoạch ở trạng thái “Đã duyệt” và chưa sửa sau khi duyệt.</div>'
      + '<div class="tp-bar" style="margin:10px 0"><button type="button" class="btn sm" data-tp-act="flow"' + (saved && !TP.dirty ? '' : ' disabled title="Hãy lưu kế hoạch trước"') + '>🚀 ' + (F && F.created ? 'Cập nhật luồng đào tạo từ kế hoạch' : 'Tạo luồng đào tạo từ kế hoạch này') + '</button>'
      + (F && F.created ? '<button type="button" class="btn ghost sm" data-tp-act="qall">Soạn câu hỏi nháp cho tất cả chương trình</button>' : '') + (saved ? '' : '<span class="small">Chưa có kế hoạch đã lưu cho tháng này.</span>') + '</div>';
    if (!F || !F.created) { el.innerHTML = head + '</div>'; return; }
    var gate = F.gate ? '<div class="msg warn" style="margin:0 0 8px">Chưa thể gửi thư: ' + esc(F.gate.error) + '</div>' : '<div class="msg ok" style="margin:0 0 8px">Kế hoạch đã duyệt: có thể gửi thư (mỗi lần đều xem trước và xác nhận).</div>';
    el.innerHTML = head + gate + '<table class="tp-fb"><thead><tr><th>#</th><th>Chương trình</th><th>Người nhận</th><th>Thư mời đăng ký</th><th>Bài kiểm tra sau đào tạo</th><th>Khảo sát</th></tr></thead><tbody>'
      + F.items.map(function (x, i) {
        var pr = x.program, ex = x.exam, rc = x.recipients, sv = x.survey;
        return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(x.title) + '</b><div class="small">' + esc(x.audience) + (x.date ? ' · ' + esc(dmy(x.date)) + ' ' + esc(x.gio || '') : '') + '</div>' + (x.error ? '<div class="msg err" style="margin:4px 0 0">' + esc(x.error) + '</div>' : '') + '</td>'
          + '<td>' + (rc && rc.total != null ? rc.total + ' người<div class="small">' + rc.noEmail + ' chưa có email</div>' : esc((rc && rc.error) || '—')) + '</td>'
          + '<td>' + (pr ? 'Đã mời ' + pr.invited + ' · đăng ký ' + pr.regs + (pr.cancels ? ' · huỷ ' + pr.cancels : '') + fl('invite', i, 'Xem trước &amp; gửi thư mời', 'sm') : '—') + '</td>'
          + '<td>' + (ex ? 'Câu nháp ' + ex.drafts + ' · đã bật ' + ex.active + '<div class="small">Đã gửi thư làm bài ' + ex.invited + ' · nhắc ' + ex.reminded + '</div>' + fl('gen', i, 'Soạn câu hỏi nháp (AI)') + fl('exam', i, 'Gửi thư làm bài') + fl('remind', i, 'Nhắc làm bài') : '—') + '</td>'
          + '<td>' + (sv ? (sv.open ? 'Đang mở' : 'Nháp (chưa mở)') + '<div class="small"><a href="' + ea(sv.url) + '" target="_blank" rel="noopener">Mở khảo sát</a></div>' : '—') + '</td></tr>';
      }).join('') + '</tbody></table><div class="small" style="margin-top:6px">Câu hỏi nháp: vào Ngân hàng câu hỏi của đề <code>dt-' + esc(TP.month) + '-N</code> để xem lại và bật. Khảo sát: mở ở trang Khảo sát khi sẵn sàng. Xoá kế hoạch KHÔNG xoá chương trình, đề và khảo sát đã tạo (có thể đã có người đăng ký).</div></div>';
  }
  function renderState() {
    var el = document.getElementById('tpState'); if (!el) return;
    el.textContent = (TP.dirty ? '● Có thay đổi chưa lưu · ' : '') + (TP.dirty && TP.approval.status === 'approved' ? 'Đã duyệt nhưng có chỉnh sửa: cần duyệt lại · ' : '') + (TP.rows.length ? TP.rows.length + ' chương trình · nguồn: ' + (SRC[TP.source] || 'Nhập tay') : '');
  }
  function gapTable(a) {
    return '<table class="tp-gap"><thead><tr><th>Mảng năng lực</th><th>Yêu cầu tối thiểu</th><th>Hiện trạng TB</th><th>Dưới ngưỡng</th><th>Trạng thái</th><th>Chủ đề yếu</th><th>Học liệu</th><th>Chiến lược</th></tr></thead><tbody>'
      + a.reqs.map(function (g) {
        var cls = g.status === 'đạt' ? 'ok' : g.status === 'cần đào tạo' ? 'bad' : 'warn';
        return '<tr><td>' + esc(g.areaName) + '</td><td>≥ ' + g.min + '%</td><td>' + (g.avg == null ? '—' : g.avg + '%') + '</td><td>' + (g.assessed ? g.gapPeople + '/' + g.assessed : '—') + '</td><td><span class="tp-st ' + cls + '">' + esc(g.status) + '</span></td>'
          + '<td>' + (g.topics.length ? g.topics.map(function (t) { return esc(t.name) + ' ' + t.pct + '%'; }).join('; ') : '—') + '</td><td>' + (g.materials == null ? '—' : g.materials) + '</td><td>' + (g.strategyHits && g.strategyHits.length ? '<span class="tp-st ok">Trọng tâm</span>' : '—') + '</td></tr>';
      }).join('') + '</tbody></table>';
  }
  function areaOpts(sel) { return Object.keys(AREA_LABEL).map(function (k) { return '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + esc((TP.areaNames && TP.areaNames[k] && k !== 'gn') ? TP.areaNames[k] : AREA_LABEL[k]) + '</option>'; }).join(''); }
  function diag(a) {
    if (!a.missing) return ''; var cats = a.categories || [];
    return '<details class="tp-diag" open><summary>Vì sao thiếu dữ liệu? ' + a.missing + ' mảng yêu cầu chưa có dữ liệu — xem danh mục câu hỏi của vị trí này</summary>'
      + '<div class="small" style="margin:6px 0">Một mảng chỉ được tính khi có ít nhất 3 người làm từ 4 câu thuộc mảng đó. Dưới đây là các danh mục câu hỏi vị trí này đã làm. Danh mục đang ở “Kiến thức chung (không dùng)” thì <b>chưa được tính vào mảng nào</b>: hãy chọn lại mảng đúng, hệ thống tính lại ngay.</div>'
      + (cats.length ? '<table class="tp-gap"><thead><tr><th>Danh mục câu hỏi</th><th>Số câu đã làm</th><th>Đang tính vào mảng</th></tr></thead><tbody>' + cats.map(function (c) {
        return '<tr' + (c.area === 'gn' ? ' class="tp-unm"' : '') + '><td>' + esc(c.name) + (c.manual ? ' <span class="tp-st ok">gắn thủ công</span>' : '') + '</td><td>' + c.n + '</td><td><select class="tp-catsel" data-cat="' + ea(c.name) + '">' + areaOpts(c.area) + '</select></td></tr>'; }).join('') + '</tbody></table>'
        : '<div class="small">Vị trí này chưa có bài làm nào có phân danh mục câu hỏi.</div>') + '</details>';
  }
  function renderAnalysis() {
    var el = document.getElementById('tpAnalysis'); if (!el) return; var A = TP.analysis;
    if (!A) { el.innerHTML = ''; return; }
    if (!A.audiences.length || !A.meta.tested) { el.innerHTML = '<div class="tp-empty">Chưa có dữ liệu bài kiểm tra để phân tích năng lực.</div>'; return; }
    el.innerHTML = '<div class="tp-sec">Khoảng cách năng lực theo vị trí (' + A.meta.tested + '/' + A.meta.population + ' nhân sự đã có bài kiểm tra)</div>'
      + '<div class="small" style="margin-bottom:8px">Quy tắc: một mảng được xếp “cần đào tạo” khi điểm trung bình thấp hơn yêu cầu hoặc từ 40% số người dưới ngưỡng; cần ít nhất 3 người có từ 4 câu trong mảng đó. <b>“Đạt” chỉ áp dụng cho mảng có dữ liệu</b>, mảng chưa có dữ liệu được ghi “thiếu dữ liệu”.</div>'
      + (A.meta.catMissing ? '<div class="msg warn" style="margin:0 0 8px">Còn ' + A.meta.catMissing + ' bài chưa quét xong danh mục câu hỏi nên số liệu có thể chưa đủ. Hãy bấm “Phân tích năng lực” lại sau ít phút.</div>' : '')
      + (A.missingTotal ? '<div class="msg warn" style="margin:0 0 8px">Có ' + A.missingTotal + ' mảng yêu cầu chưa có dữ liệu kiểm tra: chưa thể kết luận các mảng đó là đạt.</div>' : '')
      + A.audiences.filter(function (a) { return a.tested > 0; }).map(function (a) {
        var badge = a.gaps ? '<span class="tp-st bad">' + a.gaps + ' mảng cần đào tạo</span>' : a.missing ? '<span class="tp-st warn">Chưa đủ dữ liệu (' + a.missing + ' mảng)</span>' : '<span class="tp-st ok">Đạt yêu cầu</span>';
        return '<div class="tp-aud"><h3>' + esc(a.label) + ' · ' + badge + '</h3>'
          + '<div class="tp-meta">' + a.tested + '/' + a.people + ' người có bài' + (a.index != null ? ' · chỉ số năng lực TB ' + a.index + '%' : '') + (a.salesAvg != null ? ' · bán TB 3 tháng ' + a.salesAvg + '%' : '') + (a.reliable ? '' : ' · <b>dưới 10 người có bài: chỉ là tín hiệu</b>') + (a.salesWeight > 1 ? ' · hệ số ưu tiên theo kết quả bán ×' + a.salesWeight : '') + (a.gaps && a.missing ? ' · còn ' + a.missing + ' mảng thiếu dữ liệu' : '') + '</div>'
          + (a.note ? '<div class="msg warn" style="margin:0 0 8px">' + esc(a.note) + '</div>' : '') + gapTable(a) + diag(a) + '</div>';
      }).join('');
  }

  function renderPlan() {
    var el = document.getElementById('tpPlan'); if (!el) return;
    var head = '<div class="tp-title">KHUNG CHƯƠNG TRÌNH ĐÀO TẠO CHI TIẾT – THÁNG ' + esc(mLabel(TP.month)) + '</div><div class="tp-sub">Kế hoạch đào tạo chi tiết theo đối tượng và chương trình</div>';
    if (!TP.rows.length) { el.innerHTML = '<div class="tp-wrap">' + head + '<div class="tp-empty tp-empty-art">' + EMPTY + '<b>Chưa có kế hoạch cho tháng này.</b><span>Bấm “AI lập kế hoạch” hoặc “Thêm dòng”.</span></div></div>'; renderState(); return; }
    var ths = COLS.map(function (c) { return '<th style="min-width:' + c[2] + 'px">' + c[1] + '</th>'; }).join('') + '<th></th>';
    var body = TP.rows.map(function (r, i) {
      var off = r.thoiGian && r.thoiGian.slice(0, 7) !== TP.month;
      function ta(f, v) { return '<td><textarea rows="' + Math.max(2, Math.min(10, String(v).split('\n').length + (String(v).length > 70 ? 1 : 0))) + '" data-i="' + i + '" data-f="' + f + '">' + esc(v) + '</textarea></td>'; }
      function inp(f, v) { return '<td><input data-i="' + i + '" data-f="' + f + '" value="' + ea(v) + '"></td>'; }
      return '<tr><td class="stt">' + (i + 1) + '</td>' + inp('doiTuong', r.doiTuong) + ta('nganh', r.nganh) + ta('tenChuongTrinh', r.tenChuongTrinh) + ta('noiDung', (r.noiDung || []).map(function (x) { return '• ' + x; }).join('\n'))
        + ta('mucTieu', r.mucTieu) + ta('phuongPhap', r.phuongPhap) + inp('thoiLuong', r.thoiLuong) + inp('phuTrach', r.phuTrach)
        + '<td class="' + (off ? 'tp-off' : '') + '"><input type="date" data-i="' + i + '" data-f="thoiGian" value="' + ea(r.thoiGian) + '"' + (off ? ' title="Ngày nằm ngoài tháng ' + ea(mLabel(TP.month)) + '"' : '') + '>'
        + '<div class="' + (timeOk(r.gio, durMin(r.thoiLuong)) === false ? 'tp-bad' : '') + '"><input type="time" data-i="' + i + '" data-f="gio" value="' + ea(r.gio) + '"' + (timeOk(r.gio, durMin(r.thoiLuong)) === false ? ' title="Ngoài khung giờ cho phép: 08:00–09:30 hoặc từ 17:00"' : '') + '></div></td>'
        + '<td class="gui">' + esc(dmy(backWorkdays(r.thoiGian, TP.sendBefore))) + '</td>'
        + ta('tanSuat', r.tanSuat) + ta('ghiChu', r.ghiChu) + ta('mucTieuKd', r.mucTieuKd) + ta('chiSoDo', r.chiSoDo) + ta('coSo', r.coSo) + '<td class="act"><button type="button" class="btn ghost sm danger" data-tp-del="' + i + '" title="Xoá dòng">✕</button></td></tr>';
    }).join('');
    el.innerHTML = '<div class="tp-wrap">' + head + '<div style="overflow-x:auto"><table class="tp-plan"><thead><tr>' + ths + '</tr></thead><tbody>' + body + '</tbody></table></div></div>';
    renderState();
  }
  function renderAll() { var m = document.getElementById('tpMonth'); if (m) m.value = TP.month; renderChips(); renderBiz(); renderAnalysis(); renderPlan(); renderApprove(); renderFlow(); renderState(); }

  function onInput(e) {
    if (e.target && e.target.classList && e.target.classList.contains('tp-catsel')) { if (e.type === 'change') setCat(e.target.getAttribute('data-cat'), e.target.value); return; }
    if (e.target && (e.target.id === 'tpGoals' || e.target.id === 'tpStrat' || e.target.id === 'tpFocus')) { TP.bizDirty = true; return; }
    if (e.target && /^tp(ApSt|ApWho|ApNote|SendBefore)$/.test(e.target.id || '')) {
      var id = e.target.id, v = e.target.value; if (id === 'tpApSt') TP.approval.status = v; else if (id === 'tpApWho') TP.approval.approver = v; else if (id === 'tpApNote') TP.approval.note = v; else { TP.sendBefore = Math.min(15, Math.max(0, parseInt(v, 10) || 0)); if (e.type === 'change') renderPlan(); }
      TP.dirty = true; renderState(); return;
    }
    var t = e.target, i = t.getAttribute && t.getAttribute('data-i'), f = t.getAttribute && t.getAttribute('data-f'); if (i == null || !f || !TP.rows[+i]) return;
    var v = t.value;
    TP.rows[+i][f] = f === 'noiDung' ? v.split('\n').map(function (x) { return x.replace(/^[\s•\-–*]+/, '').trim(); }).filter(Boolean) : v;
    if (!TP.dirty || f === 'thoiGian') { var was = TP.dirty; TP.dirty = true; renderState(); if (!was) renderFlow(); }
    if ((f === 'thoiGian' || f === 'gio' || f === 'thoiLuong') && e.type === 'change') renderPlan();
  }
  function onClick(e) {
    var b = e.target.closest && e.target.closest('button'); if (!b || TP.busy) return;
    if (b.hasAttribute('data-tp-month')) { loadMonth(b.getAttribute('data-tp-month')); return; }
    if (b.hasAttribute('data-tp-del')) { TP.rows.splice(+b.getAttribute('data-tp-del'), 1); TP.dirty = true; renderPlan(); return; }
    var a = b.getAttribute('data-tp-act');
    if (a === 'analyze') analyze(true); else if (a === 'ai') generate('ai'); else if (a === 'rules') generate('rules');
    else if (a === 'flowbtn') flowAct(b.getAttribute('data-tp-flow'), +b.getAttribute('data-i')); else if (a === 'flow') createFlow(); else if (a === 'qall') genAll(); else if (a === 'biz') saveBiz(false); else if (a === 'save') save(); else if (a === 'add') { TP.rows.push(emptyRow()); TP.dirty = true; renderPlan(); } else if (a === 'csv') exportCsv(); else if (a === 'del') removePlan();
  }
  function confirmLose() { return !TP.dirty || confirm('Có thay đổi chưa lưu trong bảng kế hoạch. Bỏ các thay đổi này?'); }

  async function loadMonth(m) {
    if (!/^\d{4}-\d{2}$/.test(m || '')) return;
    if (m !== TP.month && !confirmLose()) { var mi = document.getElementById('tpMonth'); if (mi) mi.value = TP.month; return; }
    TP.month = m; TP.analysis = null; say('');
    var r = await api('GET', '/api/kt-admin?op=trainPlanGet&month=' + encodeURIComponent(m));
    if (!r.j.ok) { say(r.j.error || 'Không tải được kế hoạch.'); return; }
    TP.months = r.j.months || []; TP.biz = r.j.biz || { goals: [], strategy: [] }; TP.sales = r.j.sales || null; TP.bizDirty = false; var p = r.j.plan;
    TP.approval = p && p.approval ? p.approval : { status: 'draft', approver: '', note: '', decidedAt: null }; TP.sendBefore = p && p.sendBefore != null ? p.sendBefore : 3; TP.rows = p ? p.rows : []; TP.source = p ? p.source : 'manual'; TP.status = p ? p.status : 'draft'; TP.dirty = false; TP.flow = null; renderAll(); await loadFlow();
  }
  function bizFromForm() {
    function raw(id) { var el = document.getElementById(id); return el ? el.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean) : []; }
    function lines(id) { var el = document.getElementById(id); return el ? el.value.split('\n').map(function (x) { return x.replace(/^[\s•\-–*]+/, '').trim(); }).filter(Boolean) : []; }
    return { goals: lines('tpGoals'), strategy: lines('tpStrat'), focus: raw('tpFocus') };
  }
  async function saveBiz(quiet) {
    var b = bizFromForm(); lock(true);
    try {
      var r = await api('POST', '/api/kt-admin', { op: 'trainPlanBizSave', month: TP.month, goals: b.goals, strategy: b.strategy, focus: b.focus });
      if (!r.j.ok) { say(r.j.error || 'Không lưu được mục tiêu kinh doanh.'); return false; }
      TP.biz = r.j.biz; TP.bizDirty = false; if (!quiet) { renderBiz(); say('Đã lưu mục tiêu kinh doanh & chiến lược tháng ' + mLabel(TP.month) + '.', 'ok'); } return true;
    } finally { lock(false); }
  }
  async function setCat(name, area) {
    if (TP.busy) return; lock(true); say('Đang gắn danh mục “' + name + '” và tính lại…', 'ok');
    try { var r = await api('POST', '/api/kt-admin', { op: 'trainAreaMapSave', map: (function (o) { o[name] = area; return o; })({}) }); if (!r.j.ok) { say(r.j.error || 'Không lưu được.'); return; } }
    finally { lock(false); }
    await analyze(true);
  }
  async function analyze(refresh) {
    if (TP.bizDirty && !(await saveBiz(true))) return;
    lock(true); say('Đang phân tích năng lực…', 'ok');
    try { var r = await api('GET', '/api/kt-admin?op=trainPlanAnalysis&month=' + encodeURIComponent(TP.month) + (refresh ? '&refresh=1' : '')); if (!r.j.ok) say(r.j.error || 'Không phân tích được.'); else { TP.analysis = r.j.analysis; TP.areaNames = r.j.areas || TP.areaNames; say(''); renderAnalysis(); } }
    finally { lock(false); }
  }
  async function generate(mode) {
    if (TP.bizDirty && !(await saveBiz(true))) return;
    if (TP.rows.length && !confirm('Kế hoạch hiện có trong bảng sẽ được thay bằng kế hoạch mới (chưa lưu vào hệ thống cho đến khi bạn bấm Lưu). Tiếp tục?')) return;
    lock(true); say(mode === 'ai' ? 'AI đang phân tích và lập kế hoạch… (có thể mất đến 30 giây)' : 'Đang lập kế hoạch theo luật…', 'ok');
    try {
      var r = await api('POST', '/api/kt-admin', { op: 'trainPlanGenerate', month: TP.month, mode: mode, refresh: true });
      if (!r.j.ok) { say(r.j.error || 'Không lập được kế hoạch.', r.j.code === 'need_biz' ? 'warn' : 'err'); if (r.j.code === 'need_biz') { var g = document.getElementById('tpGoals'); if (g) g.focus(); } return; }
      TP.analysis = r.j.analysis; TP.rows = r.j.rows || []; TP.source = r.j.source; TP.dirty = TP.rows.length > 0; if (TP.rows.length && TP.approval.status !== 'draft') { TP.approval.status = 'draft'; TP.approval.decidedAt = null; } renderAll(); // kế hoạch mới thay thế thì cần duyệt lại
      var notes = (r.j.notes || []).length ? ' Lưu ý: ' + r.j.notes.join(' ') : '';
      say((r.j.warning || (TP.rows.length ? 'Đã lập ' + TP.rows.length + ' chương trình. Hãy xem lại, chỉnh sửa rồi bấm “Lưu kế hoạch”.' : '')) + notes, r.j.warning || notes ? 'warn' : 'ok');
    } finally { lock(false); }
  }
  async function save() {
    if (!TP.rows.length) { say('Chưa có dòng kế hoạch nào để lưu.'); return; }
    var wanted = TP.approval.status; lock(true);
    try {
      var r = await api('POST', '/api/kt-admin', { op: 'trainPlanSave', month: TP.month, status: 'final', source: TP.source, rows: TP.rows, approval: TP.approval, sendBefore: TP.sendBefore });
      if (!r.j.ok) { say(r.j.error || 'Không lưu được.'); return; }
      var down = wanted === 'approved' && r.j.plan.approval.status !== 'approved'; TP.rows = r.j.plan.rows; TP.approval = r.j.plan.approval; TP.sendBefore = r.j.plan.sendBefore; TP.dirty = false; TP.status = 'final';
      var l = await api('GET', '/api/kt-admin?op=trainPlanGet&month=' + encodeURIComponent(TP.month)); if (l.j.ok) TP.months = l.j.months || [];
      renderAll(); await loadFlow(); var bad = TP.rows.filter(function (x) { return timeOk(x.gio, durMin(x.thoiLuong)) === false; }).length;
      say('Đã lưu kế hoạch đào tạo tháng ' + mLabel(TP.month) + '.' + (down ? ' Nội dung đã thay đổi sau khi duyệt nên kế hoạch chuyển về “Chờ duyệt”: cần duyệt lại trước khi gửi thư.' : '') + (bad ? ' Lưu ý: ' + bad + ' buổi nằm ngoài khung giờ cho phép (08:00–09:30 hoặc từ 17:00).' : ''), bad || down ? 'warn' : 'ok');
    } finally { lock(false); }
  }
  async function removePlan() {
    if (!TP.months.some(function (m) { return m.month === TP.month; })) { TP.rows = []; TP.dirty = false; TP.flow = null; renderAll(); return; }
    if (!confirm('Xoá kế hoạch đào tạo tháng ' + mLabel(TP.month) + ' khỏi hệ thống?')) return;
    lock(true);
    try {
      var r = await api('POST', '/api/kt-admin', { op: 'trainPlanDelete', month: TP.month }); if (!r.j.ok) { say(r.j.error || 'Không xoá được.'); return; }
      TP.rows = []; TP.dirty = false; var l = await api('GET', '/api/kt-admin?op=trainPlanGet&month=' + encodeURIComponent(TP.month)); if (l.j.ok) TP.months = l.j.months || [];
      renderAll(); say('Đã xoá kế hoạch tháng ' + mLabel(TP.month) + '.', 'ok');
    } finally { lock(false); }
  }
  function csvCell(v) { v = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; }
  async function loadFlow() {
    var m = TP.month, r = await api('GET', '/api/kt-admin?op=trainFlowStatus&month=' + encodeURIComponent(m));
    if (r.j.ok && m === TP.month) { TP.flow = r.j; renderFlow(); }
  }
  async function createFlow() {
    if (TP.dirty) { say('Hãy lưu kế hoạch trước khi tạo luồng.', 'warn'); return; }
    if (!confirm('Tạo (hoặc cập nhật) luồng đào tạo tháng ' + mLabel(TP.month) + ' từ kế hoạch đã lưu?\n\nHệ thống sẽ tạo chương trình đăng ký, đề kiểm tra và khảo sát (nháp) cho từng chương trình.\nKHÔNG gửi email nào ở bước này.')) return;
    lock(true); say('Đang tạo luồng đào tạo…', 'ok');
    try {
      var r = await api('POST', '/api/kt-admin', { op: 'trainFlowCreate', month: TP.month });
      if (!r.j.ok) { say(r.j.error || 'Không tạo được luồng.', r.j.code === 'no_plan' ? 'warn' : 'err'); return; }
      TP.flow = r.j.status; renderFlow();
      var pb = r.j.problems || [];
      say(pb.length ? 'Đã tạo luồng, nhưng ' + pb.length + ' chương trình cần xử lý: ' + pb.map(function (x) { return x.title + ' — ' + x.error; }).join(' · ') : 'Đã tạo luồng đào tạo cho ' + TP.flow.items.length + ' chương trình. Chưa gửi email nào.', pb.length ? 'warn' : 'ok');
    } finally { lock(false); }
  }
  async function genOne(i) {
    var r = await api('POST', '/api/kt-admin', { op: 'trainFlowQuestions', month: TP.month, index: i });
    if (!r.j.ok) return { ok: false, text: r.j.error || 'Không soạn được câu hỏi.' };
    return { ok: true, n: r.j.generated || 0, text: r.j.generated ? 'Đã soạn ' + r.j.generated + ' câu hỏi NHÁP từ tài liệu: ' + (r.j.sources || []).join('; ') + '. Hãy xem lại và bật câu hỏi trong Ngân hàng câu hỏi.' : (r.j.note || 'Không có câu mới.') };
  }
  async function genAll() {
    if (!TP.flow || !TP.flow.created) return; lock(true); var n = 0, notes = [];
    try {
      for (var i = 0; i < TP.flow.items.length; i++) { if (!TP.flow.items[i].examId && !TP.flow.items[i].exam) continue; say('Đang soạn câu hỏi nháp… chương trình ' + (i + 1) + '/' + TP.flow.items.length, 'ok'); var g = await genOne(i); if (g.ok) n += g.n; else notes.push((i + 1) + ': ' + g.text); }
      await loadFlow(); say('Đã soạn ' + n + ' câu hỏi nháp cho các chương trình có tài liệu nguồn.' + (notes.length ? ' Lỗi: ' + notes.join(' · ') : ' Chương trình chưa có tài liệu nguồn được bỏ qua (xem ghi chú ở từng dòng khi bấm soạn riêng).'), notes.length ? 'warn' : 'ok');
    } finally { lock(false); }
  }
  // Gửi thư có chốt chặn: xem trước đúng số người → hộp xác nhận nêu rõ số người → gửi theo đợt kèm đúng số đã xem
  async function sendFlow(op, extra, i, label) {
    var title = TP.flow.items[i].title, base = Object.assign({ op: op, month: TP.month, index: i }, extra);
    var d = await api('POST', '/api/kt-admin', Object.assign({ mode: 'dry' }, base));
    if (!d.j.ok) { say(d.j.error || 'Không xem trước được.', 'warn'); return; }
    var s = d.j.stats, expect = op === 'trainFlowInvite' ? s.withEmail : s.audience, before = s.alreadyInvited || s.alreadyResent || s.alreadyReminded || 0;
    if (!s.pending) { say('Không còn ai cần gửi cho “' + title + '” (' + before + ' người đã nhận trước đó' + (s.noEmail ? ', ' + s.noEmail + ' người chưa có email' : '') + ').', 'ok'); return; }
    if (!confirm(label + ': ' + title + '\n\n• Đối tượng: ' + s.audience + ' người (' + s.noEmail + ' chưa có email)\n• Đã gửi trước đó: ' + before + ' người\n• SẼ GỬI NGAY: ' + s.pending + ' người' + (d.j.sample && d.j.sample.length ? '\n• Ví dụ: ' + d.j.sample.join(', ') : '') + '\n\nBấm OK để gửi.')) return;
    var sent = 0, guard = 0, r;
    do {
      r = await api('POST', '/api/kt-admin', Object.assign({ mode: 'send', expect: expect }, base));
      if (!r.j.ok) { say((sent ? 'Đã gửi ' + sent + ' người rồi dừng: ' : '') + (r.j.error || 'Gửi không thành công.'), 'err'); break; }
      sent += r.j.sent || 0; say('Đang gửi… ' + sent + '/' + s.pending, 'ok');
    } while (r.j.remaining > 0 && r.j.sent > 0 && ++guard < 100);
    await loadFlow();
    if (r && r.j.ok) say('Đã gửi ' + sent + ' thư “' + label.toLowerCase() + '” cho “' + title + '”' + ((r.j.failed || []).length ? ' · ' + r.j.failed.length + ' thư lỗi' : '') + '.', (r.j.failed || []).length ? 'warn' : 'ok');
  }
  async function flowAct(k, i) {
    if (!TP.flow || !TP.flow.items[i]) return; lock(true);
    try {
      if (k === 'gen') { say('AI đang soạn câu hỏi từ tài liệu…', 'ok'); var g = await genOne(i); await loadFlow(); say(g.text, g.ok && g.n ? 'ok' : 'warn'); }
      else if (k === 'invite') await sendFlow('trainFlowInvite', {}, i, 'Gửi thư mời đăng ký');
      else if (k === 'exam') await sendFlow('trainFlowExam', { kind: 'invite' }, i, 'Gửi thư làm bài kiểm tra');
      else if (k === 'remind') await sendFlow('trainFlowExam', { kind: 'remind' }, i, 'Nhắc làm bài kiểm tra');
    } finally { lock(false); }
  }
  function exportCsv() {
    if (!TP.rows.length) { say('Chưa có dòng kế hoạch nào để xuất.'); return; }
    var head = ['STT', 'Đối tượng', 'Ngành', 'Tên chương trình', 'Nội dung chính', 'Mục tiêu', 'Phương pháp', 'Thời lượng', 'Phụ trách', 'Thời gian tổ chức', 'Hạn gửi nội dung cho người duyệt', 'Tần suất', 'Ghi chú', 'Gắn mục tiêu kinh doanh', 'Chỉ số đo hiệu quả', 'Cơ sở số liệu'];
    var lines = [head.map(csvCell).join(',')].concat(TP.rows.map(function (r, i) {
      return [i + 1, r.doiTuong, r.nganh, r.tenChuongTrinh, (r.noiDung || []).map(function (x) { return '• ' + x; }).join('\n'), r.mucTieu, r.phuongPhap, r.thoiLuong, r.phuTrach, (dmy(r.thoiGian) + ' ' + (r.gio || '')).trim(), dmy(backWorkdays(r.thoiGian, TP.sendBefore)), r.tanSuat, r.ghiChu, r.mucTieuKd, r.chiSoDo, r.coSo].map(csvCell).join(',');
    }));
    var blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'ke-hoach-dao-tao-' + TP.month + '.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }

  window.tpOpen = async function () {
    css(); shell();
    if (TP.inited && TP.dirty) { renderAll(); return; } // đang sửa dở: quay lại tab không tải lại, tránh mất thay đổi
    if (!TP.inited) { TP.inited = true; TP.month = curMonth(); renderAll(); }
    await loadMonth(TP.month);
  };
})();
