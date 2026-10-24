/* Gửi thông báo và thư mời cho thí sinh theo mẫu: Zalo, tin nhắn SMS hoặc email.
   - Thông báo: nhắc làm bài, sắp mở / sắp đóng đề, kết quả, tự soạn.
   - Thư mời: mời làm bài kiểm tra, mời tham dự đào tạo (điền thông tin buổi đào tạo).
   - Zalo / SMS: mở sẵn ứng dụng với đúng người nhận, người gửi bấm gửi (Zalo cần dán nội dung vì Zalo không cho điền sẵn).
   - Email: hệ thống gửi trực tiếp tới email đã lưu trong hồ sơ (thư mời có khung riêng và nút bấm).
   Dùng chung cho trang quản trị (tab Thông báo) và trang quản lí (cửa sổ Gửi thông báo).
   KTNotify.mount(container, { recipients, exam, origin, sendEmail(items, subject, kind) }) */
(function(){
'use strict';
var TRAIN_FIELDS = [
  { k:'ten_khoa', label:'Tên khoá đào tạo', req:true, w:true, ph:'Ví dụ: Đào tạo sản phẩm mới quý 4' },
  { k:'bat_dau', label:'Bắt đầu', type:'datetime-local', req:true },
  { k:'ket_thuc', label:'Kết thúc (không bắt buộc)', type:'datetime-local' },
  { k:'hinh_thuc', label:'Hình thức', type:'select', opts:['Trực tiếp','Trực tuyến'], def:'Trực tiếp' },
  { k:'dia_diem', label:'Địa điểm hoặc liên kết tham gia', ph:'Số phòng, địa chỉ hoặc đường link họp' },
  { k:'giang_vien', label:'Giảng viên / đơn vị tổ chức', w:true },
  { k:'noi_dung', label:'Nội dung chính', type:'textarea', w:true, ph:'Mỗi ý một dòng hoặc ngăn cách bằng dấu phẩy' },
  { k:'han_xn', label:'Hạn xác nhận tham dự', type:'datetime-local', keep:true },
  { k:'lien_he', label:'Liên hệ xác nhận', ph:'Tên, số điện thoại hoặc email', keep:true },
  { k:'kieu_mau', label:'Mẫu minh hoạ khi xuất ảnh / PDF', type:'select', w:true, keep:true,
    opts:['Không dùng (thư đơn giản)','Mẫu 1','Mẫu 2','Mẫu 3','Mẫu 4','Mẫu 5','Mẫu 6','Mẫu 7','Mẫu 8','Mẫu 9','Mẫu 10'], def:'Không dùng (thư đơn giản)' }
];
var CUSTOM_FIELDS = [
  { k:'tieu_de', label:'Tiêu đề thư mời', req:true, w:true, max:60, def:'THƯ MỜI', ph:'Ví dụ: THƯ MỜI HỌP TỔNG KẾT QUÝ' },
  { k:'noi_dung', label:'Nội dung lời mời', type:'textarea', req:true, w:true, ph:'Viết lời mời: lý do, mục đích và nội dung chính. Ví dụ: Ban Tổ chức trân trọng kính mời Anh/Chị tham dự…' },
  { k:'bat_dau', label:'Thời gian bắt đầu (không bắt buộc)', type:'datetime-local' },
  { k:'ket_thuc', label:'Kết thúc (không bắt buộc)', type:'datetime-local' },
  { k:'dia_diem', label:'Địa điểm (không bắt buộc)', w:true, ph:'Số phòng, địa chỉ hoặc đường link họp' },
  { k:'han_xn', label:'Hạn xác nhận (không bắt buộc)', type:'datetime-local' },
  { k:'lien_he', label:'Liên hệ xác nhận (không bắt buộc)', ph:'Tên, số điện thoại hoặc email' },
  { k:'lien_ket', label:'Liên kết cho nút bấm (không bắt buộc)', w:true, ph:'https://… (hiện thành nút trong email và ảnh)' },
  { k:'nut', label:'Chữ trên nút', def:'Mở liên kết' }
];
var TEST_FIELDS = [ { k:'ghi_chu', label:'Lưu ý thêm (không bắt buộc)', type:'textarea', w:true, ph:'Ví dụ: Làm bài ở nơi yên tĩnh, dùng điện thoại hoặc máy tính có camera.' } ];
var TEMPLATES = [
  { id:'remind', group:'Thông báo', name:'Nhắc làm bài', filter:'todo', subject:'Nhắc làm bài kiểm tra: {ten_de}',
    text:'Chào {ten}, bạn chưa hoàn thành bài kiểm tra “{ten_de}”. Hạn làm bài: {han}.\nVui lòng truy cập {link} và nhập mã nhân viên, email công ty để làm bài.\nCảm ơn bạn.' },
  { id:'open', group:'Thông báo', name:'Sắp mở đề', filter:'todo', subject:'Bài kiểm tra “{ten_de}” sắp mở',
    text:'Chào {ten}, bài kiểm tra “{ten_de}” sẽ mở lúc {mo}.\nBạn truy cập {link} và nhập mã nhân viên, email công ty để làm bài.\nChúc bạn hoàn thành tốt.' },
  { id:'close', group:'Thông báo', name:'Sắp đóng đề', filter:'todo', subject:'Bài kiểm tra “{ten_de}” sắp đóng',
    text:'Chào {ten}, bài kiểm tra “{ten_de}” sẽ đóng lúc {han} và bạn chưa hoàn thành bài.\nVui lòng làm bài sớm tại {link}.\nCảm ơn bạn.' },
  { id:'result', group:'Thông báo', name:'Thông báo kết quả', filter:'done', subject:'Kết quả bài kiểm tra: {ten_de}',
    text:'Chào {ten}, bạn đã hoàn thành bài kiểm tra “{ten_de}” với kết quả {diem}/{tong} câu đúng ({phan_tram}).\nXem kết quả đã xác thực tại: {link_ket_qua}' },
  { id:'custom', group:'Thông báo', name:'Tự soạn', filter:'all', subject:'Thông báo về bài kiểm tra: {ten_de}', text:'Chào {ten},\n' },
  { id:'inviteTest', group:'Thư mời', name:'Mời làm bài kiểm tra', filter:'todo', kind:'invite', fields:TEST_FIELDS, cta:'test',
    subject:'Thư mời làm bài kiểm tra: {ten_de}',
    text:'Kính gửi {ten},\nBộ phận quản lý trân trọng mời bạn tham gia bài kiểm tra “{ten_de}”.\n- Thời gian mở đề: {mo_tuy}\n- Hạn hoàn thành: {han_tuy}\n- Đường dẫn làm bài: {link}\nBạn nhập mã nhân viên và email công ty để vào bài, bài làm được lưu và chấm tự động.\n{ghi_chu}\nTrân trọng.' },
  { id:'inviteCustom', group:'Thư mời', name:'Thư mời tuỳ chọn', filter:'all', allAudience:true, kind:'invite', fields:CUSTOM_FIELDS, cta:'custom',
    subject:'{tieu_de}',
    text:'{tieu_de}\nThân gửi : {ten},\n{noi_dung}\n\n* Thời gian: {thoi_gian}\n* Địa điểm / Đường dẫn: {dia_diem}\n\nVui lòng xác nhận tham dự trước {han_xn}.\nLiên hệ xác nhận: {lien_he}\nTrân trọng.' },
  { id:'inviteTrain', group:'Thư mời', name:'Mời tham dự đào tạo', filter:'all', allAudience:true, kind:'invite', fields:TRAIN_FIELDS, cta:'train',
    subject:'Thư mời tham dự đào tạo: {ten_khoa}',
    text:'THƯ MỜI THAM DỰ ĐÀO TẠO\nThân gửi : {ten},\nNhằm nâng cao kiến thức chuyên môn, chuẩn hóa năng lực và hỗ trợ nâng cao hiệu quả công việc, ĐTKDGT trân trọng kính mời Anh/Chị tham dự chương trình đào tạo với thông tin cụ thể như sau:\n\n1. THÔNG TIN CHƯƠNG TRÌNH\n\n* Tên khóa đào tạo: {ten_khoa}\n* Thời gian: {thoi_gian}\n* Hình thức: {hinh_thuc}\n* Địa điểm / Đường dẫn tham dự: {dia_diem}\n* Giảng viên / Đơn vị tổ chức: {giang_vien}\n* Nội dung chính: {noi_dung}\n\n2. QUY ĐỊNH THAM DỰ\n\nĐể bảo đảm chất lượng và hiệu quả chương trình, Anh/Chị vui lòng thực hiện các yêu cầu sau:\n\n* Tham dự đầy đủ, đúng giờ và tuân thủ thời lượng của chương trình.\n* Chủ động chuẩn bị các điều kiện cần thiết để tham gia đào tạo; đối với chương trình trực tuyến, vui lòng kiểm tra thiết bị và đường truyền trước giờ học.\n* Tích cực tham gia các hoạt động học tập, trao đổi và thực hành theo hướng dẫn của giảng viên.\n* Hoàn thành bài kiểm tra, khảo sát hoặc các yêu cầu sau đào tạo theo thông báo của Ban Tổ chức (nếu có).\n* Trường hợp không thể tham dự hoặc phát sinh vấn đề ảnh hưởng đến việc tham gia, vui lòng thông báo sớm cho {lien_he} để được hướng dẫn xử lý.\n\n3. XÁC NHẬN THAM DỰ\n\nVui lòng xác nhận tham dự trước {han_xn} với {lien_he} để Ban Tổ chức chủ động công tác chuẩn bị.\nSự tham gia nghiêm túc và chủ động của Anh/Chị là yếu tố quan trọng góp phần nâng cao hiệu quả chương trình đào tạo và khả năng vận dụng kiến thức vào thực tiễn công việc.\n\nTrân trọng,\nĐÀO TẠO KINH DOANH |  GT' }
];
var VARS = [['ten','Tên'],['ma_nv','Mã NV'],['ten_de','Tên đề'],['link','Link làm bài'],['mo','Giờ mở'],['han','Hạn làm bài'],['diem','Số câu đúng'],['tong','Tổng số câu'],['phan_tram','Phần trăm'],['link_ket_qua','Link kết quả'],['quan_li','Quản lí']];
var CHANNELS = [['zalo','Zalo'],['sms','Tin nhắn SMS'],['email','Email'],['png','Ảnh PNG'],['pdf','Xuất PDF']];

function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmt(ms){
  if (!ms) return '';
  try {
    var p = {}; new Intl.DateTimeFormat('en-GB', { timeZone:'Asia/Ho_Chi_Minh', hourCycle:'h23', hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', year:'numeric' }).formatToParts(new Date(ms)).forEach(function(x){ p[x.type] = x.value; });
    return p.hour + ':' + p.minute + ' ' + p.day + '/' + p.month + '/' + p.year;
  } catch(e){ return ''; }
}
function dl(v){ // "2026-10-25T08:30" (giờ Việt Nam) -> { t:"08:30", d:"25/10/2026" }
  var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v || ''); return m ? { t: m[4] + ':' + m[5], d: m[3] + '/' + m[2] + '/' + m[1] } : null;
}
function range(a, b){
  var x = dl(a), y = dl(b); if (!x) return '';
  if (!y) return x.t + ' ngày ' + x.d;
  return x.d === y.d ? x.t + ' – ' + y.t + ', ngày ' + x.d : x.t + ' ' + x.d + ' – ' + y.t + ' ' + y.d;
}
function eventVars(v, base){
  var h = dl(v.han_xn), tr = base === 'inviteTrain';
  return { ten_khoa: v.ten_khoa || '', thoi_gian: range(v.bat_dau, v.ket_thuc), hinh_thuc: v.hinh_thuc || '', dia_diem: v.dia_diem || '', giang_vien: v.giang_vien || '',
    noi_dung: v.noi_dung || '', han_xn: h ? h.t + ' ngày ' + h.d : (tr ? 'thời hạn do Ban Tổ chức thông báo' : ''), lien_he: v.lien_he || (tr ? 'Ban Tổ chức' : ''), ghi_chu: v.ghi_chu || '',
    tieu_de: String(v.tieu_de || '').trim().toLocaleUpperCase('vi'), lien_ket: v.lien_ket || '', nut: v.nut || '' };
}
function render(tpl, r, ex, origin, extra, optional){
  var NONE = 'theo thông báo của quản lý';
  var vals = {
    ten: r.name || r.code, ma_nv: r.code, ten_de: (ex && ex.title) || '', quan_li: r.manager || '',
    link: ex && ex.id ? origin + '/kiemtra/?exam=' + encodeURIComponent(ex.id) : origin + '/kiemtra/',
    mo: fmt(ex && ex.openAt) || NONE, han: fmt(ex && ex.closeAt) || NONE, mo_tuy: fmt(ex && ex.openAt), han_tuy: fmt(ex && ex.closeAt),
    diem: r.result ? r.result.score : '', tong: r.result ? r.result.total : '', phan_tram: r.result ? r.result.pct + '%' : '',
    link_ket_qua: r.result && r.result.verify ? origin + '/kiemtra/ketqua.html?t=' + encodeURIComponent(r.result.verify) : ''
  };
  Object.keys(extra || {}).forEach(function(k){ vals[k] = extra[k]; });
  var opt = optional || [];
  var lines = String(tpl).split('\n').filter(function(line){ // dòng chứa thông tin tuỳ chọn còn trống thì bỏ cả dòng
    var m = line.match(/\{(\w+)\}/g) || [];
    return !m.some(function(x){ var k = x.slice(1,-1); return opt.indexOf(k) >= 0 && String(vals[k] == null ? '' : vals[k]).trim() === ''; });
  });
  return lines.join('\n').replace(/\{(\w+)\}/g, function(m, k){ return k in vals ? String(vals[k]) : m; });
}

/* ---------- Xuất ảnh PNG thư mời ---------- */
var FONT = '"Be Vietnam Pro","Segoe UI",Roboto,Arial,sans-serif';
var CAPS_RE = /^[\p{Lu}\d][\p{Lu}\d \t,.\-–:\/|()]*$/u, SEC_RE = /^\d+\.\s+[\p{Lu}\d \t,.\-–:\/|()]+$/u, URL_RE = /^https?:\/\//i;
// Vẽ (hoặc chỉ đo khi dry = true) thư mời lên canvas. Trả về chiều cao ảnh (đơn vị 1x). logo: ảnh biểu tượng (có thể null).
function paintLetter(ctx, o, dry){
  var W = 1080, M = 64, LH = 44, BODY = 28, NAVY = '#102e5b', BLUE = '#0b3f94', LINK = '#0869df';
  var raw = String(o.text || '').split('\n').map(function(l){ return l.replace(/\s+$/, ''); });
  var title = o.kind === 'invite' ? 'THƯ MỜI' : 'THÔNG BÁO';
  if (raw.length && CAPS_RE.test(raw[0].trim()) && raw[0].trim().length <= 60){ title = raw.shift().trim(); while (raw.length && !raw[0].trim()) raw.shift(); }
  function font(bold, size){ ctx.font = (bold ? '700 ' : '400 ') + size + 'px ' + FONT; }
  function rr(x, y, w, h, r){ ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  // tách các đoạn có kiểu chữ riêng thành từng từ, rồi ngắt dòng theo bề rộng
  function words(segs){
    var out = [];
    segs.forEach(function(sg){
      String(sg.t).split(/(\s+)/).forEach(function(w){ if (w !== '') out.push({ t:w, b:!!sg.b, c:sg.c, sp:/^\s+$/.test(w) }); });
    });
    return out;
  }
  function flow(segs, x0, maxX, y, size){ // trả về y sau đoạn; vẽ nếu !dry
    var x = x0, ws = words(segs), lines = 1;
    function put(t, b, c){ font(b, size); var w = ctx.measureText(t).width; if (!dry){ ctx.fillStyle = c; ctx.fillText(t, x, y + (lines - 1) * LH); } x += w; }
    ws.forEach(function(w){
      font(w.b, size);
      var width = ctx.measureText(w.t).width, col = URL_RE.test(w.t) ? LINK : (w.c || NAVY);
      if (w.sp){ if (x > x0) x += width; return; }
      if (x + width > maxX && x > x0){ lines++; x = x0; }
      if (width > maxX - x0){ // từ dài (đường dẫn): ngắt theo ký tự
        var buf = '';
        for (var i = 0; i < w.t.length; i++){
          var tryT = buf + w.t[i]; font(w.b, size);
          if (x + ctx.measureText(tryT).width > maxX && buf){ put(buf, w.b, col); lines++; x = x0; buf = w.t[i]; } else buf = tryT;
        }
        if (buf) put(buf, w.b, col);
      } else put(w.t, w.b, col);
    });
    return y + lines * LH;
  }
  var headH = 150;
  // nền + dải tiêu đề
  if (!dry){
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, o.H);
    var g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#0869df'); g.addColorStop(1, '#08b9d4');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, headH);
    ctx.fillStyle = '#ffffff'; rr(M, 39, 72, 72, 20); ctx.fill();
    if (o.logo){ try { ctx.drawImage(o.logo, M + 8, 47, 56, 56); } catch(e){} }
    ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#ffffff'; font(true, 38); ctx.fillText(title, M + 72 + 26, 82);
    font(false, 21); ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.fillText('Hệ thống kiểm tra đánh giá trực tuyến', M + 72 + 26, 114);
  }
  var y = headH + 62;
  raw.forEach(function(l){
    var t = l.trim();
    if (!t){ y += 18; return; }
    if (SEC_RE.test(t)){
      y += 14;
      if (!dry){ ctx.fillStyle = '#08b9d4'; rr(M, y - 31, 8, 40, 4); ctx.fill(); font(true, 30); ctx.fillStyle = BLUE; ctx.fillText(t, M + 24, y); }
      y += 50; return;
    }
    if (/^[*\-•]\s+/.test(t)){
      var body = t.replace(/^[*\-•]\s+/, ''), i = body.indexOf(': '), label = i > 0 ? body.slice(0, i) : '', segs;
      if (label && label.length <= 50 && !/[.,;]/.test(label)) segs = [{ t:label + ':', b:true, c:NAVY }, { t:' ' + body.slice(i + 2) }]; else segs = [{ t:body }];
      if (!dry){ ctx.fillStyle = '#08b9d4'; ctx.beginPath(); ctx.arc(M + 12, y - 10, 5, 0, Math.PI * 2); ctx.fill(); }
      y = flow(segs, M + 36, W - M, y, BODY) + 6; return;
    }
    if (CAPS_RE.test(t) && t.length <= 60){ y = flow([{ t:t, b:true, c:BLUE }], M, W - M, y, BODY) + 4; return; }
    y = flow([{ t:t }], M, W - M, y, BODY) + 6;
  });
  if (o.cta && URL_RE.test(o.cta.url || '')){
    y += 20;
    var bw = 440, bh = 76;
    if (!dry){
      var g2 = ctx.createLinearGradient(M, 0, M + bw, 0); g2.addColorStop(0, '#0869df'); g2.addColorStop(1, '#08b9d4');
      ctx.fillStyle = g2; rr(M, y, bw, bh, 20); ctx.fill();
      ctx.fillStyle = '#ffffff'; font(true, 28); var tw = ctx.measureText(o.cta.label).width; ctx.fillText(o.cta.label, M + (bw - tw) / 2, y + 49);
    }
    y += bh + 34;
    if (o.qr){ // mã QR thật của đường link, để quét trực tiếp bằng điện thoại
      var qs = 160;
      if (!dry){
        ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#d6e6f9'; ctx.lineWidth = 2; rr(M, y, qs, qs, 16); ctx.fill(); ctx.stroke();
        try { ctx.drawImage(o.qr, M + 14, y + 14, qs - 28, qs - 28); } catch(e){}
        font(false, 20); ctx.fillStyle = '#526b91'; var ql = ['Quét mã QR', 'để mở liên kết']; ctx.fillText(ql[0], M + qs + 20, y + qs / 2 - 2); ctx.fillText(ql[1], M + qs + 20, y + qs / 2 + 24);
      }
      y += qs + 24;
    }
    y = flow([{ t:o.cta.url, c:'#526b91' }], M, W - M, y, 22) + 4;
  }
  y += 34;
  if (!dry){ ctx.strokeStyle = '#e1ecf8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(W - M, y); ctx.stroke(); font(false, 20); ctx.fillStyle = '#7186a5'; ctx.fillText('Hệ thống kiểm tra đánh giá trực tuyến', M, y + 40); }
  return y + 72;
}
var qrLibP = null;
function loadQrLib(){
  if (window.qrcode) return Promise.resolve(window.qrcode);
  if (qrLibP) return qrLibP;
  qrLibP = new Promise(function(res, rej){ var sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'; sc.onload = function(){ res(window.qrcode); }; sc.onerror = function(){ qrLibP = null; rej(new Error('qr')); }; document.head.appendChild(sc); });
  return qrLibP;
}
// Trả về Promise<string|null> data URL (PNG) của mã QR cho một đường link, hoặc null nếu không tạo được
async function qrDataUrl(text){
  try {
    var lib = await loadQrLib(), qr = lib(0, 'M');
    qr.addData(String(text)); qr.make();
    return qr.createDataURL(6, 2);
  } catch(e){ return null; }
}
// Trả về Promise<HTMLImageElement|null> ảnh QR đã tải xong (sẵn sàng vẽ lên canvas), cho một đường link; null nếu đường link không hợp lệ hoặc không tạo được QR
async function qrImageFor(url){
  if (!URL_RE.test(String(url || '').trim())) return null;
  var durl = await qrDataUrl(String(url).trim()); if (!durl) return null;
  return new Promise(function(res){ var im = new Image(); im.onload = function(){ res(im); }; im.onerror = function(){ res(null); }; im.src = durl; });
}
function newCanvas(w, h){ var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
var logoP = null;
function loadLogo(){
  if (logoP) return logoP;
  logoP = new Promise(function(res){ var im = new Image(); im.onload = function(){ res(im); }; im.onerror = function(){ res(null); }; im.src = '/kiemtra/logo-mark.png'; });
  return logoP;
}
async function ensureFonts(){
  try { if (document.fonts && document.fonts.load){ await Promise.all([document.fonts.load('400 28px "Be Vietnam Pro"'), document.fonts.load('700 28px "Be Vietnam Pro"')]); } } catch(e){}
}
// Trả về Promise<Blob> ảnh PNG (độ nét x2). o.canvas (nếu có, ví dụ ảnh minh hoạ dựng sẵn) được dùng trực tiếp thay vì vẽ khung thư đơn giản.
async function renderPng(o){
  if (o.canvas) return new Promise(function(res, rej){ o.canvas.toBlob(function(b){ b ? res(b) : rej(new Error('png')); }, 'image/png'); });
  await ensureFonts();
  var logo = await loadLogo(), S = 2, qr = o.cta ? await qrImageFor(o.cta.url) : null;
  var probe = newCanvas(10, 10).getContext('2d'), H = Math.ceil(paintLetter(probe, { text:o.text, kind:o.kind, cta:o.cta, qr:qr }, true));
  var c = newCanvas(1080 * S, H * S), ctx = c.getContext('2d'); ctx.scale(S, S);
  paintLetter(ctx, { text:o.text, kind:o.kind, cta:o.cta, qr:qr, logo:logo, H:H }, false);
  return new Promise(function(res, rej){ c.toBlob(function(b){ b ? res(b) : rej(new Error('png')); }, 'image/png'); });
}
function slug(s){ return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').replace(/[^A-Za-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0, 40) || 'thu-moi'; }
function saveBlob(blob, name){ var a = document.createElement('a'), u = URL.createObjectURL(blob); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(u); }, 4000); }
var zipP = null;
function loadZip(){
  if (window.JSZip) return Promise.resolve(window.JSZip);
  if (zipP) return zipP;
  zipP = new Promise(function(res, rej){ var sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; sc.onload = function(){ res(window.JSZip); }; sc.onerror = function(){ zipP = null; rej(new Error('zip')); }; document.head.appendChild(sc); });
  return zipP;
}
var pdfP = null;
function loadPdfLib(){
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (pdfP) return pdfP;
  pdfP = new Promise(function(res, rej){ var sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'; sc.onload = function(){ res(window.jspdf && window.jspdf.jsPDF); }; sc.onerror = function(){ pdfP = null; rej(new Error('pdf')); }; document.head.appendChild(sc); });
  return pdfP;
}
// Trả về Promise<Blob> PDF từ một hoặc nhiều thư (mỗi thư một trang, khổ A4, co theo tỉ lệ của thư).
// Mỗi phần tử: { text, kind, cta } để vẽ khung thư đơn giản, hoặc { canvas } để dùng trực tiếp ảnh minh hoạ đã dựng sẵn.
async function renderPdf(items){
  var JsPDF = await loadPdfLib(); if (!JsPDF) throw new Error('pdf');
  await ensureFonts();
  var logo = await loadLogo(), S = 2, W_MM = 210, doc = null;
  for (var i = 0; i < items.length; i++){
    var o = items[i], c;
    if (o.canvas) c = o.canvas;
    else {
      var qr = o.cta ? await qrImageFor(o.cta.url) : null;
      var probe = newCanvas(10, 10).getContext('2d'), H = Math.ceil(paintLetter(probe, { text:o.text, kind:o.kind, cta:o.cta, qr:qr }, true));
      c = newCanvas(1080 * S, H * S); var ctx = c.getContext('2d'); ctx.scale(S, S);
      paintLetter(ctx, { text:o.text, kind:o.kind, cta:o.cta, qr:qr, logo:logo, H:H }, false);
    }
    var imgData = c.toDataURL('image/jpeg', 0.92), hMm = W_MM * c.height / c.width;
    if (!doc) doc = new JsPDF({ unit:'mm', format:[W_MM, hMm], compress:true });
    else doc.addPage([W_MM, hMm]);
    doc.addImage(imgData, 'JPEG', 0, 0, W_MM, hMm);
  }
  return doc.output('blob');
}
function fnamePdf(r){ return slug(r.code + '-' + (r.name || '')) + '.pdf'; }

/* ---------- 10 mẫu minh hoạ (poster) cho thư mời tham dự đào tạo ---------- */
var POSTER_STYLES = [
  { blue:'#0878ed', yellow:'#ffe16a', avatar:'👩🏻‍💼', dateIcon:'📋' },
  { blue:'#0878ed', yellow:'#ffd65b', avatar:'👨🏻‍💼', dateIcon:'🤝' },
  { blue:'#073d91', yellow:'#ffcf4d', avatar:'👩🏻‍💼', dateIcon:'📈' },
  { blue:'#006acb', yellow:'#ffe36a', avatar:'👨🏻‍💼', dateIcon:'🛠️' },
  { blue:'#06a8d9', yellow:'#ffdc63', avatar:'👩🏻‍💼', dateIcon:'💧' },
  { blue:'#082d68', yellow:'#ffd05a', avatar:'👨🏻‍💼', dateIcon:'♟️' },
  { blue:'#0878ed', yellow:'#ffe16a', avatar:'👩🏻‍💼', dateIcon:'🎯' },
  { blue:'#0786df', yellow:'#a9eddf', avatar:'👨🏻‍💼', dateIcon:'🛒' },
  { blue:'#098f8a', yellow:'#b8f0d9', avatar:'👩🏻‍💼', dateIcon:'💬' },
  { blue:'#073d91', yellow:'#ffcc4d', avatar:'👨🏻‍💼', dateIcon:'🚀' }
];
var POSTER_CSS = '\n*{box-sizing:border-box}body{margin:0;background:#fff;color:#102c53;font-family:Arial,"Segoe UI",sans-serif}\n.poster{--blue:#0878ed;--yellow:#ffe16a;background:#fff;border-radius:23px;overflow:hidden;box-shadow:none;position:relative;isolation:isolate}\n.poster-top{padding:24px 25px 22px;background:linear-gradient(135deg,#d9f0ff 0%,#f9fdff 52%,#c3e7ff 100%);position:relative;overflow:hidden}\n.poster-top:before{content:"";position:absolute;width:270px;height:270px;border-radius:50%;background:#fff9;right:-100px;top:-90px;z-index:0}\n.poster-top:after{content:"";position:absolute;width:170px;height:170px;border-radius:50%;background:var(--blue);opacity:.08;right:-35px;top:-65px;z-index:0}\n.brand{display:flex;align-items:center;gap:7px;color:var(--blue);font-size:11px;font-weight:900;letter-spacing:.6px;position:relative;z-index:1}.brand-logo{display:grid;place-items:center;width:25px;height:25px;border-radius:8px;background:var(--blue);color:white}.brand small{margin-left:auto;font-size:8px;letter-spacing:.8px}\n.megaphone{position:absolute;right:22px;top:55px;font-size:39px;transform:rotate(-12deg);z-index:2;filter:drop-shadow(0 5px 3px #124c8022)}\n.eyebrow{position:relative;z-index:2;display:inline-block;margin-top:22px;padding:8px 14px;border-radius:999px;background:var(--blue);color:white;font-weight:900;font-size:11px;letter-spacing:1px;box-shadow:0 5px 0 #004cae22}\n.poster h2{position:relative;z-index:2;color:#092f68;font-size:30px;line-height:1.08;letter-spacing:-.7px;text-transform:uppercase;margin:14px 0 10px;font-weight:1000;text-shadow:0 2px white}\n.subpill{position:relative;z-index:2;display:inline-block;background:var(--yellow);color:#123a70;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:900;max-width:100%}\n.hero-row{display:flex;gap:14px;align-items:flex-end;margin-top:16px;position:relative;z-index:2}\n.intro{flex:1 1 auto;min-width:0}.intro p{margin:0 0 6px;font-size:13px;line-height:1.55;color:#20365e}.intro p:last-child{margin-bottom:0}\n.character{flex:0 0 auto;text-align:center}.character-halo{display:none}.avatar{font-size:54px;line-height:1}\n.character-caption{margin-top:2px;background:var(--blue);color:#fff;font-size:10px;font-weight:900;border-radius:10px;padding:4px 8px;line-height:1.3}\n.deadline-band{display:flex;align-items:center;gap:14px;padding:16px 22px;background:#f4f9ff;border-top:1px dashed #cfe3fb;border-bottom:1px dashed #cfe3fb}\n.date-icon{font-size:30px;flex:0 0 auto}\n.deadline-copy{flex:1 1 auto;min-width:0}.deadline-copy small{display:block;color:#5c7aa6;font-weight:800;font-size:10px;letter-spacing:.6px}.deadline-copy strong{display:block;color:#0b3f94;font-size:16px;margin:2px 0}.deadline-copy span{display:block;color:#5c7aa6;font-size:11.5px}\n.qr{flex:0 0 auto;text-align:center;font-size:9px;color:#5c7aa6;font-weight:800;max-width:76px}.fake-qr{font-size:22px;background:#fff;border:1.5px solid #cfe3fb;border-radius:10px;width:58px;height:58px;display:grid;place-items:center;margin:0 auto 4px;object-fit:contain;padding:3px}\n.info-grid{display:grid;grid-template-columns:1fr;gap:12px;padding:18px 22px}\n.info{display:flex;gap:10px;align-items:flex-start}.info-icon{font-size:20px;flex:0 0 auto}.info small{display:block;color:#5c7aa6;font-weight:800;font-size:10px;letter-spacing:.5px}.info b{display:block;color:#15335e;font-size:13.5px;font-weight:700;line-height:1.45}\n.footer-cta{display:flex;gap:10px;align-items:flex-start;padding:16px 22px;background:#f4f9ff;position:relative}.chat-icon{font-size:22px;flex:0 0 auto}.footer-cta strong{display:block;color:#0b3f94;font-size:13.5px}.footer-cta p{margin:3px 0 0;color:#426089;font-size:12px;line-height:1.5}.spark{position:absolute;right:18px;top:14px;color:var(--yellow);font-size:16px}\n.poster-foot{display:flex;justify-content:space-between;gap:10px;padding:10px 22px 16px;color:#8ca3c4;font-size:9.5px;font-weight:800;letter-spacing:.4px}';

function posterBody(v, ms){
  return '<section class="poster" style="--blue:'+v.blue+';--yellow:'+v.yellow+'">'+
    '<div class="poster-top">'+
      '<div class="brand"><span class="brand-logo">✦</span><span>'+esc(ms.brand)+'</span><small>'+esc(ms.brandSub)+'</small></div>'+
      '<div class="megaphone">📣</div>'+
      '<div class="eyebrow">THƯ MỜI ĐÀO TẠO</div>'+
      '<h2>'+esc(ms.title)+'</h2>'+
      '<div class="subpill">'+esc(ms.subpill)+'</div>'+
      '<div class="hero-row">'+
        '<div class="intro">'+
          '<p><b>Kính gửi '+esc(ms.name)+',</b></p>'+
          '<p>Nhằm nâng cao kiến thức và năng lực ứng dụng vào công việc thực tế, kính mời Anh/Chị tham gia chương trình đào tạo theo thông tin bên dưới.</p>'+
          '<p>Hãy cùng học hỏi, thực hành và chuyển hóa kiến thức thành kết quả!</p>'+
        '</div>'+
        '<div class="character"><div class="avatar">'+v.avatar+'</div><div class="character-caption">CÙNG HỌC<br>CÙNG BỨT PHÁ!</div></div>'+
      '</div>'+
    '</div>'+
    '<div class="deadline-band">'+
      '<div class="date-icon">'+v.dateIcon+'</div>'+
      '<div class="deadline-copy"><small>THỜI GIAN</small><strong>'+esc(ms.thoigian)+'</strong><span>'+esc(ms.hanxn)+'</span></div>'+
      '<div class="qr">'+(ms.qr ? '<img class="fake-qr" src="'+ms.qr+'" alt="QR">' : '<div class="fake-qr">☎</div>')+'<b>'+(ms.qr ? 'QUÉT MÃ QR' : 'LIÊN HỆ')+'</b><small>'+esc(ms.qr ? (ms.qrLabel || 'Tham gia trực tuyến') : ms.lienhe)+'</small></div>'+
    '</div>'+
    '<div class="info-grid">'+
      '<div class="info"><div class="info-icon">🖥️</div><div><small>HÌNH THỨC / ĐỊA ĐIỂM</small><b>'+esc(ms.hinhthuc)+'</b></div></div>'+
      '<div class="info"><div class="info-icon">🎯</div><div><small>NỘI DUNG</small><b>'+esc(ms.noidung)+'</b></div></div>'+
      '<div class="info"><div class="info-icon">👤</div><div><small>GIẢNG VIÊN / ĐƠN VỊ</small><b>'+esc(ms.giangvien)+'</b></div></div>'+
    '</div>'+
    '<div class="footer-cta"><div class="chat-icon">💬</div><div><strong>Hẹn gặp Anh/Chị tại chương trình!</strong><p>Vui lòng xác nhận tham dự trước '+esc(ms.hanxn)+'. Liên hệ: '+esc(ms.lienhe)+'.</p></div><span class="spark">✦</span></div>'+
    '<div class="poster-foot"><span>HỌC ĐỂ ỨNG DỤNG · ỨNG DỤNG ĐỂ TĂNG TRƯỞNG</span><span>ĐÀO TẠO KINH DOANH</span></div>'+
  '</section>';
}
var h2cP = null;
function loadHtml2Canvas(){
  if (window.html2canvas) return Promise.resolve(window.html2canvas);
  if (h2cP) return h2cP;
  h2cP = new Promise(function(res, rej){ var sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'; sc.onload = function(){ res(window.html2canvas); }; sc.onerror = function(){ h2cP = null; rej(new Error('h2c')); }; document.head.appendChild(sc); });
  return h2cP;
}
function posterFrame(bodyHtml){
  return new Promise(function(resolve, reject){
    var ifr = document.createElement('iframe');
    ifr.style.cssText = 'position:fixed;left:-99999px;top:0;width:720px;height:10px;border:0';
    ifr.setAttribute('aria-hidden', 'true');
    var done = false;
    ifr.onload = function(){ done = true; resolve(ifr); };
    document.body.appendChild(ifr);
    try { ifr.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><style>'+POSTER_CSS+'</style></head><body>'+bodyHtml+'</body></html>'; }
    catch(e){ reject(e); return; }
    setTimeout(function(){ if (!done) resolve(ifr); }, 1500);
  });
}
// Trả về Promise<HTMLCanvasElement> ảnh minh hoạ (poster) đã điền thông tin, độ nét x2
async function renderPosterCanvas(variant, ms){
  var H2C = await loadHtml2Canvas();
  var ifr = await posterFrame(posterBody(variant, ms));
  try {
    var body = ifr.contentDocument.body, h = Math.max(body.scrollHeight, 400);
    ifr.style.height = h + 'px';
    return await H2C(body, { backgroundColor:'#ffffff', scale:2, width:720, windowWidth:720, useCORS:true });
  } finally { if (ifr.parentNode) ifr.parentNode.removeChild(ifr); }
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
  '.nt-fields{margin-top:12px;border:1px solid #cfe3fb;background:#F6FAFF;border-radius:14px;padding:12px 14px}'+
  '.nt-fields h4{margin:0 0 8px;font-size:13px;color:var(--k)}'+
  '.nt-fields .fr{display:grid;grid-template-columns:1fr 1fr;gap:8px 10px}@media(max-width:560px){.nt-fields .fr{grid-template-columns:1fr}}'+
  '.nt-fields .ff{display:block}.nt-fields .ff.w{grid-column:1/-1}'+
  '.nt-fields label{display:block;font-size:12px;font-weight:700;color:var(--m);margin:0 0 4px}'+
  '.nt-fields input,.nt-fields select,.nt-fields textarea{width:100%;border:1.5px solid var(--l);border-radius:10px;padding:8px 10px;font:inherit;font-size:13.5px;background:#fff;color:var(--k)}'+
  '.nt-fields textarea{min-height:64px;resize:vertical}'+
  '.nt-req{color:#B3261E}'+
  '.nt-imgbox{margin-top:12px;border:1px solid var(--l);border-radius:12px;padding:8px 10px;background:#fff;text-align:center}.nt-imgbox small{display:block;text-align:left;font-weight:700;color:var(--m)}.nt-imgbox img{max-width:100%;display:block;margin:8px auto 2px;border-radius:8px;box-shadow:0 6px 20px rgba(16,46,91,.15)}'+
  '.nt-msg{font-size:13px;margin-top:8px;padding:8px 12px;border-radius:10px}.nt-msg.ok{background:#DDF1E6;color:#17794A}.nt-msg.er{background:#FBE3E0;color:#B3261E}';
  document.head.appendChild(s);
}
function mount(root, cfg){
  css();
  var all = cfg.recipients || [];
  var origin = cfg.origin || location.origin, ex = cfg.exam || {};
  var S = { tpl:'remind', text:'', subj:'', subjEdited:false, vars:{}, channel:'zalo', filter:'todo', q:'', sel:{}, sent:{}, err:{} };
  var LS = 'ktNotifyTpl';
  function myList(){ try { var a = JSON.parse(localStorage.getItem(LS) || '[]'); return Array.isArray(a) ? a : []; } catch(e){ return []; } }
  function myPut(a){ try { localStorage.setItem(LS, JSON.stringify(a.slice(0, 30))); return true; } catch(e){ return false; } }
  function myTpl(m){
    var b = TEMPLATES.filter(function(t){ return t.id === m.base; })[0] || TEMPLATES[0];
    return { id:'my:' + m.id, group:'Mẫu của tôi', name:m.name, filter:b.filter, kind:b.kind, allAudience:b.allAudience, fields:b.fields, cta:b.cta, subject:m.subject, text:m.text, vars:m.vars || {}, base:b.id, mine:true };
  }
  function allTpl(){ return TEMPLATES.concat(myList().map(myTpl)); }
  function tplOf(id){ return allTpl().filter(function(t){ return t.id === id; })[0] || TEMPLATES[0]; }
  function baseId(){ var t = tplOf(S.tpl); return t.base || t.id; }
  function fieldsOf(){ return tplOf(S.tpl).fields || []; }
  function optionalKeys(){ var t = tplOf(S.tpl), b = baseId(); return (t.fields || []).filter(function(f){ return !f.req && !f.keep; }).map(function(f){ return f.k; }).concat(b === 'inviteTrain' || b === 'inviteCustom' ? ['thoi_gian'] : []).concat(b === 'inviteTest' ? ['mo_tuy','han_tuy'] : []); }
  function setTpl(id){
    var t = tplOf(id); S.tpl = id; S.text = t.text; S.subj = t.subject; S.subjEdited = false; S.filter = t.filter; S.vars = {};
    (t.fields || []).forEach(function(f){ if (f.def) S.vars[f.k] = f.def; });
    Object.keys(t.vars || {}).forEach(function(k){ S.vars[k] = t.vars[k]; });
    selVisible();
  }
  function pool(){ var t = tplOf(S.tpl); return t.allAudience ? all : all.filter(function(r){ return r.eligible !== false; }); }
  function visible(){
    var q = S.q.trim().toLowerCase();
    return pool().filter(function(r){
      if (S.filter === 'todo' && r.status === 'done') return false;
      if (S.filter === 'done' && r.status !== 'done') return false;
      if (S.filter === 'nophone' && r.phone) return false;
      return !q || (r.name + ' ' + r.code + ' ' + (r.phone || '') + ' ' + (r.manager || '')).toLowerCase().indexOf(q) >= 0;
    });
  }
  function selVisible(){ S.sel = {}; visible().forEach(function(r){ S.sel[r.code] = true; }); }
  function xvars(){ return eventVars(S.vars, baseId()); }
  function msgFor(r){ return render(S.text, r, ex, origin, xvars(), optionalKeys()); }
  function posterVariantIdx(){ // -1 = không dùng mẫu minh hoạ; 0..9 = chỉ số mẫu
    if (baseId() !== 'inviteTrain') return -1;
    var m = /(\d+)/.exec(String(S.vars.kieu_mau || ''));
    return m ? (parseInt(m[1], 10) - 1) : -1;
  }
  async function posterMsFor(r){
    var ev = xvars(), noi = String(ev.noi_dung || '').trim(), sub = (noi.split(/[\n,.;]/)[0] || '').trim().slice(0, 70);
    var cta = ctaFor(r), qr = cta ? await qrDataUrl(cta.url) : null;
    return {
      brand:'KAROFI | LIVOTEC', brandSub:'ĐÀO TẠO KINH DOANH',
      name: r.name || r.code, title: ev.ten_khoa || 'CHƯƠNG TRÌNH ĐÀO TẠO',
      subpill: sub || 'Nâng cao năng lực · Áp dụng ngay vào công việc',
      thoigian: ev.thoi_gian || 'Theo thông báo của Ban Tổ chức',
      hanxn: 'Xác nhận trước: ' + (ev.han_xn || 'theo thông báo của Ban Tổ chức'),
      lienhe: ev.lien_he || 'Ban Tổ chức',
      hinhthuc: [ev.hinh_thuc, ev.dia_diem].filter(function(x){ return x; }).join(' · ') || 'Theo thông báo',
      noidung: ev.noi_dung || '', giangvien: ev.giang_vien || 'Ban Tổ chức',
      qr: qr, qrLabel: cta ? cta.label : ''
    };
  }
  async function posterCanvasFor(r){ var idx = posterVariantIdx(); return renderPosterCanvas(POSTER_STYLES[idx] || POSTER_STYLES[0], await posterMsFor(r)); }
  function pngOf(r){ var idx = posterVariantIdx(); if (idx >= 0) return posterCanvasFor(r).then(function(c){ return renderPng({ canvas:c }); }); return renderPng({ text: msgFor(r), kind: tplOf(S.tpl).kind || '', cta: ctaFor(r) }); }
  function pdfItemFor(r){ var idx = posterVariantIdx(); if (idx >= 0) return posterCanvasFor(r).then(function(c){ return { canvas:c }; }); return Promise.resolve({ text: msgFor(r), kind: tplOf(S.tpl).kind || '', cta: ctaFor(r) }); }
  function subjFor(r){ return render(S.subj, r || {}, ex, origin, xvars(), []); }
  function missing(){
    return fieldsOf().filter(function(f){ return f.req && !String(S.vars[f.k] || '').trim(); }).map(function(f){ return f.label; });
  }
  function ctaFor(r){
    var t = tplOf(S.tpl);
    if (t.cta === 'test') return { label:'Làm bài kiểm tra', url: render('{link}', r, ex, origin, {}, []) };
    if (t.cta === 'custom' && /^https?:\/\//i.test(String(S.vars.lien_ket || '').trim())) return { label: String(S.vars.nut || '').trim() || 'Mở liên kết', url: String(S.vars.lien_ket).trim() };
    if (t.cta === 'train' && /^https?:\/\//i.test(String(S.vars.dia_diem || '').trim())) return { label:'Tham gia trực tuyến', url: String(S.vars.dia_diem).trim() };
    return null;
  }
  function count(f){ return pool().filter(function(r){ return f === 'all' ? true : f === 'todo' ? r.status !== 'done' : f === 'done' ? r.status === 'done' : !r.phone; }).length; }
  function fieldsHtml(){
    var fl = fieldsOf(); if (!fl.length) return '';
    var t = tplOf(S.tpl);
    return '<div class="nt-fields"><h4>'+((t.base || t.id) === 'inviteTrain' ? 'Thông tin buổi đào tạo' : (t.base || t.id) === 'inviteCustom' ? 'Nội dung thư mời' : 'Thông tin thêm cho thư mời')+'</h4><div class="fr">'+fl.map(function(f){
      var v = S.vars[f.k] || '', id = 'ntF_'+f.k, ctl;
      if (f.type === 'select') ctl = '<select id="'+id+'" data-fk="'+f.k+'">'+f.opts.map(function(o){ return '<option'+(o===v?' selected':'')+'>'+esc(o)+'</option>'; }).join('')+'</select>';
      else if (f.type === 'textarea') ctl = '<textarea id="'+id+'" data-fk="'+f.k+'" placeholder="'+esc(f.ph||'')+'">'+esc(v)+'</textarea>';
      else ctl = '<input id="'+id+'" data-fk="'+f.k+'" type="'+(f.type||'text')+'" value="'+esc(v)+'" placeholder="'+esc(f.ph||'')+'"'+(f.max?' maxlength="'+f.max+'"':'')+'>';
      return '<div class="ff'+(f.w?' w':'')+'"><label for="'+id+'">'+esc(f.label)+(f.req?' <span class="nt-req">*</span>':'')+'</label>'+ctl+'</div>';
    }).join('')+'</div></div>';
  }
  function draw(){
    var vis = visible(), first = vis.filter(function(r){ return S.sel[r.code]; })[0] || vis[0];
    var nsel = vis.filter(function(r){ return S.sel[r.code]; }).length;
    var nmail = vis.filter(function(r){ return S.sel[r.code] && r.email; }).length;
    var t = tplOf(S.tpl), groups = {};
    allTpl().forEach(function(x){ (groups[x.group] = groups[x.group] || []).push(x); });
    var chips = VARS.concat((t.fields || []).map(function(f){ return [f.k, f.label.replace(/ \(.*\)$/,'')]; }));
    var mi = missing();
    root.innerHTML = '<div class="nt"><div class="nt-grid">'+
      '<div class="nt-box"><label class="nl" for="ntTpl">Mẫu</label><select id="ntTpl">'+Object.keys(groups).map(function(g){ return '<optgroup label="'+esc(g)+'">'+groups[g].map(function(x){ return '<option value="'+x.id+'"'+(x.id===S.tpl?' selected':'')+'>'+esc(x.name)+'</option>'; }).join('')+'</optgroup>'; }).join('')+'</select>'+
      fieldsHtml()+
      '<label class="nl" for="ntText">Nội dung</label><textarea id="ntText">'+esc(S.text)+'</textarea>'+
      '<div class="nt-chips" style="margin-bottom:2px"><button type="button" class="nt-chip" id="ntSave" title="Lưu nội dung và thông tin đang nhập thành mẫu dùng lại (lưu trong trình duyệt này)">+ Lưu thành mẫu của tôi</button>'+(t.mine ? '<button type="button" class="nt-chip" id="ntDel" style="background:#FBE3E0;color:#B3261E">Xoá mẫu này</button>' : '')+'</div>'+
      '<div class="nt-chips" aria-label="Chèn thông tin tự động">'+chips.map(function(v){ return '<button type="button" class="nt-chip" data-v="'+v[0]+'" title="Chèn {'+v[0]+'}">'+esc(v[1])+'</button>'; }).join('')+'</div>'+
      '<label class="nl">Kênh gửi</label><div class="nt-seg">'+CHANNELS.map(function(c){ return '<button type="button" data-ch="'+c[0]+'" class="'+(c[0]===S.channel?'on':'')+'">'+c[1]+'</button>'; }).join('')+'</div>'+
      (S.channel === 'email' ? '<label class="nl" for="ntSubj">Tiêu đề email</label><input type="text" id="ntSubj" value="'+esc(subjFor(first))+'">' : '')+
      '<div class="nt-prev" id="ntPrev"></div>'+((S.channel==='png'||S.channel==='pdf') ? '<div class="nt-imgbox"><small>Ảnh sẽ xuất</small><img id="ntImg" alt="Xem trước ảnh thư mời"></div>' : '')+
      '<p class="nt-hint" style="margin:10px 0 0">'+(S.channel==='png' ? 'Xuất thư thành ảnh PNG để gửi qua Zalo, Messenger hoặc in. Mỗi người một ảnh có ghi sẵn tên. Bấm “Sao chép” rồi dán thẳng vào khung chat, hoặc “Tải ảnh” để lưu.' : S.channel==='pdf' ? 'Xuất thư mời thành file PDF (khổ A4) để in hoặc gửi đính kèm. Bấm “Tải PDF” ở từng người, hoặc “Tải PDF gộp” để tải một file nhiều trang cho tất cả người đã chọn.' : S.channel==='zalo' ? 'Bấm “Mở Zalo” ở từng người: nội dung được sao chép sẵn, bạn chỉ cần dán (Cmd/Ctrl+V) rồi gửi.' : S.channel==='sms' ? 'Bấm “Soạn SMS” ở từng người: ứng dụng tin nhắn mở sẵn với nội dung và số điện thoại.' : (t.kind === 'invite' ? 'Hệ thống gửi email thư mời có khung riêng'+(t.cta ? ' và nút bấm' : '')+' tới email đã lưu của những người được chọn.' : 'Hệ thống gửi email trực tiếp tới email đã lưu của những người được chọn.'))+((S.channel==='png'||S.channel==='pdf') && posterVariantIdx() >= 0 ? ' Đang dùng mẫu minh hoạ (poster) đã chọn ở trên — mỗi người một ảnh/PDF riêng, tự điền tên và thông tin khoá học.' : '')+((S.channel==='png'||S.channel==='pdf') && posterVariantIdx() < 0 && t.cta && first && ctaFor(first) ? ' Có đường link nên hệ thống tự sinh mã QR thật của link đó để quét trực tiếp.' : '')+'</p></div>'+
      '<div class="nt-box"><div class="nt-bar">'+
        [['todo','Chưa làm'],['done','Đã làm'],['all','Tất cả'],['nophone','Thiếu SĐT']].map(function(f){ return '<button type="button" class="nt-f'+(S.filter===f[0]?' on':'')+'" data-f="'+f[0]+'">'+f[1]+' ('+count(f[0])+')</button>'; }).join('')+
        '<input type="search" id="ntQ" placeholder="Tìm tên, mã NV, SĐT…" value="'+esc(S.q)+'"></div>'+
      '<label style="display:flex;gap:8px;align-items:center;font-size:13px;font-weight:700;margin:0 0 8px"><input type="checkbox" id="ntAll"'+(vis.length && nsel === vis.length ? ' checked' : '')+'> Chọn tất cả ('+nsel+'/'+vis.length+')</label>'+
      '<div class="nt-rows">'+(vis.length ? vis.map(function(r){ return rowHtml(r); }).join('') : '<div style="padding:18px;text-align:center" class="nt-hint">Không có ai trong bộ lọc này.</div>')+'</div>'+
      '<div class="nt-foot">'+(S.channel==='email' ? '<button type="button" class="nt-go" id="ntSend"'+(nmail?'':' disabled')+'>Gửi email cho '+nmail+' người</button>'+(nmail < nsel ? '<span class="nt-hint">'+(nsel-nmail)+' người đã chọn chưa có email nên sẽ bị bỏ qua.</span>' : '') : (S.channel==='png' ? '<button type="button" class="nt-go" id="ntZip"'+(nsel?'':' disabled')+'>Tải '+nsel+' ảnh (.zip)</button>' : (S.channel==='pdf' ? '<button type="button" class="nt-go" id="ntPdfAll"'+(nsel?'':' disabled')+'>Tải PDF gộp ('+nsel+' trang)</button>' : '<span class="nt-hint">Bấm nút ở từng dòng để gửi. Dòng đã mở sẽ được tô xanh.</span>')))+'</div><div id="ntRes"></div></div>'+
    '</div></div>';
    if (window.KTDt24) window.KTDt24.upgrade(root);
    refresh();
    wire();
  }
  function rowHtml(r){
    var act = '';
    if (S.channel === 'zalo') act = '<button type="button" class="nt-act'+(r.phone?'':' dis')+'" data-zalo="'+esc(r.code)+'">'+(S.sent[r.code]?'Mở lại Zalo':'Mở Zalo')+'</button>';
    else if (S.channel === 'sms') act = '<a class="nt-act'+(r.phone?'':' dis')+'" data-sms="'+esc(r.code)+'" href="'+(r.phone ? 'sms:'+r.phone+'?&body='+encodeURIComponent(msgFor(r)) : '#')+'">Soạn SMS</a>';
    else act = S.err[r.code] ? '<span class="nt-st er">'+esc(S.err[r.code])+'</span>' : (S.sent[r.code] ? '<span class="nt-st ok">Đã gửi</span>' : (r.email ? '' : '<span class="nt-no">Chưa có email</span>'));
    var contact = S.channel === 'email' ? (r.email || '') : (r.phone || '');
    if (S.channel === 'png') act = '<button type="button" class="nt-act" data-png="'+esc(r.code)+'">Tải ảnh</button> <button type="button" class="nt-act" data-pngcopy="'+esc(r.code)+'">Sao chép</button>';
    if (S.channel === 'pdf') act = '<button type="button" class="nt-act" data-pdf="'+esc(r.code)+'">Tải PDF</button>';
    return '<div class="nt-row'+(S.sent[r.code]?' sent':'')+'"><input type="checkbox" data-sel="'+esc(r.code)+'"'+(S.sel[r.code]?' checked':'')+' aria-label="Chọn '+esc(r.name||r.code)+'"><div><b>'+esc(r.name||r.code)+'</b><small>'+esc(r.code)+(r.manager?' · '+esc(r.manager):'')+((S.channel==='png'||S.channel==='pdf') ? '' : ' · '+(contact ? esc(contact) : '<span class="nt-no">'+(S.channel==='email'?'Chưa có email':'Chưa có SĐT')+'</span>'))+' · '+(r.status==='done'?'Đã làm':'Chưa làm')+'</small></div><div>'+act+'</div></div>';
  }
  function byCode(code){ return all.filter(function(r){ return r.code === code; })[0]; }
  function copy(t){ return (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t) : Promise.reject()).catch(function(){ window.prompt('Sao chép nội dung:', t); }); }
  function warn(){ var m = missing(); if (!m.length) return false; var r = root.querySelector('#ntRes'); if (r) r.innerHTML = '<div class="nt-msg er">Vui lòng nhập: '+esc(m.join(', '))+'.</div>'; return true; }
  function wire(){
    var q = function(s){ return root.querySelector(s); }, qa = function(s){ return [].slice.call(root.querySelectorAll(s)); };
    q('#ntTpl').addEventListener('change', function(e){ setTpl(e.target.value); draw(); });
    q('#ntText').addEventListener('input', function(e){ S.text = e.target.value; refresh(); });
    qa('[data-fk]').forEach(function(el){ var h = function(){ S.vars[el.dataset.fk] = el.value; refresh(); }; el.addEventListener('input', h); el.addEventListener('change', h); });
    qa('.nt-chip').forEach(function(b){ b.addEventListener('click', function(){ var t = q('#ntText'), v = '{'+b.dataset.v+'}', a = t.selectionStart || t.value.length, z = t.selectionEnd || a; t.value = t.value.slice(0,a)+v+t.value.slice(z); S.text = t.value; t.focus(); t.selectionStart = t.selectionEnd = a+v.length; refresh(); }); });
    qa('[data-ch]').forEach(function(b){ b.addEventListener('click', function(){ S.channel = b.dataset.ch; draw(); }); });
    qa('[data-f]').forEach(function(b){ b.addEventListener('click', function(){ S.filter = b.dataset.f; selVisible(); draw(); }); });
    q('#ntQ').addEventListener('input', function(e){ S.q = e.target.value; selVisible(); var pos = e.target.selectionStart; draw(); var n = q('#ntQ'); n.focus(); try { n.setSelectionRange(pos,pos); } catch(_){} });
    q('#ntAll').addEventListener('change', function(e){ S.sel = {}; if (e.target.checked) visible().forEach(function(r){ S.sel[r.code] = true; }); draw(); });
    qa('[data-sel]').forEach(function(c){ c.addEventListener('change', function(){ if (c.checked) S.sel[c.dataset.sel] = true; else delete S.sel[c.dataset.sel]; draw(); }); });
    var sj = q('#ntSubj'); if (sj) sj.addEventListener('input', function(){ S.subjEdited = true; });
    q('#ntSave').addEventListener('click', function(){
      var cur = tplOf(S.tpl), def = cur.mine ? cur.name : cur.name + ' (của tôi)';
      var name = window.prompt('Đặt tên cho mẫu của bạn:', def); if (name === null) return; name = name.trim().slice(0, 60); if (!name) return;
      var list = myList(), id = 'm' + Date.now().toString(36), at = cur.mine ? list.map(function(m){ return 'my:' + m.id; }).indexOf(cur.id) : -1;
      var rec = { id: at >= 0 && list[at].name === name ? list[at].id : id, name: name, base: baseId(), text: S.text, subject: S.subj, vars: JSON.parse(JSON.stringify(S.vars)) };
      var i = list.map(function(m){ return m.id; }).indexOf(rec.id); if (i >= 0) list[i] = rec; else list.unshift(rec);
      if (!myPut(list)){ q('#ntRes').innerHTML = '<div class="nt-msg er">Trình duyệt không cho lưu mẫu (đang ở chế độ riêng tư?).</div>'; return; }
      var keepVars = S.vars, keepText = S.text, keepSubj = S.subj; S.tpl = 'my:' + rec.id; S.vars = keepVars; S.text = keepText; S.subj = keepSubj; draw();
      q('#ntRes').innerHTML = '<div class="nt-msg ok">Đã lưu mẫu “' + esc(name) + '”. Mẫu nằm trong nhóm Mẫu của tôi (chỉ dùng được trên trình duyệt này).</div>';
    });
    var dl = q('#ntDel');
    if (dl) dl.addEventListener('click', function(){
      var cur = tplOf(S.tpl); if (!window.confirm('Xoá mẫu “' + cur.name + '”?')) return;
      myPut(myList().filter(function(m){ return 'my:' + m.id !== cur.id; })); setTpl(cur.base || 'remind'); draw();
    });
    qa('[data-zalo]').forEach(function(b){ b.addEventListener('click', function(){ if (warn()) return; var r = byCode(b.dataset.zalo); if (!r || !r.phone) return; copy(msgFor(r)).then(function(){ S.sent[r.code] = true; window.open('https://zalo.me/'+r.phone, '_blank', 'noopener'); var row = b.closest('.nt-row'); if (row) row.classList.add('sent'); b.textContent = 'Mở lại Zalo'; }); }); });
    qa('[data-sms]').forEach(function(a){ a.addEventListener('click', function(e){ if (warn()){ e.preventDefault(); return; } S.sent[a.dataset.sms] = true; var row = a.closest('.nt-row'); if (row) row.classList.add('sent'); }); });
    function fname(r){ return slug(r.code + '-' + (r.name || '')) + '.png'; }
    function mark(r, el){ S.sent[r.code] = true; var row = el.closest('.nt-row'); if (row) row.classList.add('sent'); }
    qa('[data-png]').forEach(function(b){ b.addEventListener('click', async function(){
      if (warn()) return; var r = byCode(b.dataset.png); if (!r) return;
      var t0 = b.textContent; b.disabled = true; b.textContent = 'Đang tạo…';
      try { saveBlob(await pngOf(r), fname(r)); mark(r, b); } catch(e){ q('#ntRes').innerHTML = '<div class="nt-msg er">Không tạo được ảnh, thử lại.</div>'; }
      b.disabled = false; b.textContent = t0;
    }); });
    qa('[data-pngcopy]').forEach(function(b){ b.addEventListener('click', async function(){
      if (warn()) return; var r = byCode(b.dataset.pngcopy); if (!r) return;
      var t0 = b.textContent; b.disabled = true; b.textContent = 'Đang tạo…';
      try {
        var blob = await pngOf(r);
        if (navigator.clipboard && window.ClipboardItem){ await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); b.textContent = 'Đã sao chép'; mark(r, b); setTimeout(function(){ b.textContent = t0; b.disabled = false; }, 1600); return; }
        saveBlob(blob, fname(r)); q('#ntRes').innerHTML = '<div class="nt-msg ok">Trình duyệt không cho sao chép ảnh nên ảnh đã được tải về.</div>'; mark(r, b);
      } catch(e){ q('#ntRes').innerHTML = '<div class="nt-msg er">Không sao chép được ảnh. Hãy dùng “Tải ảnh”.</div>'; }
      b.disabled = false; b.textContent = t0;
    }); });
    var zip = q('#ntZip');
    if (zip) zip.addEventListener('click', async function(){
      if (warn()) return;
      var rows = visible().filter(function(r){ return S.sel[r.code]; }).slice(0, 300);
      if (!rows.length) return;
      var t0 = zip.textContent; zip.disabled = true; q('#ntRes').innerHTML = '';
      try {
        var Z = await loadZip(), z = new Z();
        for (var i = 0; i < rows.length; i++){ zip.textContent = 'Đang tạo ' + (i + 1) + '/' + rows.length + '…'; z.file(fname(rows[i]), await pngOf(rows[i])); mark(rows[i], zip); }
        saveBlob(await z.generateAsync({ type:'blob' }), 'thu-moi-' + slug(tplOf(S.tpl).name) + '.zip');
        q('#ntRes').innerHTML = '<div class="nt-msg ok">Đã tạo ' + rows.length + ' ảnh.</div>';
      } catch(e){ q('#ntRes').innerHTML = '<div class="nt-msg er">Không tạo được file zip (cần kết nối mạng để tải thư viện nén). Bạn có thể dùng “Tải ảnh” cho từng người.</div>'; }
      zip.disabled = false; zip.textContent = t0; draw();
    });
    qa('[data-pdf]').forEach(function(b){ b.addEventListener('click', async function(){
      if (warn()) return; var r = byCode(b.dataset.pdf); if (!r) return;
      var t0 = b.textContent; b.disabled = true; b.textContent = 'Đang tạo…';
      try { saveBlob(await renderPdf([await pdfItemFor(r)]), fnamePdf(r)); mark(r, b); } catch(e){ q('#ntRes').innerHTML = '<div class="nt-msg er">Không tạo được PDF (cần kết nối mạng để tải thư viện), thử lại.</div>'; }
      b.disabled = false; b.textContent = t0;
    }); });
    var pdfAll = q('#ntPdfAll');
    if (pdfAll) pdfAll.addEventListener('click', async function(){
      if (warn()) return;
      var rows = visible().filter(function(r){ return S.sel[r.code]; }).slice(0, 300);
      if (!rows.length) return;
      var t0 = pdfAll.textContent; pdfAll.disabled = true; q('#ntRes').innerHTML = '';
      try {
        var items = [];
        for (var pi = 0; pi < rows.length; pi++){ pdfAll.textContent = 'Đang tạo ' + (pi + 1) + '/' + rows.length + '…'; items.push(await pdfItemFor(rows[pi])); }
        var blob = await renderPdf(items);
        rows.forEach(function(r){ S.sent[r.code] = true; });
        saveBlob(blob, 'thu-moi-' + slug(tplOf(S.tpl).name) + '.pdf');
        q('#ntRes').innerHTML = '<div class="nt-msg ok">Đã tạo PDF gồm ' + rows.length + ' trang.</div>';
      } catch(e){ q('#ntRes').innerHTML = '<div class="nt-msg er">Không tạo được file PDF (cần kết nối mạng để tải thư viện). Bạn có thể tải từng PDF.</div>'; }
      pdfAll.disabled = false; pdfAll.textContent = t0; draw();
    });
    var send = q('#ntSend');
    if (send) send.addEventListener('click', async function(){
      if (warn()) return;
      var rows = visible().filter(function(r){ return S.sel[r.code] && r.email; });
      if (!rows.length){ q('#ntRes').innerHTML = '<div class="nt-msg er">Chưa chọn ai có email.</div>'; return; }
      var subj = (q('#ntSubj') || {}).value || '';
      if (!subj.trim()){ q('#ntRes').innerHTML = '<div class="nt-msg er">Nhập tiêu đề email.</div>'; return; }
      if (!confirm('Gửi email cho ' + rows.length + ' người đã chọn?')) return;
      send.disabled = true; send.textContent = 'Đang gửi…'; q('#ntRes').innerHTML = '';
      var j = null, kind = tplOf(S.tpl).kind || '';
      try { j = await cfg.sendEmail(rows.map(function(r){ var it = { code:r.code, text: msgFor(r) }, c = ctaFor(r); if (c) it.cta = c; return it; }), subj, kind); } catch(e){ j = null; }
      var bad = {}; ((j && j.failed) || []).forEach(function(f){ bad[f.code] = f.error || 'Lỗi'; });
      ((j && j.skipped) || []).forEach(function(f){ bad[f.code] = f.reason || 'Bỏ qua'; });
      rows.forEach(function(r){ if (bad[r.code]) S.err[r.code] = bad[r.code]; else if (j && (j.ok || j.sent)) { S.sent[r.code] = true; delete S.err[r.code]; } });
      draw();
      q('#ntRes').innerHTML = j ? '<div class="nt-msg '+(j.ok && !(j.failed||[]).length ? 'ok' : 'er')+'">'+(j.error ? esc(j.error) : 'Đã gửi '+(j.sent||0)+' email'+((j.failed||[]).length ? ', lỗi '+j.failed.length : '')+((j.skipped||[]).length ? ', bỏ qua '+j.skipped.length : '')+'.')+'</div>' : '<div class="nt-msg er">Không kết nối được máy chủ, thử lại sau.</div>';
    });
  }
  function refresh(){ // cập nhật xem trước, tiêu đề email và liên kết SMS khi đang gõ, không vẽ lại cả khung (giữ con trỏ)
    var vis = visible(), first = vis.filter(function(r){ return S.sel[r.code]; })[0] || vis[0], mi = missing();
    var p = root.querySelector('#ntPrev');
    if (p) p.innerHTML = '<small>Xem trước'+(first ? ' (cho '+esc(first.name||first.code)+')' : '')+'</small>'+(first ? esc(msgFor(first)) : 'Chưa có người nhận trong danh sách.')+(mi.length ? '<span class="nt-req" style="display:block;margin-top:6px;font-weight:700">Cần nhập: '+esc(mi.join(', '))+'</span>' : '');
    var sj = root.querySelector('#ntSubj'); if (sj && !S.subjEdited) sj.value = subjFor(first);
    var im = root.querySelector('#ntImg');
    if (im && first){ clearTimeout(S.pt); var snap = S.text + JSON.stringify(S.vars) + first.code; S.pt = setTimeout(async function(){
      try { var blob = await pngOf(first); if (im.isConnected){ if (im.dataset.u) URL.revokeObjectURL(im.dataset.u); im.dataset.u = URL.createObjectURL(blob); im.src = im.dataset.u; } } catch(e){}
    }, 350); }
    [].forEach.call(root.querySelectorAll('[data-sms]'), function(a){ var r = byCode(a.dataset.sms); if (r && r.phone) a.href = 'sms:'+r.phone+'?&body='+encodeURIComponent(msgFor(r)); });
  }
  setTpl('remind'); draw();
}
window.KTNotify = { mount: mount, _paint: paintLetter };
})();
