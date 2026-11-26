// Thẻ KẾT QUẢ "sống" trong email kết quả (mẫu "Kết quả bài kiểm tra"): ảnh được vẽ lại từ dữ liệu bài làm mới nhất mỗi lần người nhận
// mở thư (điểm trên thang 10, ĐẠT / CHƯA ĐẠT, số câu đúng, thời gian làm bài, số lần rời khỏi bài, ngày hoàn thành), nên nếu quản trị sửa
// đáp án và chấm lại thì thư đã gửi cũng đổi theo. Chỉ có điểm và thông số, KHÔNG có nội dung câu hỏi hay đáp án (đề dùng nhiều ngày).
// Phục vụ qua api/result-img (có chữ ký).
const path = require("path");
const art = require("./mailart");
const E = require("./resultemail");
const F = (w, s) => w + " " + s + 'px "Be Vietnam Pro"';
const NAVY = "#0B3F94", INK = "#14357A", MUTED = "#4A5B7D", BLUE = "#1F66E0";
const W = 540, S = 2;

const imgs = {};
async function asset(lib, file) {
  if (imgs[file] !== undefined) return imgs[file];
  try { imgs[file] = await lib.loadImage(path.join(__dirname, "assets", file)); } catch (e) { imgs[file] = null; }
  return imgs[file];
}
// Điểm trên thang 10 theo tỉ lệ đúng: 90% -> "9", 95% -> "9,5", 87% -> "8,7"
function score10(pct) { const v = Math.round(Math.max(0, Math.min(100, Number(pct) || 0))) / 10; return String(v).replace(".", ","); }
function dateOf(m) { return String(m.when || "").split(" ")[1] || ""; }
function durText(sec) {
  const t = Math.max(0, Math.round(sec || 0)), h = Math.floor(t / 3600), mi = Math.floor((t % 3600) / 60), s = t % 60;
  if (h) return h + " giờ " + (mi < 10 ? "0" : "") + mi + " phút";
  return mi ? mi + " phút " + (s < 10 ? "0" : "") + s + " giây" : s + " giây";
}
function wrap2(c, text, font, maxW) {
  c.font = font; if (c.measureText(text).width <= maxW) return [text];
  const pi = text.indexOf(" ("); if (pi > 0) { const a1 = text.slice(0, pi), b1 = text.slice(pi + 1); if (c.measureText(a1).width <= maxW && c.measureText(b1).width <= maxW) return [a1, b1]; } // giữ nguyên cụm trong ngoặc, vd "4 lần" / "(4 phút)"
  const w = text.split(" "); let best = null, bestW = Infinity;
  for (let i = 1; i < w.length; i++) { const a = w.slice(0, i).join(" "), b = w.slice(i).join(" "), wa = c.measureText(a).width, wb = c.measureText(b).width, mx = Math.max(wa, wb); if (mx < bestW) { bestW = mx; best = [a, b]; } }
  return best || [text];
}

