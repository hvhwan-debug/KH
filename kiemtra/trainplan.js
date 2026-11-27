/* Menu "Kế hoạch đào tạo" của trang quản trị: chọn tháng → xem khoảng cách năng lực theo vị trí (luật minh bạch)
   → AI (hoặc luật) lập bảng kế hoạch đào tạo tháng → sửa tay → lưu / xuất CSV.
   Dùng các hàm có sẵn của admin.html: $, esc, api, msg. Dữ liệu nhân sự chỉ ở máy chủ; trang này chỉ nhận số liệu tổng hợp theo vị trí. */
(function () {
  'use strict';
  var TP = { month: '', rows: [], source: 'manual', status: 'draft', dirty: false, biz: { goals: [], strategy: [] }, sales: null, bizDirty: false, approval: { status: 'draft', approver: '', note: '', decidedAt: null }, sendBefore: 3, analysis: null, months: [], busy: false, inited: false };
  var COLS = [['stt', 'STT', 46], ['doiTuong', 'Đối tượng', 90], ['nganh', 'Ngành', 120], ['tenChuongTrinh', 'Tên chương trình', 200], ['noiDung', 'Nội dung chính', 320], ['mucTieu', 'Mục tiêu', 230],
    ['phuongPhap', 'Phương pháp', 150], ['thoiLuong', 'Thời lượng', 86], ['phuTrach', 'Phụ trách', 96], ['thoiGian', 'Thời gian tổ chức', 138], ['guiTruoc', 'Hạn gửi nội dung cho người duyệt', 130], ['tanSuat', 'Tần suất', 150], ['ghiChu', 'Ghi chú', 230], ['mucTieuKd', 'Gắn mục tiêu kinh doanh', 230], ['chiSoDo', 'Chỉ số đo hiệu quả', 230], ['coSo', 'Cơ sở số liệu', 230]];
  var SRC = { ai: 'AI lập', rules: 'Lập theo luật', manual: 'Nhập tay' };
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
      + '#tpRoot .tp-off input{color:#B42318;font-weight:700}#tpRoot .tp-bad input[type=time]{color:#B42318;font-weight:700;background:#FEE4E2}#tpRoot td.gui{text-align:center;vertical-align:middle;color:#475569;font-size:12.5px}#tpRoot .tp-ap{border:1px solid var(--line,#dbe3ee);border-radius:14px;padding:12px 14px;margin-top:12px;background:#fff}#tpRoot .tp-ap .tp-apg{display:grid;grid-template-columns:150px 1fr 110px;gap:10px;align-items:start}@media(max-width:800px){#tpRoot .tp-ap .tp-apg{grid-template-columns:1fr}}#tpRoot .tp-ap label{font-size:13px;font-weight:700;color:#29466e;display:block}#tpRoot .tp-ap input,#tpRoot .tp-ap select,#tpRoot .tp-ap textarea{width:100%;box-sizing:border-box;margin-top:4px;padding:7px 9px;border:1px solid var(--line,#dbe3ee);border-radius:10px;font:inherit;font-size:13px;font-weight:400}#tpRoot .tp-empty{padding:26px;text-align:center;color:#5b6b85}';
    document.head.appendChild(st);
  }

  function shell() {
    var r = root(); if (!r || r.dataset.ready) return; r.dataset.ready = '1';
    r.innerHTML = '<div class="tp-top"><div><h1>Kế hoạch đào tạo</h1><p class="small" style="margin:6px 0 0;max-width:62em">Đối chiếu năng lực thực tế của nhân sự (mọi bài kiểm tra, số bán, câu hỏi KAI…) với yêu cầu của từng vị trí để tìm khoảng cách cần giải quyết, rồi AI lập bảng kế hoạch đào tạo của tháng. '
      + 'AI chỉ nhận số liệu tổng hợp theo vị trí, không có tên hay mã nhân viên. Bạn xem, sửa lại rồi mới lưu.</p></div>'
      + '<div class="tp-bar"><label class="small">Tháng <input type="month" id="tpMonth"></label>'
      + '<button type="button" class="btn ghost sm" data-tp-act="analyze">Phân tích năng lực</button>'
      + '<button type="button" class="btn sm" data-tp-act="ai">✨ AI lập kế hoạch</button>'
      + '<button type="button" class="btn ghost sm" data-tp-act="rules" title="Lập theo luật từ bản phân tích, không dùng AI">Lập theo luật</button></div></div>'
      + '<div class="tp-chips" id="tpChips"></div><div id="tpMsg"></div><div id="tpBiz"></div><div id="tpAnalysis"></div>'
      + '<div class="tp-sec">Bảng kế hoạch đào tạo</div><div id="tpPlan"></div>'
      + '<div id="tpApprove"></div><div class="tp-bar" style="margin-top:10px"><button type="button" class="btn sm" data-tp-act="save">Lưu kế hoạch</button>'
      + '<button type="button" class="btn ghost sm" data-tp-act="add">+ Thêm dòng</button><button type="button" class="btn ghost sm" data-tp-act="csv">Xuất CSV</button>'
      + '<button type="button" class="btn ghost sm danger" data-tp-act="del">Xoá kế hoạch tháng này</button><span class="small" id="tpState"></span></div>';
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
  function renderState() {
    var el = document.getElementById('tpState'); if (!el) return;
    el.textContent = (TP.dirty ? '● Có thay đổi chưa lưu · ' : '') + (TP.dirty && TP.approval.status === 'approved' ? 'Đã duyệt nhưng có chỉnh sửa: cần duyệt lại · ' : '') + (TP.rows.length ? TP.rows.length + ' chương trình · nguồn: ' + (SRC[TP.source] || 'Nhập tay') : '');
  }
  function gapTable(a) {
    return '<table class="tp-gap"><thead><tr><th>Mảng năng lực</th><th>Yêu cầu tối thiểu</th><th>Hiện trạng TB</th><th>Dưới ngưỡng</th><th>Trạng thái</th><th>Chủ đề yếu</th><th>Học liệu</th><th>Chiến lược</th></tr></thead><tbody>'
      + a.reqs.map(function (g) {
        var cls = g.status === 'đạt' ? 'ok' : g.status === 'cần đào tạo' ? 'bad' : 'na';
        return '<tr><td>' + esc(g.areaName) + '</td><td>≥ ' + g.min + '%</td><td>' + (g.avg == null ? '—' : g.avg + '%') + '</td><td>' + (g.assessed ? g.gapPeople + '/' + g.assessed : '—') + '</td><td><span class="tp-st ' + cls + '">' + esc(g.status) + '</span></td>'
          + '<td>' + (g.topics.length ? g.topics.map(function (t) { return esc(t.name) + ' ' + t.pct + '%'; }).join('; ') : '—') + '</td><td>' + (g.materials == null ? '—' : g.materials) + '</td><td>' + (g.strategyHits && g.strategyHits.length ? '<span class="tp-st ok">Trọng tâm</span>' : '—') + '</td></tr>';
      }).join('') + '</tbody></table>';
  }
  function renderAnalysis() {
    var el = document.getElementById('tpAnalysis'); if (!el) return; var A = TP.analysis;
    if (!A) { el.innerHTML = ''; return; }
    if (!A.audiences.length || !A.meta.tested) { el.innerHTML = '<div class="tp-empty">Chưa có dữ liệu bài kiểm tra để phân tích năng lực.</div>'; return; }
    el.innerHTML = '<div class="tp-sec">Khoảng cách năng lực theo vị trí (' + A.meta.tested + '/' + A.meta.population + ' nhân sự đã có bài kiểm tra)</div>'
      + A.audiences.filter(function (a) { return a.tested > 0; }).map(function (a) {
        return '<div class="tp-aud"><h3>' + esc(a.label) + ' · ' + (a.gaps ? '<span class="tp-st bad">' + a.gaps + ' mảng cần đào tạo</span>' : '<span class="tp-st ok">Đạt yêu cầu</span>') + '</h3>'
          + '<div class="tp-meta">' + a.tested + '/' + a.people + ' người có bài' + (a.index != null ? ' · chỉ số năng lực TB ' + a.index + '%' : '') + (a.salesAvg != null ? ' · bán TB 3 tháng ' + a.salesAvg + '%' : '') + (a.reliable ? '' : ' · <b>dưới 10 người có bài: chỉ là tín hiệu</b>') + (a.salesWeight > 1 ? ' · hệ số ưu tiên theo kết quả bán ×' + a.salesWeight : '') + '</div>' + (a.note ? '<div class="msg warn" style="margin:0 0 8px">' + esc(a.note) + '</div>' : '') + gapTable(a) + '</div>';
      }).join('');
  }
  function renderPlan() {
    var el = document.getElementById('tpPlan'); if (!el) return;
    var head = '<div class="tp-title">KHUNG CHƯƠNG TRÌNH ĐÀO TẠO CHI TIẾT – THÁNG ' + esc(mLabel(TP.month)) + '</div><div class="tp-sub">Kế hoạch đào tạo chi tiết theo đối tượng và chương trình</div>';
    if (!TP.rows.length) { el.innerHTML = '<div class="tp-wrap">' + head + '<div class="tp-empty">Chưa có kế hoạch cho tháng này. Bấm “AI lập kế hoạch” hoặc “+ Thêm dòng”.</div></div>'; renderState(); return; }
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
  function renderAll() { var m = document.getElementById('tpMonth'); if (m) m.value = TP.month; renderChips(); renderBiz(); renderAnalysis(); renderPlan(); renderApprove(); renderState(); }

  function onInput(e) {
    if (e.target && (e.target.id === 'tpGoals' || e.target.id === 'tpStrat' || e.target.id === 'tpFocus')) { TP.bizDirty = true; return; }
    if (e.target && /^tp(ApSt|ApWho|ApNote|SendBefore)$/.test(e.target.id || '')) {
      var id = e.target.id, v = e.target.value; if (id === 'tpApSt') TP.approval.status = v; else if (id === 'tpApWho') TP.approval.approver = v; else if (id === 'tpApNote') TP.approval.note = v; else { TP.sendBefore = Math.min(15, Math.max(0, parseInt(v, 10) || 0)); if (e.type === 'change') renderPlan(); }
      TP.dirty = true; renderState(); return;
    }
    var t = e.target, i = t.getAttribute && t.getAttribute('data-i'), f = t.getAttribute && t.getAttribute('data-f'); if (i == null || !f || !TP.rows[+i]) return;
    var v = t.value;
    TP.rows[+i][f] = f === 'noiDung' ? v.split('\n').map(function (x) { return x.replace(/^[\s•\-–*]+/, '').trim(); }).filter(Boolean) : v;
    if (!TP.dirty || f === 'thoiGian') { TP.dirty = true; renderState(); }
    if ((f === 'thoiGian' || f === 'gio' || f === 'thoiLuong') && e.type === 'change') renderPlan();
  }
  function onClick(e) {
    var b = e.target.closest && e.target.closest('button'); if (!b || TP.busy) return;
    if (b.hasAttribute('data-tp-month')) { loadMonth(b.getAttribute('data-tp-month')); return; }
    if (b.hasAttribute('data-tp-del')) { TP.rows.splice(+b.getAttribute('data-tp-del'), 1); TP.dirty = true; renderPlan(); return; }
    var a = b.getAttribute('data-tp-act');
    if (a === 'analyze') analyze(true); else if (a === 'ai') generate('ai'); else if (a === 'rules') generate('rules');
    else if (a === 'biz') saveBiz(false); else if (a === 'save') save(); else if (a === 'add') { TP.rows.push(emptyRow()); TP.dirty = true; renderPlan(); } else if (a === 'csv') exportCsv(); else if (a === 'del') removePlan();
  }
  function confirmLose() { return !TP.dirty || confirm('Có thay đổi chưa lưu trong bảng kế hoạch. Bỏ các thay đổi này?'); }

  async function loadMonth(m) {
    if (!/^\d{4}-\d{2}$/.test(m || '')) return;
    if (m !== TP.month && !confirmLose()) { var mi = document.getElementById('tpMonth'); if (mi) mi.value = TP.month; return; }
    TP.month = m; TP.analysis = null; say('');
    var r = await api('GET', '/api/kt-admin?op=trainPlanGet&month=' + encodeURIComponent(m));
    if (!r.j.ok) { say(r.j.error || 'Không tải được kế hoạch.'); return; }
    TP.months = r.j.months || []; TP.biz = r.j.biz || { goals: [], strategy: [] }; TP.sales = r.j.sales || null; TP.bizDirty = false; var p = r.j.plan;
    TP.approval = p && p.approval ? p.approval : { status: 'draft', approver: '', note: '', decidedAt: null }; TP.sendBefore = p && p.sendBefore != null ? p.sendBefore : 3; TP.rows = p ? p.rows : []; TP.source = p ? p.source : 'manual'; TP.status = p ? p.status : 'draft'; TP.dirty = false; renderAll();
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
  async function analyze(refresh) {
    if (TP.bizDirty && !(await saveBiz(true))) return;
    lock(true); say('Đang phân tích năng lực…', 'ok');
    try { var r = await api('GET', '/api/kt-admin?op=trainPlanAnalysis&month=' + encodeURIComponent(TP.month) + (refresh ? '&refresh=1' : '')); if (!r.j.ok) say(r.j.error || 'Không phân tích được.'); else { TP.analysis = r.j.analysis; say(''); renderAnalysis(); } }
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
    lock(true);
    try {
      var r = await api('POST', '/api/kt-admin', { op: 'trainPlanSave', month: TP.month, status: 'final', source: TP.source, rows: TP.rows, approval: TP.approval, sendBefore: TP.sendBefore });
      if (!r.j.ok) { say(r.j.error || 'Không lưu được.'); return; }
      TP.rows = r.j.plan.rows; TP.approval = r.j.plan.approval; TP.sendBefore = r.j.plan.sendBefore; TP.dirty = false; TP.status = 'final';
      var l = await api('GET', '/api/kt-admin?op=trainPlanGet&month=' + encodeURIComponent(TP.month)); if (l.j.ok) TP.months = l.j.months || [];
      renderAll(); var bad = TP.rows.filter(function (x) { return timeOk(x.gio, durMin(x.thoiLuong)) === false; }).length;
      say('Đã lưu kế hoạch đào tạo tháng ' + mLabel(TP.month) + '.' + (bad ? ' Lưu ý: ' + bad + ' buổi nằm ngoài khung giờ cho phép (08:00–09:30 hoặc từ 17:00).' : ''), bad ? 'warn' : 'ok');
    } finally { lock(false); }
  }
  async function removePlan() {
    if (!TP.months.some(function (m) { return m.month === TP.month; })) { TP.rows = []; TP.dirty = false; renderAll(); return; }
    if (!confirm('Xoá kế hoạch đào tạo tháng ' + mLabel(TP.month) + ' khỏi hệ thống?')) return;
    lock(true);
    try {
      var r = await api('POST', '/api/kt-admin', { op: 'trainPlanDelete', month: TP.month }); if (!r.j.ok) { say(r.j.error || 'Không xoá được.'); return; }
      TP.rows = []; TP.dirty = false; var l = await api('GET', '/api/kt-admin?op=trainPlanGet&month=' + encodeURIComponent(TP.month)); if (l.j.ok) TP.months = l.j.months || [];
      renderAll(); say('Đã xoá kế hoạch tháng ' + mLabel(TP.month) + '.', 'ok');
    } finally { lock(false); }
  }
  function csvCell(v) { v = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; }
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
