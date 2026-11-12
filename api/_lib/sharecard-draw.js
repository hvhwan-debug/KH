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

// ẢNH KẾT QUẢ DẠNG VÉ (phương án B): nửa trên nền tối = kết quả (vòng điểm + tên + số câu đúng),
// đường xé ngang, nửa dưới nền trắng = chỉ số phụ, mã QR, kết quả theo mảng kiến thức, thông tin xác thực.
// Chiều cao tự tính theo nội dung (tên đề / tên người dài, có hay không có mảng kiến thức, điểm tuân thủ, mã QR).
var SC = { W:1080, M:56, PAD:60, F:'"Be Vietnam Pro","Segoe UI",Roboto,Arial,sans-serif', BG:'#0A2241', INK:'#0A2552', MUTED:'#5A6E90', BRAND:'#0A63C4', DEEP:'#0B3F94', LINE:'#E3E7ED' };
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
  L.titleLines = scWrap(c, d.title, '700 30px ' + SC.F, R - P, 2);
  L.pillY = L.cy + 112 + L.titleLines.length * 40;
  var ringR = 128, nx = P + 2*ringR + 58;
  L.nx = nx; L.ringR = ringR;
  var nameFont = 40; L.nameLines = scWrap(c, d.name, '800 40px ' + SC.F, R - nx, 1);
  if (L.nameLines[0] && /…$/.test(L.nameLines[0])){ nameFont = 34; L.nameLines = scWrap(c, d.name, '800 34px ' + SC.F, R - nx, 2); }
  L.nameFont = nameFont;
  L.heroY = L.pillY + 44 + 56;            // đỉnh khối kết quả
  // khối chữ bên phải: tên (1-2 dòng) + mã NV + quản lí + số câu đúng + thanh + dòng sai/bỏ trống
  var t = nameFont; t += (L.nameLines.length - 1) * (nameFont + 6);
  if (d.code) t += 38; if (d.manager) t += 32;
  L.scoreDY = t + 76;                     // đường chân chữ của "22/30" tính từ đỉnh khối
  var textH = L.scoreDY + (d.wrong != null && d.blank != null && d.total ? 30 + 16 + 44 : 10);
  var heroH = Math.max(2*ringR + 28, textH);
  L.ringCY = L.heroY + heroH / 2;
  L.textTop = L.heroY + (heroH - textH) / 2;
  L.cut = L.heroY + heroH + 46;           // đường xé
  L.qrS = d.qr ? 176 : 0;
  L.statsY = L.cut + 70;
  var afterStats = L.cut + Math.max(150, d.qr ? L.qrS + 80 : 0);
  L.catsY = afterStats + 22;
  L.cats = (d.cats || []).slice(0, 4);
  var afterCats = L.cats.length ? L.catsY + 22 + L.cats.length * 76 + 8 : afterStats;
  L.footY = afterCats + 24;
  L.H = L.footY + 200 + SC.M;
  return L;
}
function shareCardHeight(d){ return scLayout(d).H; }
function drawShareCard(ctx, W, H, d){
  var F = SC.F, INK = SC.INK, MUTED = SC.MUTED, L = scLayout(d), cx = L.cx, cy = L.cy, cw = L.cw, P = L.P, R = L.R, cut = L.cut;
  function rr(x, y, w, h, r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
  function txt(t, x, y, size, weight, color, align, ls){ ctx.font = weight + ' ' + size + 'px ' + F; ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic'; if (ls && 'letterSpacing' in ctx) ctx.letterSpacing = ls + 'px'; ctx.fillText(t, x, y); if ('letterSpacing' in ctx) ctx.letterSpacing = '0px'; }
  function width(t, font, ls){ ctx.font = font; if (ls && 'letterSpacing' in ctx) ctx.letterSpacing = ls + 'px'; var w = ctx.measureText(t).width; if ('letterSpacing' in ctx) ctx.letterSpacing = '0px'; return w; }
  var neutral = d.passed !== true && d.passed !== false;
  // nền
  ctx.fillStyle = SC.BG; ctx.fillRect(0, 0, W, H);
  var gl = ctx.createRadialGradient(W*0.85, 80, 0, W*0.85, 80, 700); gl.addColorStop(0, 'rgba(18,181,201,.35)'); gl.addColorStop(1, 'rgba(18,181,201,0)'); ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H);
  var gl2 = ctx.createRadialGradient(0, H, 0, 0, H, 600); gl2.addColorStop(0, 'rgba(109,91,246,.18)'); gl2.addColorStop(1, 'rgba(109,91,246,0)'); ctx.fillStyle = gl2; ctx.fillRect(0, 0, W, H);
  var ch = H - 2*cy;
  ctx.save(); rr(cx, cy, cw, ch, 36); ctx.clip();
  var tg = ctx.createLinearGradient(cx, cy, cx + cw, cut); tg.addColorStop(0, '#042959'); tg.addColorStop(1, '#07728D'); ctx.fillStyle = tg; ctx.fillRect(cx, cy, cw, cut - cy);
  var hl = ctx.createRadialGradient(cx + cw - 60, cy - 40, 0, cx + cw - 60, cy - 40, 420); hl.addColorStop(0, 'rgba(255,255,255,.16)'); hl.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = hl; ctx.fillRect(cx, cy, cw, cut - cy);
  ctx.fillStyle = '#fff'; ctx.fillRect(cx, cut, cw, cy + ch - cut);
  // ---- nửa trên: tiêu đề + nhãn trạng thái
  txt('KẾT QUẢ BÀI KIỂM TRA', P, cy + 72, 18, 800, 'rgba(255,255,255,.7)', 'left', 2.5);
  L.titleLines.forEach(function(l, i){ txt(l, P, cy + 112 + i*40, 30, 700, '#fff'); });
  var pill;
  if (d.practice) pill = { a:'THI THỬ', b:'Không chính thức', dot:'#F6C85F', col:'#FFD98A' };
  else if (neutral) pill = { a:'ĐÃ HOÀN THÀNH', b:'', dot:'#7FE3F2', col:'#BEE9F4' };
  else if (d.passed) pill = { a:'ĐẠT', b: d.passScore ? 'Ngưỡng đạt ' + d.passScore + '%' : '', dot:'#7FE3F2', col:'#A8F5D6' };
  else pill = { a:'CHƯA ĐẠT', b: d.passScore ? 'Ngưỡng đạt ' + d.passScore + '%' : '', dot:'#FF9E8A', col:'#FFC2B5' };
  var wa = width(pill.a, '800 19px ' + F, 1.5), wb = pill.b ? width(pill.b, '600 16px ' + F) : 0, pw = 40 + wa + (pill.b ? 22 + wb : 0) + 20, py = L.pillY;
  rr(P, py, pw, 44, 22); ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.arc(P + 22, py + 22, 6, 0, Math.PI*2); ctx.fillStyle = pill.dot; ctx.fill();
  txt(pill.a, P + 38, py + 29, 19, 800, pill.col, 'left', 1.5);
  if (pill.b){ txt('·', P + 38 + wa + 8, py + 29, 18, 800, 'rgba(255,255,255,.6)'); txt(pill.b, P + 38 + wa + 22, py + 29, 16, 600, 'rgba(255,255,255,.88)'); }
  // ---- vòng điểm (bên trái)
  var rx = P + L.ringR, ry = L.ringCY, Rr = L.ringR, pct = Math.max(0, Math.min(100, d.pct || 0));
  ctx.lineWidth = 26; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(rx, ry, Rr, 0, Math.PI*2); ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.stroke();
  // Màu vòng tròn theo đúng mốc điểm (giống màn hình kết quả): <60% đỏ, 60-70% vàng, 70-90% xanh dương, >=90% xanh lá.
  var rg = ctx.createLinearGradient(rx - Rr, ry - Rr, rx + Rr, ry + Rr);
  var tier = scoreTierClass(pct);
  if (tier === 'sc-red'){ rg.addColorStop(0, '#FFC2B5'); rg.addColorStop(1, '#F0603F'); }
  else if (tier === 'sc-yellow'){ rg.addColorStop(0, '#FFE3A8'); rg.addColorStop(1, '#F0A93A'); }
  else if (tier === 'sc-blue'){ rg.addColorStop(0, '#BBDCF7'); rg.addColorStop(1, '#3E86D6'); }
  else { rg.addColorStop(0, '#A8F5D6'); rg.addColorStop(1, '#2FC48A'); }
  if (pct > 0){ ctx.beginPath(); ctx.arc(rx, ry, Rr, -Math.PI/2, -Math.PI/2 + Math.PI*2*pct/100); ctx.strokeStyle = rg; ctx.stroke(); }
  txt(pct + '%', rx, ry + 24, 76, 800, '#fff', 'center');
  txt('tỉ lệ đúng', rx, ry + 62, 20, 500, 'rgba(255,255,255,.75)', 'center');
  // ---- người làm bài + số câu đúng (bên phải)
  var nx = L.nx, ny = L.textTop + L.nameFont;
  L.nameLines.forEach(function(l, i){ txt(l, nx, ny + i*(L.nameFont + 6), L.nameFont, 800, '#fff'); });
  ny += (L.nameLines.length - 1) * (L.nameFont + 6);
  if (d.code){ ny += 38; txt('Mã NV ' + d.code, nx, ny, 22, 500, 'rgba(255,255,255,.75)'); }
  if (d.manager){ ny += 32; ctx.font = '500 22px ' + F; var full = 'Quản lí: ' + d.manager, mg = full; if (ctx.measureText(mg).width > R - nx){ while (ctx.measureText(mg + '…').width > R - nx && mg.length > 12) mg = mg.slice(0, -1); mg = mg.replace(/\s+$/, '') + '…'; } txt(mg, nx, ny, 22, 500, 'rgba(255,255,255,.75)'); }
  var sb = L.textTop + L.scoreDY, st = (d.score != null ? d.score : '–') + '/' + (d.total != null ? d.total : '–');
  txt(st, nx, sb, 54, 800, '#fff'); var w1 = width(st, '800 54px ' + F); txt('câu đúng', nx + w1 + 12, sb, 24, 600, 'rgba(255,255,255,.8)');
  if (d.wrong != null && d.blank != null && d.total){
    var sy0 = sb + 52, bw = R - nx, bx = nx, by = sb + 30, segs = [[d.score || 0, '#2FB879'], [d.wrong, '#E25B50'], [d.blank, '#C7CDD6']];
    ctx.save(); rr(bx, by, bw, 16, 8); ctx.clip(); ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(bx, by, bw, 16);
    segs.forEach(function(sg){ var w2 = bw * sg[0] / d.total; if (w2 > 0){ ctx.fillStyle = sg[1]; ctx.fillRect(bx, by, w2, 16); bx += w2; } }); ctx.restore();
    txt('Sai ' + d.wrong + '  ·  Bỏ trống ' + d.blank, nx, sb + 82, 21, 600, 'rgba(255,255,255,.78)');
  }
  // ---- đường xé
  ctx.setLineDash([14, 12]); ctx.strokeStyle = 'rgba(10,37,82,.22)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx + 44, cut); ctx.lineTo(cx + cw - 44, cut); ctx.stroke(); ctx.setLineDash([]);
  // ---- nửa dưới: chỉ số phụ (+ QR bên phải)
  var qrBox = null;
  var cols = [];
  if (d.compliance != null) cols.push([d.compliance + ' điểm', d.practice ? 'Tuân thủ nếu thi thật' : 'Điểm tuân thủ', '#8A5200']);
  if (d.clock) cols.push([d.clock, 'Thời gian làm bài', INK]);
  if (d.compliance == null && d.avgSec != null) cols.push([d.avgSec + ' giây', 'Trung bình mỗi câu', INK]);
  if (d.submittedText){ var sp = d.submittedText.split(' '); cols.push([sp[0], 'Nộp bài · ' + (sp[1] || ''), INK]); }
  cols = cols.slice(0, 3);
  var areaW = (R - P) - (d.qr ? L.qrS + 34 : 0), cwid = areaW / Math.max(1, cols.length), sy = L.statsY + (d.qr ? 22 : 0);
  cols.forEach(function(c, i){
    var X = P + cwid*i + (i ? 16 : 0);
    if (i){ ctx.strokeStyle = SC.LINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(P + cwid*i, sy - 8); ctx.lineTo(P + cwid*i, sy + 74); ctx.stroke(); }
    var size = 34; while (size > 24 && width(c[0], '800 ' + size + 'px ' + F) > cwid - 22) size -= 2;
    txt(c[0], X, sy + 36, size, 800, c[2]); txt(c[1], X, sy + 70, 19, 500, MUTED);
  });
  if (d.qr){
    var qs = L.qrS, qx = R - qs, qy = cut + 40; qrBox = { x: qx, y: qy, w: qs, h: qs };
    rr(qx, qy, qs, qs, 20); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#D5DFEC'; ctx.stroke();
    var n = d.qr.length, cell = Math.max(2, Math.floor((qs - 28) / n)), o = (qs - cell*n) / 2;
    ctx.fillStyle = INK; for (var qr = 0; qr < n; qr++) for (var qc = 0; qc < n; qc++) if (d.qr[qr][qc]) ctx.fillRect(qx + o + qc*cell, qy + o + qr*cell, cell, cell);
  }
  // ---- kết quả theo mảng kiến thức
  if (L.cats.length){
    var y = L.catsY;
    txt('THEO MẢNG KIẾN THỨC', P, y, 16, 800, MUTED, 'left', 2); y += 22;
    L.cats.forEach(function(c){
      var p = c.n ? Math.round(c.ok / c.n * 100) : 0, col = p >= 80 ? '#1E8A57' : p >= 60 ? '#D68F1E' : '#C8423A', val = c.ok + '/' + c.n + '  ·  ' + p + '%';
      var vw = width(val, '700 22px ' + F); ctx.font = '700 22px ' + F; var nm = c.name; if (ctx.measureText(nm).width > R - P - vw - 24){ while (ctx.measureText(nm + '…').width > R - P - vw - 24 && nm.length > 4) nm = nm.slice(0, -1); nm = nm.replace(/\s+$/, '') + '…'; }
      txt(nm, P, y + 28, 22, 700, INK); txt(val, R, y + 28, 22, 700, col, 'right');
      rr(P, y + 42, R - P, 12, 6); ctx.fillStyle = '#E8ECF1'; ctx.fill(); rr(P, y + 42, Math.max(12, (R - P) * p / 100), 12, 6); ctx.fillStyle = col; ctx.fill();
      y += 76;
    });
  }
  // ---- xác thực
  var fy = L.footY;
  ctx.strokeStyle = SC.LINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(P, fy); ctx.lineTo(R, fy); ctx.stroke();
  ctx.beginPath(); ctx.arc(P + 16, fy + 52, 16, 0, Math.PI*2); ctx.fillStyle = '#1E8A57'; ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(P + 9, fy + 53); ctx.lineTo(P + 14, fy + 58); ctx.lineTo(P + 23, fy + 47); ctx.stroke();
  txt('Đã xác thực bởi hệ thống lúc ' + d.stampText, P + 44, fy + 60, 22, 700, SC.DEEP);
  txt('Người gửi xác nhận đã xem và đồng ý với kết quả bài kiểm tra.', P, fy + 106, 20, 600, '#7A5600');
  txt(d.qr ? 'Quét QR để xem bản gốc  ·  ' + d.host : 'Mã minh chứng ' + (d.proof || '') + '  ·  ' + d.host, P, fy + 142, 20, 600, SC.BRAND);
  // ---- thi thử: hoa văn chìm chỉ ở nửa dưới, không phủ lên mã QR
  if (d.practice){
    ctx.save(); ctx.beginPath(); ctx.rect(cx, cut + 6, cw, cy + ch - cut);
    if (qrBox) ctx.rect(qrBox.x - 6, qrBox.y - 6, qrBox.w + 12, qrBox.h + 12);
    try { ctx.clip('evenodd'); } catch (e) { ctx.clip(); }
    ctx.fillStyle = 'rgba(201,138,27,.07)'; ctx.font = '800 26px ' + F; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (var ty = cut - 20, row = 0; ty < cy + ch + 80; ty += 150, row++) for (var tx = cx - 40 + (row % 2 ? 140 : 0); tx < cx + cw + 80; tx += 280){ ctx.save(); ctx.translate(tx, ty); ctx.rotate(-0.42); ctx.fillText('T H I   T H Ử', 0, 0); ctx.restore(); }
    ctx.restore();
  }
  ctx.restore();
  // lỗ bấm vé hai bên đường xé
  ctx.fillStyle = SC.BG; ctx.beginPath(); ctx.arc(cx, cut, 30, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(cx + cw, cut, 30, 0, Math.PI*2); ctx.fill();
}
  return { SC: SC, height: shareCardHeight, draw: drawShareCard };
};