// Biểu tượng nét xanh (vẽ tay): clipboard-check, đồng hồ, màn hình, lịch
function icon(c, kind, x, y, s, col) {
  c.save(); c.translate(x, y); c.scale(s / 32, s / 32); c.strokeStyle = col; c.lineWidth = 2.4; c.lineCap = "round"; c.lineJoin = "round"; c.beginPath();
  if (kind === "clip") { art.rr(c, 4, 6, 24, 24, 4); c.stroke(); art.rr(c, 11, 2, 10, 7, 2.5); c.stroke(); c.beginPath(); c.moveTo(10.5, 19); c.lineTo(14.5, 23); c.lineTo(22, 14.5); c.stroke(); }
  else if (kind === "clock") { c.arc(16, 16, 13, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(16, 8); c.lineTo(16, 16.5); c.lineTo(21.5, 19.5); c.stroke(); }
  else if (kind === "monitor") { art.rr(c, 2.5, 4, 27, 18, 3); c.stroke(); c.beginPath(); c.moveTo(11, 28); c.lineTo(21, 28); c.moveTo(16, 22); c.lineTo(16, 28); c.stroke(); }
  else { art.rr(c, 3.5, 6, 25, 22, 4); c.stroke(); c.beginPath(); c.moveTo(3.5, 13); c.lineTo(28.5, 13); c.moveTo(10, 2.5); c.lineTo(10, 9); c.moveTo(22, 2.5); c.lineTo(22, 9); c.stroke(); }
  c.restore();
}

async function card(attempt, settings) {
  const lib = art.load(), rr = art.rr, lin = art.lin;
  const m = E.model(attempt, settings, null), spec = E.artSpec(attempt, settings), aw = E.awayInfo(attempt);
  const cv = lib.createCanvas(W * S, 330 * S), c = cv.getContext("2d"); c.scale(S, S); c.lineCap = "round"; c.lineJoin = "round"; c.textBaseline = "alphabetic"; c.textAlign = "left";
  // ---- khung kết quả
  const BH = 190;
  c.save(); c.shadowColor = "rgba(31,102,224,.14)"; c.shadowBlur = 16; c.shadowOffsetY = 5; rr(c, 2, 2, W - 4, BH - 4, 28); c.fillStyle = lin(c, 0, 0, W, BH, ["#E1EEFD", "#F4F9FF"]); c.fill(); c.restore();
  rr(c, 2, 2, W - 4, BH - 4, 28); c.lineWidth = 1.5; c.strokeStyle = "#D3E3F8"; c.stroke();
  // hình bên trái: huy hiệu điểm tuân thủ (nếu có) / ảnh "Chưa đạt" / cúp
  const vx = 126, vy = BH / 2;
  let vis = null, vw = 160;
  if (spec.comp != null) { vis = await asset(lib, "compliance-" + spec.comp + ".webp"); vw = 196; }
  else if (m.ps === false && !m.t.practice) { vis = await asset(lib, "fail-photo.webp"); vw = 176; }
  else { vis = await asset(lib, "rs-trophy.png"); vw = 168; }
  if (vis) { const k = vw / vis.width, h = vis.height * k; c.drawImage(vis, vx - vw / 2, vy - h / 2 + 4, vw, h); }
  c.fillStyle = "#BFD3EE"; c.fillRect(264, 34, 1.5, BH - 68);
  // điểm + trạng thái
  const rx = 292;
  c.fillStyle = "#1B2F55"; c.font = F(500, 19); c.fillText("Kết quả", rx, 56);
  c.fillStyle = NAVY; c.font = F(800, 60); c.fillText(score10(attempt.pct), rx, 122);
  const sw = c.measureText(score10(attempt.pct)).width; c.font = F(800, 60); c.fillText(" / 10", rx + sw, 122);
  const sp = m.t.practice ? { t: "Thi thử" + (m.ps === null ? "" : m.ps ? " · Đạt" : " · Chưa đạt"), bg: "#FFF1D6", fg: "#8A5200", mbg: "#D68F1E", mark: "!" }
    : m.ps === false ? { t: "Chưa đạt yêu cầu", bg: "#FDE4E4", fg: "#C62828", mbg: "#E53935", mark: "x" }
    : m.ps === true ? { t: "Đạt yêu cầu", bg: "#D5F1E0", fg: "#17794A", mbg: "#18A957", mark: "v" } : { t: "Đã hoàn thành", bg: "#DEEAFD", fg: BLUE, mbg: BLUE, mark: "v" };
  c.font = F(800, 18); const pw = 14 + 26 + 10 + c.measureText(sp.t).width + 22, py = 138;
  rr(c, rx - 4, py, pw, 38, 19); c.fillStyle = sp.bg; c.fill();
  const mx = rx - 4 + 14 + 13, my = py + 19; c.beginPath(); c.arc(mx, my, 13, 0, Math.PI * 2); c.fillStyle = sp.mbg; c.fill();
  c.strokeStyle = "#FFFFFF"; c.fillStyle = "#FFFFFF"; c.lineWidth = 2.8; c.beginPath();
  if (sp.mark === "v") { c.moveTo(mx - 5.5, my + 0.5); c.lineTo(mx - 1.5, my + 4.5); c.lineTo(mx + 6, my - 4.5); c.stroke(); }
  else if (sp.mark === "x") { c.moveTo(mx - 4.5, my - 4.5); c.lineTo(mx + 4.5, my + 4.5); c.moveTo(mx + 4.5, my - 4.5); c.lineTo(mx - 4.5, my + 4.5); c.stroke(); }
  else { c.font = F(800, 17); c.textAlign = "center"; c.fillText("!", mx, my + 6); c.textAlign = "left"; }
  c.fillStyle = sp.fg; c.font = F(800, 18); c.fillText(sp.t, mx + 13 + 10, py + 25);
  // ---- hàng 4 ô thông tin (không có khung ghi chú)
  const CY = BH + 16, CH = 124, total = m.total || 0, score = attempt.score || 0, leaves = aw.n, redL = leaves >= 4;
  rr(c, 2, CY, W - 4, CH, 22); c.fillStyle = "#F0F6FD"; c.fill();
  const cells = [
    { ic: "clip", k: "Số câu đúng", v: score + " / " + total },
    { ic: "clock", k: "Thời gian làm bài", v: m.dur != null ? durText(m.dur) : "—" },
    { ic: "monitor", k: "Số lần rời khỏi bài", v: leaves + " lần" + (leaves > 0 && E.awayMinText(aw.ms) ? " (" + E.awayMinText(aw.ms) + ")" : ""), hl: true, col: redL ? "#D92D20" : null },
    { ic: "cal", k: "Ngày hoàn thành", v: dateOf(m) || "—" }
  ];
  const cw = (W - 12) / 4;
  cells.forEach((q, i) => {
    const x0 = 6 + i * cw, cxm = x0 + cw / 2;
    if (q.hl) { rr(c, x0 + 3, CY + 6, cw - 6, CH - 12, 18); c.fillStyle = redL ? "#FCE3E0" : "#D9EAFB"; c.fill(); }
    else if (i && i !== 2) { c.fillStyle = "#D3E1F3"; c.fillRect(x0, CY + 22, 1.5, CH - 44); }
    icon(c, q.ic, cxm - 15, CY + 14, 30, q.col || BLUE);
    let ks = 13.5; c.font = F(500, ks); while (ks > 11 && c.measureText(q.k).width > cw - 14) { ks -= 0.5; c.font = F(500, ks); }
    c.textAlign = "center"; c.fillStyle = MUTED; c.fillText(q.k, cxm, CY + 66);
    let vs = 18; const font = (s) => F(800, s); let lines = wrap2(c, q.v, font(vs), cw - 16);
    while (vs > 13 && lines.some((l) => { c.font = font(vs); return c.measureText(l).width > cw - 14; })) { vs -= 1; lines = wrap2(c, q.v, font(vs), cw - 16); }
    c.fillStyle = q.col || INK; c.font = font(vs); lines.forEach((l, j) => c.fillText(l, cxm, CY + 90 + j * (vs + 4)));
    c.textAlign = "left";
  });
  return { png: await cv.encode("png"), width: W, height: 330 };
}

module.exports = { card, score10 };
