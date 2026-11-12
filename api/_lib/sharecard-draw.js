// TỰ SINH bởi dev/sync-sharecard.js từ khối <share-card> của kiemtra/index.html. KHÔNG sửa tay (sửa ở index.html rồi chạy lại script).
// MK() trả về một context 2D rỗng dùng để đo chữ.
module.exports = function (MK) {
  function scoreTierClass(pct){
    var p = Number(pct) || 0;
    if (p < 60) return 'sc-red';
    if (p < 70) return 'sc-yellow';
    if (p < 90) return 'sc-blue';
    return 'sc-green';
  }

// ẢNH KẾT QUẢ (mẫu thiết kế mới): nền xanh dương sáng + cúp vàng, vòng điểm xanh lá, khung trắng chỉ số + mã QR xác thực.
// Chiều cao tự tính theo nội dung (tên đề / tên người dài, có hay không có điểm tuân thủ, mã QR).
var SC = { W:1080, M:28, PAD:60, F:'"Be Vietnam Pro","Segoe UI",Roboto,Arial,sans-serif', BG:'#0A4DB0', INK:'#0A2552', MUTED:'#5A6E90', BRAND:'#0A63C4', DEEP:'#0B3F94', LINE:'#D7E3F4' };
function scWrap(ctx, text, font, maxW, maxLines){
  ctx.font = font; var words = String(text||'').split(/\s+/), lines = [], cur = '';
  words.forEach(function(w){ var t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur){ lines.push(cur); cur = w; } else cur = t; });
  if (cur) lines.push(cur);
  if (lines.length > maxLines){ lines = lines.slice(0, maxLines); var l = lines[maxLines-1]; while (l && ctx.measureText(l + '…').width > maxW) l = l.replace(/\s*\S*$/, ''); lines[maxLines-1] = l + '…'; }
  return lines;
}
// Bố cục: tính trước mọi vị trí để chiều cao ảnh khớp nội dung
function scLayout(d){
  var c = MK(), W = SC.W, cx = SC.M, cw = W - 2*SC.M, P = cx + SC.PAD, R = cx + cw - SC.PAD;
  var L = { cx:cx, cy:SC.M, cw:cw, P:P, R:R };
  L.trophyX = cx + cw - 262; L.trophyB = L.cy + 332;                       // vùng chiếc cúp (góc phải trên): chữ không được đè lên
  L.titleLines = scWrap(c, d.title, '700 32px ' + SC.F, L.trophyX - P - 8, 2);
  L.pillY = L.cy + 134 + (L.titleLines.length - 1) * 44 + 30;
  L.ringR = 130; L.ringW = 26; L.ringO = L.ringR + L.ringW / 2;
  L.ringCX = cx + 54 + L.ringO; L.divX = L.ringCX + L.ringO + 24; L.nx = L.divX + 40;
  L.heroY = L.pillY + 48 + 46;
  var nameW = L.heroY > L.trophyB - 36 ? R - L.nx : L.trophyX - L.nx - 16, f = 42;
  var nl = scWrap(c, d.name, '800 42px ' + SC.F, nameW, 1);
  if (/…$/.test(nl[0] || '')){ f = 36; nl = scWrap(c, d.name, '800 36px ' + SC.F, nameW, 2); if (/…$/.test(nl[nl.length-1] || '')){ f = 30; nl = scWrap(c, d.name, '800 30px ' + SC.F, nameW, 3); } }
  L.nameFont = f; L.nameLines = nl;
  var y = f + (nl.length - 1) * (f + 8);                                    // chân chữ dòng tên cuối, tính từ đỉnh khối chữ
  if (d.code) y += 48; if (d.manager) y += 36;
  L.scoreDY = y + 76;
  L.hasBar = !!(d.wrong != null && d.blank != null && d.total);
  var textH = L.scoreDY + (L.hasBar ? 78 + 8 : 10), heroH = Math.max(2 * L.ringO + 8, textH);
  L.ringCY = L.heroY + heroH / 2; L.textTop = L.heroY + (heroH - textH) / 2;
  L.cut = L.heroY + heroH + 32;                                              // mép trên khung trắng
  L.qrS = d.qr ? 168 : 0;
  L.iconY = L.cut + 58; L.valY = L.cut + 120; L.labY = L.cut + 160; L.sepY = L.cut + 212;
  L.vpY = L.sepY + 34; L.vpH = 54; L.noteY = L.vpY + L.vpH + 38; L.linkY = L.noteY + 42;
  L.qrX = cx + cw - 44 - L.qrS; L.qrY = L.vpY - 2;
  var contentB = Math.max(L.linkY + 16, d.qr ? L.qrY + L.qrS + 8 : 0);
  L.waveTop = contentB + 24; L.cardB = L.waveTop + 96; L.H = L.cardB + SC.M;
  L.cats = [];
  return L;
}
function shareCardHeight(d){ return scLayout(d).H; }
function drawShareCard(ctx, W, H, d){
  var F = SC.F, INK = SC.INK, MUTED = SC.MUTED, L = scLayout(d), cx = L.cx, cy = L.cy, cw = L.cw, P = L.P, R = L.R, cut = L.cut, cb = L.cardB;
  function rr(x, y, w, h, r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
  function txt(t, x, y, size, weight, color, align, ls){ ctx.font = weight + ' ' + size + 'px ' + F; ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic'; if (ls && 'letterSpacing' in ctx) ctx.letterSpacing = ls + 'px'; ctx.fillText(t, x, y); if ('letterSpacing' in ctx) ctx.letterSpacing = '0px'; }
  function width(t, font, ls){ ctx.font = font; if (ls && 'letterSpacing' in ctx) ctx.letterSpacing = ls + 'px'; var w = ctx.measureText(t).width; if ('letterSpacing' in ctx) ctx.letterSpacing = '0px'; return w; }
  function lg(x0, y0, x1, y1, stops){ var g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(function(s){ g.addColorStop(s[0], s[1]); }); return g; }
  function rg(x, y, r0, r1, stops){ var g = ctx.createRadialGradient(x, y, r0, x, y, r1); stops.forEach(function(s){ g.addColorStop(s[0], s[1]); }); return g; }
  // ---- biểu tượng nét đơn giản (x, y = tâm; s = cỡ)
  function icCheck(x, y, s, col, lw){ ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(x - .42*s, y + .02*s); ctx.lineTo(x - .1*s, y + .34*s); ctx.lineTo(x + .46*s, y - .3*s); ctx.stroke(); ctx.restore(); }
  function icPerson(x, y, s, col, a){ ctx.save(); ctx.globalAlpha = a == null ? 1 : a; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y - .24*s, .2*s, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.ellipse(x, y + .5*s, .38*s, .32*s, 0, Math.PI, Math.PI*2); ctx.closePath(); ctx.fill(); ctx.restore(); }
  function icGroup(x, y, s, col){ icPerson(x - .56*s, y + .08*s, s*.78, col, .7); icPerson(x + .56*s, y + .08*s, s*.78, col, .7); icPerson(x, y, s, col, 1); }
  function icTarget(x, y, s, col){ ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineCap = 'round'; ctx.lineWidth = s*.085; ctx.beginPath(); ctx.arc(x, y, s*.42, 0, Math.PI*2); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, s*.24, 0, Math.PI*2); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, s*.07, 0, Math.PI*2); ctx.fill(); ctx.lineWidth = s*.09; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s*.5, y - s*.5); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + s*.5, y - s*.5); ctx.lineTo(x + s*.5, y - s*.27); ctx.moveTo(x + s*.5, y - s*.5); ctx.lineTo(x + s*.27, y - s*.5); ctx.stroke(); ctx.restore(); }
  function icClock(x, y, s, col){ ctx.save(); ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = s*.09; ctx.beginPath(); ctx.arc(x, y, s*.44, 0, Math.PI*2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y - s*.24); ctx.lineTo(x, y); ctx.lineTo(x + s*.2, y + s*.12); ctx.stroke(); ctx.restore(); }
  function icCal(x, y, s, col){ ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineCap = 'round'; ctx.lineWidth = s*.08; rr(x - .44*s, y - .34*s, .88*s, .8*s, .12*s); ctx.stroke(); rr(x - .44*s, y - .34*s, .88*s, .24*s, .1*s); ctx.fill(); ctx.beginPath(); ctx.moveTo(x - .22*s, y - .5*s); ctx.lineTo(x - .22*s, y - .26*s); ctx.moveTo(x + .22*s, y - .5*s); ctx.lineTo(x + .22*s, y - .26*s); ctx.stroke(); for (var i = 0; i < 3; i++) for (var j = 0; j < 2; j++){ ctx.fillRect(x - .3*s + i*.24*s, y + .02*s + j*.22*s, .13*s, .13*s); } ctx.restore(); }
  function icLink(x, y, s, col){ ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = s*.1; ctx.lineCap = 'round'; ctx.translate(x, y); ctx.rotate(-Math.PI/4); rr(-.5*s, -.17*s, .62*s, .34*s, .17*s); ctx.stroke(); rr(-.12*s, -.17*s, .62*s, .34*s, .17*s); ctx.stroke(); ctx.restore(); }
  // ---- chiếc cúp vàng (vẽ bằng nét vẽ, tâm trục x tại 0, đỉnh miệng cúp ≈ -75, chân đế ≈ +160)
  function trophy(ox, oy, k){
    ctx.save(); ctx.translate(ox, oy); ctx.scale(k, k);
    ctx.fillStyle = rg(0, 30, 0, 170, [[0, 'rgba(255,226,140,.45)'], [1, 'rgba(255,226,140,0)']]); ctx.fillRect(-190, -120, 380, 330);
    var gold = lg(-60, 0, 60, 0, [[0, '#FFEFA8'], [.35, '#F7C21F'], [.7, '#D99100'], [1, '#FFD45A']]);
    // bệ xanh
    var bg = lg(-110, 0, 110, 0, [[0, '#1E63D6'], [.5, '#59B0FF'], [1, '#0F46AE']]);
    ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(0, 158, 112, 24, 0, 0, Math.PI*2); ctx.fill(); ctx.fillRect(-112, 140, 224, 18); ctx.beginPath(); ctx.ellipse(0, 140, 112, 24, 0, 0, Math.PI*2); ctx.fillStyle = lg(-112, 0, 112, 0, [[0, '#5FB4FF'], [.5, '#A9DBFF'], [1, '#3E8CF0']]); ctx.fill();
    ctx.fillStyle = '#1550C4'; ctx.fillRect(-64, 118, 128, 16); ctx.beginPath(); ctx.ellipse(0, 118, 64, 14, 0, 0, Math.PI*2); ctx.fillStyle = lg(-64, 0, 64, 0, [[0, '#6DBBFF'], [1, '#2D79EA']]); ctx.fill();
    // chân + đế cúp
    ctx.fillStyle = gold; ctx.beginPath(); ctx.moveTo(-14, 52); ctx.lineTo(14, 52); ctx.lineTo(20, 96); ctx.lineTo(-20, 96); ctx.closePath(); ctx.fill();
    rr(-46, 94, 92, 24, 8); ctx.fill(); ctx.fillStyle = '#B97A00'; ctx.fillRect(-46, 106, 92, 3);
    // quai cầm
    ctx.lineCap = 'round'; ctx.lineWidth = 11; ctx.strokeStyle = lg(-100, 0, -50, 0, [[0, '#F3B21A'], [1, '#FFE08A']]); ctx.beginPath(); ctx.moveTo(-54, -44); ctx.bezierCurveTo(-104, -50, -102, 14, -44, 18); ctx.stroke();
    ctx.strokeStyle = lg(50, 0, 100, 0, [[0, '#FFE08A'], [1, '#E3A10E']]); ctx.beginPath(); ctx.moveTo(54, -44); ctx.bezierCurveTo(104, -50, 102, 14, 44, 18); ctx.stroke();
    // thân cúp
    ctx.fillStyle = gold; ctx.beginPath(); ctx.moveTo(-62, -60); ctx.bezierCurveTo(-66, -4, -38, 42, -14, 54); ctx.lineTo(14, 54); ctx.bezierCurveTo(38, 42, 66, -4, 62, -60); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, -60, 62, 13, 0, 0, Math.PI*2); ctx.fillStyle = '#FFE58F'; ctx.fill(); ctx.beginPath(); ctx.ellipse(0, -58, 52, 8, 0, 0, Math.PI*2); ctx.fillStyle = '#B87800'; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.38)'; ctx.beginPath(); ctx.moveTo(-46, -46); ctx.bezierCurveTo(-48, -8, -34, 22, -22, 34); ctx.lineTo(-30, 30); ctx.bezierCurveTo(-48, 10, -54, -20, -52, -44); ctx.closePath(); ctx.fill();
    // ngôi sao
    ctx.beginPath(); for (var i = 0; i < 10; i++){ var ang = -Math.PI/2 + i*Math.PI/5, rad = i % 2 ? 9 : 22; ctx.lineTo(Math.cos(ang)*rad, -14 + Math.sin(ang)*rad); } ctx.closePath(); ctx.fillStyle = '#FFF4BF'; ctx.fill(); ctx.strokeStyle = '#D79A00'; ctx.lineWidth = 2; ctx.stroke();
    // vòng nguyệt quế hai bên
    [-1, 1].forEach(function(sd){
      for (var j = 0; j < 9; j++){
        var t = j / 8, px = sd * (86 + 26*Math.sin(t*Math.PI*0.95) - 10*t), py = 118 - 150*t, ang2 = sd * (-0.9 + t*0.55);
        [[0, 1], [10, -1]].forEach(function(o){ ctx.save(); ctx.translate(px + sd*o[0]*(.9), py - o[0]*.2); ctx.rotate(ang2 + sd*o[1]*0.85); ctx.fillStyle = (j % 2 ? '#F7C948' : '#FFE08A'); ctx.beginPath(); ctx.ellipse(0, 0, 14, 6, 0, 0, Math.PI*2); ctx.fill(); ctx.restore(); });
      }
    });
    ctx.restore();
  }
  var neutral = d.passed !== true && d.passed !== false;
  var pct = Math.max(0, Math.min(100, d.pct || 0)), tier = scoreTierClass(pct);
  // ---- nền ngoài thẻ
  ctx.fillStyle = lg(0, 0, 0, H, [[0, '#0B63DB'], [.55, '#0A4FB8'], [1, '#083A92']]); ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = rg(W*.55, 0, 0, W*.95, [[0, 'rgba(86,196,255,.5)'], [1, 'rgba(86,196,255,0)']]); ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(120,190,255,.16)'; ctx.beginPath(); ctx.moveTo(0, H - 130); ctx.bezierCurveTo(W*.3, H - 40, W*.6, H - 200, W, H - 110); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
  // ---- thẻ: viền sáng + nền xanh
  ctx.save(); ctx.shadowColor = 'rgba(80,190,255,.6)'; ctx.shadowBlur = 32; rr(cx, cy, cw, cb - cy, 38); ctx.fillStyle = '#0A4EB0'; ctx.fill(); ctx.restore();
  ctx.save(); rr(cx, cy, cw, cb - cy, 38); ctx.clip();
  ctx.fillStyle = lg(cx, cy, cx + cw, cut, [[0, '#0A46A0'], [.55, '#0D5FC9'], [1, '#2A8DEF']]); ctx.fillRect(cx, cy, cw, cb - cy);
  ctx.fillStyle = rg(cx + cw - 150, cy + 200, 0, 380, [[0, 'rgba(160,220,255,.55)'], [1, 'rgba(160,220,255,0)']]); ctx.fillRect(cx, cy, cw, cut - cy);
  ctx.fillStyle = lg(cx + cw*.55, cy, cx + cw, cy + 260, [[0, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,.14)']]); ctx.beginPath(); ctx.moveTo(cx + cw*.62, cy); ctx.lineTo(cx + cw*.9, cy); ctx.lineTo(cx + cw, cy + 230); ctx.lineTo(cx + cw*.74, cy + 90); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.beginPath(); ctx.moveTo(cx + cw*.3, cut + 14); ctx.bezierCurveTo(cx + cw*.55, cut - 70, cx + cw*.78, cut - 110, cx + cw, cut - 200); ctx.lineTo(cx + cw, cut + 14); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(90,205,255,.22)'; ctx.beginPath(); ctx.moveTo(cx + cw*.5, cut + 14); ctx.bezierCurveTo(cx + cw*.7, cut - 36, cx + cw*.86, cut - 56, cx + cw, cut - 96); ctx.lineTo(cx + cw, cut + 14); ctx.closePath(); ctx.fill();
  // ---- khung trắng phía dưới (bo tròn hai góc trên)
  ctx.fillStyle = lg(0, cut, 0, cb, [[0, '#FFFFFF'], [.65, '#F1F7FF'], [1, '#D9E9FF']]);
  ctx.beginPath(); ctx.moveTo(cx, cb); ctx.lineTo(cx, cut + 36); ctx.arcTo(cx, cut, cx + 36, cut, 36); ctx.lineTo(cx + cw - 36, cut); ctx.arcTo(cx + cw, cut, cx + cw, cut + 36, 36); ctx.lineTo(cx + cw, cb); ctx.closePath(); ctx.fill();
  // ---- sóng chân thẻ + đường vàng
  var wt = L.waveTop;
  ctx.fillStyle = lg(cx, cb - 140, cx + cw, cb, [[0, '#4AA2F8'], [1, '#0A4DB5']]); ctx.beginPath(); ctx.moveTo(cx, wt + 40); ctx.bezierCurveTo(cx + cw*.22, wt - 8, cx + cw*.5, wt + 64, cx + cw*.78, wt + 30); ctx.bezierCurveTo(cx + cw*.88, wt + 16, cx + cw*.95, wt + 4, cx + cw, wt - 6); ctx.lineTo(cx + cw, cb); ctx.lineTo(cx, cb); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(6,50,130,.55)'; ctx.beginPath(); ctx.moveTo(cx, wt + 74); ctx.bezierCurveTo(cx + cw*.25, wt + 34, cx + cw*.55, wt + 96, cx + cw, wt + 36); ctx.lineTo(cx + cw, cb); ctx.lineTo(cx, cb); ctx.closePath(); ctx.fill();
  ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.strokeStyle = lg(cx, 0, cx + cw, 0, [[0, 'rgba(255,214,120,0)'], [.4, '#F6C968'], [.75, '#FFE7A6'], [1, 'rgba(255,214,120,0)']]); ctx.beginPath(); ctx.moveTo(cx, wt + 70); ctx.bezierCurveTo(cx + cw*.25, wt + 30, cx + cw*.55, wt + 92, cx + cw, wt + 32); ctx.stroke();
  // ---- cúp
  trophy(cx + cw - 152, L.cy + 196, .92);
  // ---- tiêu đề + nhãn trạng thái
  var xh = P + 10;
  rr(xh, cy + 58, 5, 28, 3); ctx.fillStyle = lg(0, cy + 58, 0, cy + 86, [[0, '#8FE3FF'], [1, '#2BA8FF']]); ctx.fill();
  txt('KẾT QUẢ BÀI KIỂM TRA', xh + 20, cy + 80, 21, 500, 'rgba(255,255,255,.85)', 'left', 2.2);
  L.titleLines.forEach(function(l, i){ txt(l, xh, cy + 134 + i*44, 32, 700, '#fff'); });
  var pill;
  if (d.practice) pill = { a:'THI THỬ', b:'Không chính thức', c1:'rgba(246,200,95,.34)', c2:'rgba(240,169,58,.2)', bd:'#FFD98A', ic:'#F0A93A', mark:'!', col:'#FFF3D0' };
  else if (neutral) pill = { a:'ĐÃ HOÀN THÀNH', b:'', c1:'rgba(60,215,120,.4)', c2:'rgba(30,170,100,.22)', bd:'#7CF2A2', ic:'#2FCB79', mark:'ok', col:'#FFFFFF' };
  else if (d.passed) pill = { a:'ĐẠT', b: d.passScore ? 'Ngưỡng đạt ' + d.passScore + '%' : '', c1:'rgba(60,215,120,.4)', c2:'rgba(30,170,100,.22)', bd:'#7CF2A2', ic:'#2FCB79', mark:'ok', col:'#FFFFFF' };
  else pill = { a:'CHƯA ĐẠT', b: d.passScore ? 'Ngưỡng đạt ' + d.passScore + '%' : '', c1:'rgba(255,120,95,.38)', c2:'rgba(230,80,60,.22)', bd:'#FFA592', ic:'#F0603F', mark:'!', col:'#FFFFFF' };
  var wa = width(pill.a, '800 21px ' + F, 1.2), wb = pill.b ? width(pill.b, '600 18px ' + F) : 0, pw = 62 + wa + (pill.b ? 26 + wb : 0) + 24, py = L.pillY;
  rr(xh, py, pw, 48, 24); ctx.fillStyle = lg(xh, 0, xh + pw, 0, [[0, pill.c1], [1, pill.c2]]); ctx.fill(); ctx.strokeStyle = pill.bd; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.beginPath(); ctx.arc(xh + 29, py + 24, 15, 0, Math.PI*2); ctx.fillStyle = pill.ic; ctx.fill();
  if (pill.mark === 'ok') icCheck(xh + 29, py + 24, 22, '#fff', 3.6); else txt(pill.mark, xh + 29, py + 32, 22, 800, '#fff', 'center');
  txt(pill.a, xh + 54, py + 32, 21, 800, pill.col, 'left', 1.2);
  if (pill.b){ txt('|', xh + 54 + wa + 12, py + 31, 20, 400, 'rgba(255,255,255,.55)'); txt(pill.b, xh + 54 + wa + 26, py + 31, 18, 600, 'rgba(255,255,255,.92)'); }
  // ---- vòng điểm
  var rx = L.ringCX, ry = L.ringCY, Rr = L.ringR;
  ctx.fillStyle = 'rgba(4,38,110,.35)'; ctx.beginPath(); ctx.arc(rx, ry, Rr - 12, 0, Math.PI*2); ctx.fill();
  ctx.lineWidth = L.ringW; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(rx, ry, Rr, 0, Math.PI*2); ctx.strokeStyle = 'rgba(8,46,120,.55)'; ctx.stroke();
  // Màu vòng theo mốc điểm (giống màn hình kết quả): <60% đỏ, 60-70% vàng, 70-90% xanh dương, >=90% xanh lá.
  var rc = tier === 'sc-red' ? ['#FFC2B5', '#F0603F', 'rgba(255,110,80,.7)'] : tier === 'sc-yellow' ? ['#FFE7A8', '#F0A93A', 'rgba(255,200,80,.7)'] : tier === 'sc-blue' ? ['#BDE3FF', '#3A8BF0', 'rgba(90,170,255,.7)'] : ['#D4FF7A', '#25D84B', 'rgba(110,255,110,.75)'];
  if (pct > 0){ ctx.save(); ctx.shadowColor = rc[2]; ctx.shadowBlur = 26; ctx.strokeStyle = lg(rx - Rr, ry - Rr, rx + Rr, ry + Rr, [[0, rc[0]], [1, rc[1]]]); ctx.beginPath(); ctx.arc(rx, ry, Rr, -Math.PI/2, -Math.PI/2 + Math.PI*2*pct/100); ctx.stroke(); ctx.restore(); }
  txt(pct + '%', rx, ry + 26, 80, 800, '#fff', 'center');
  txt('tỉ lệ đúng', rx, ry + 68, 22, 500, 'rgba(255,255,255,.88)', 'center');
  if (tier === 'sc-green' || tier === 'sc-blue'){ var ba = -Math.PI*0.35, bx = rx + Rr*Math.cos(ba), by = ry + Rr*Math.sin(ba); ctx.save(); ctx.shadowColor = 'rgba(120,255,120,.7)'; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(bx, by, 32, 0, Math.PI*2); ctx.fillStyle = tier === 'sc-green' ? lg(bx - 30, by - 30, bx + 30, by + 30, [[0, '#E8FFA8'], [1, '#6FE24F']]) : lg(bx - 30, by - 30, bx + 30, by + 30, [[0, '#D6EEFF'], [1, '#5AA9F5']]); ctx.fill(); ctx.restore(); ctx.beginPath(); ctx.arc(bx, by, 32, 0, Math.PI*2); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 3; ctx.stroke(); icCheck(bx, by + 1, 34, tier === 'sc-green' ? '#1D7A35' : '#15509E', 6); }
  // ---- đường ngăn dọc + thông tin người làm bài
  ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(L.divX, ry - 124); ctx.lineTo(L.divX, ry + 124); ctx.stroke();
  var nx = L.nx, ny = L.textTop + L.nameFont;
  L.nameLines.forEach(function(l, i){ txt(l, nx, ny + i*(L.nameFont + 8), L.nameFont, 800, '#fff'); });
  ny += (L.nameLines.length - 1) * (L.nameFont + 8);
  if (d.code){ ny += 48; icPerson(nx + 14, ny - 8, 26, '#8FD6FF'); txt('Mã NV: ' + d.code, nx + 42, ny, 22, 500, 'rgba(235,245,255,.95)'); }
  if (d.manager){ ny += 36; icGroup(nx + 14, ny - 8, 20, '#8FD6FF'); ctx.font = '500 22px ' + F; var full = 'Quản lí: ' + d.manager, mg = full, avail = R - nx - 42; if (ctx.measureText(mg).width > avail){ while (ctx.measureText(mg + '…').width > avail && mg.length > 12) mg = mg.slice(0, -1); mg = mg.replace(/\s+$/, '') + '…'; } txt(mg, nx + 42, ny, 22, 500, 'rgba(235,245,255,.95)'); }
  var sb = L.textTop + L.scoreDY, st = (d.score != null ? d.score : '–') + '/' + (d.total != null ? d.total : '–');
  txt(st, nx, sb, 58, 800, '#fff'); var w1 = width(st, '800 58px ' + F); txt('câu đúng', nx + w1 + 14, sb, 26, 500, 'rgba(255,255,255,.9)');
  if (L.hasBar){
    var bw = R - nx, bx2 = nx, byy = sb + 26, segs = [[d.score || 0, null], [d.wrong, '#FF6B5E'], [d.blank, 'rgba(255,255,255,.5)']];
    rr(nx, byy, bw, 20, 10); ctx.fillStyle = 'rgba(4,34,100,.5)'; ctx.fill();
    ctx.save(); rr(nx, byy, bw, 20, 10); ctx.clip();
    segs.forEach(function(sg, i){ var w2 = bw * sg[0] / d.total; if (w2 > 0){ ctx.fillStyle = sg[1] || lg(nx, 0, nx + bw, 0, [[0, '#9BFF4F'], [1, '#22D84A']]); ctx.fillRect(bx2, byy, w2, 20); bx2 += w2; } });
    ctx.restore();
    var t1 = 'Sai: ' + d.wrong, t2 = 'Bỏ trống: ' + d.blank, wsa = width(t1, '500 21px ' + F);
    txt(t1, nx, sb + 78, 21, 500, 'rgba(255,255,255,.92)'); ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(nx + wsa + 16, sb + 62); ctx.lineTo(nx + wsa + 16, sb + 82); ctx.stroke(); txt(t2, nx + wsa + 32, sb + 78, 21, 500, 'rgba(255,255,255,.92)');
  }
  // ---- chỉ số phụ (khung trắng)
  var cols = [];
  if (d.compliance != null) cols.push(['target', d.compliance + ' điểm', d.practice ? 'Tuân thủ nếu thi thật' : 'Điểm tuân thủ', '#A35F0B']);
  if (d.clock) cols.push(['clock', d.clock, 'Thời gian làm bài', INK]);
  if (d.compliance == null && d.avgSec != null) cols.push(['clock', d.avgSec + ' giây', 'Trung bình mỗi câu', INK]);
  if (d.submittedText){ var sp = d.submittedText.split(' '); cols.push(['cal', sp[0], 'Nộp bài: ' + (sp[1] || ''), INK]); }
  cols = cols.slice(0, 3);
  var sx0 = cx + 40, cwid = (cw - 80) / Math.max(1, cols.length);
  cols.forEach(function(c, i){
    var mx = sx0 + cwid*i + cwid/2;
    if (i){ ctx.strokeStyle = SC.LINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx0 + cwid*i, L.iconY - 34); ctx.lineTo(sx0 + cwid*i, L.labY + 12); ctx.stroke(); }
    (c[0] === 'target' ? icTarget : c[0] === 'clock' ? icClock : icCal)(mx, L.iconY, 46, '#1B6FE8');
    var size = 40; while (size > 26 && width(c[1], '800 ' + size + 'px ' + F) > cwid - 40) size -= 2;
    txt(c[1], mx, L.valY, size, 800, c[3], 'center'); txt(c[2], mx, L.labY, 22, 500, MUTED, 'center');
  });
  ctx.strokeStyle = SC.LINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx + 44, L.sepY); ctx.lineTo(cx + cw - 44, L.sepY); ctx.stroke();
  // ---- xác thực
  var vx = cx + 42, vw = (d.qr ? L.qrX - 28 : cx + cw - 42) - vx;
  ctx.save(); ctx.shadowColor = 'rgba(10,60,140,.12)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4; rr(vx, L.vpY, vw, L.vpH, 27); ctx.fillStyle = lg(vx, 0, vx + vw, 0, [[0, '#E1F4E8'], [1, '#EEF4FB']]); ctx.fill(); ctx.restore();
  ctx.beginPath(); ctx.arc(vx + 34, L.vpY + 27, 20, 0, Math.PI*2); ctx.fillStyle = lg(vx + 14, L.vpY + 7, vx + 54, L.vpY + 47, [[0, '#2BBE5E'], [1, '#12923F']]); ctx.fill(); icCheck(vx + 34, L.vpY + 28, 26, '#fff', 4.2);
  var vt = 'Đã xác thực bởi hệ thống lúc ' + d.stampText, vs = 25; while (vs > 18 && width(vt, '700 ' + vs + 'px ' + F) > vw - 86) vs -= 1;
  txt(vt, vx + 66, L.vpY + 27 + vs*0.35, vs, 700, SC.INK);
  txt('Người gửi xác nhận đã xem và đồng ý với kết quả bài kiểm tra.', cx + 66, L.noteY, 21, 500, '#2B3F66');
  icLink(cx + 80, L.linkY - 7, 26, SC.BRAND);
  var lt = d.qr ? 'Quét QR để xem bản gốc' : 'Mã minh chứng ' + (d.proof || ''), lw0 = width(lt, '600 21px ' + F);
  txt(lt, cx + 106, L.linkY, 21, 600, SC.BRAND); txt('·', cx + 106 + lw0 + 14, L.linkY, 21, 700, SC.BRAND); txt(d.host, cx + 106 + lw0 + 30, L.linkY, 21, 700, SC.BRAND);
  var qrBox = null;
  if (d.qr){
    var qs = L.qrS, qx = L.qrX, qy = L.qrY; qrBox = { x: qx, y: qy, w: qs, h: qs };
    ctx.save(); ctx.shadowColor = 'rgba(10,60,140,.22)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 6; rr(qx, qy, qs, qs, 22); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
    rr(qx, qy, qs, qs, 22); ctx.lineWidth = 2; ctx.strokeStyle = '#D2E0F2'; ctx.stroke();
    var n = d.qr.length, cell = Math.max(2, Math.floor((qs - 30) / n)), o = (qs - cell*n) / 2;
    ctx.fillStyle = INK; for (var qr = 0; qr < n; qr++) for (var qc = 0; qc < n; qc++) if (d.qr[qr][qc]) ctx.fillRect(qx + o + qc*cell, qy + o + qr*cell, cell, cell);
  }
  // ---- thi thử: hoa văn chìm chỉ ở khung trắng, không phủ lên mã QR
  if (d.practice){
    ctx.save(); ctx.beginPath(); ctx.rect(cx, cut + 6, cw, L.waveTop - cut - 6);
    if (qrBox) ctx.rect(qrBox.x - 6, qrBox.y - 6, qrBox.w + 12, qrBox.h + 12);
    try { ctx.clip('evenodd'); } catch (e) { ctx.clip(); }
    ctx.fillStyle = 'rgba(201,138,27,.08)'; ctx.font = '800 26px ' + F; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (var ty = cut - 20, row = 0; ty < L.waveTop + 80; ty += 150, row++) for (var tx = cx - 40 + (row % 2 ? 140 : 0); tx < cx + cw + 80; tx += 280){ ctx.save(); ctx.translate(tx, ty); ctx.rotate(-0.42); ctx.fillText('T H I   T H Ử', 0, 0); ctx.restore(); }
    ctx.restore();
  }
  ctx.restore();
  // viền sáng quanh thẻ
  rr(cx + 1.5, cy + 1.5, cw - 3, cb - cy - 3, 37); ctx.lineWidth = 3; ctx.strokeStyle = lg(0, cy, 0, cb, [[0, 'rgba(130,220,255,.95)'], [1, 'rgba(70,160,255,.85)']]); ctx.stroke();
}
  return { SC: SC, height: shareCardHeight, draw: drawShareCard };
};
