// Thẻ KẾT QUẢ "sống" trong email kết quả: ảnh được vẽ lại từ dữ liệu bài làm mới nhất mỗi lần người nhận mở thư
// (điểm, tỉ lệ đúng, ĐẠT / CHƯA ĐẠT, giờ làm bài, nhận xét), nên nếu quản trị sửa đáp án và chấm lại thì thư đã gửi cũng đổi theo.
// Gồm: dải tên đề + vòng tỉ lệ / huy hiệu điểm tuân thủ + điểm + trạng thái + hàng giờ giấc + hộp nhận xét.
// Chỉ có điểm và tên đề, KHÔNG có nội dung câu hỏi hay đáp án (đề dùng nhiều ngày). Phục vụ qua api/result-img (có chữ ký).
const path = require("path");
const quiz = require("./quiz");
const art = require("./mailart");
const E = require("./resultemail");
const F = (w, s) => w + " " + s + 'px "Be Vietnam Pro"';
const BL = "#1F66E0", NV = "#14357A", GR = "#4A5B7D";
const W = 504, S = 2;

function wrap(c, text, maxW) {
  const words = String(text || "").split(/\s+/).filter(Boolean), lines = []; let cur = "";
  words.forEach((w) => { const t = cur ? cur + " " + w : w; if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
  if (cur) lines.push(cur);
  return lines;
}
// Vẽ liền nhiều đoạn chữ khác kiểu trên cùng một dòng; trả về x cuối
function runs(c, x, y, parts) { parts.forEach((p) => { c.font = p.f; c.fillStyle = p.c; c.fillText(p.t, x, y); x += c.measureText(p.t).width; }); return x; }
function runsW(c, parts) { let w = 0; parts.forEach((p) => { c.font = p.f; w += c.measureText(p.t).width; }); return w; }

async function card(attempt, settings) {
  const lib = art.load(), rr = art.rr, lin = art.lin;
  const m = E.model(attempt, settings, null), spec = E.artSpec(attempt, settings);
  const pass = quiz.passScoreOf(settings) || null, { lead1, lead2 } = E.leads(m, pass);
  const probe = lib.createCanvas(10, 10).getContext("2d");
  // tên đề trên dải xanh: tối đa 2 dòng
  probe.font = F(800, 18); const tLines = wrap(probe, m.t.main, W - 40).slice(0, 2);
  const bandH = 30 + tLines.length * 24, bodyH = 176, timesH = 58 + 44, gap = 16, tipH = lead1 ? 84 : 0;
  const H = bandH + bodyH + timesH + (lead1 ? gap + tipH : 0) + 2;
  const cv = lib.createCanvas(W * S, H * S), c = cv.getContext("2d"); c.scale(S, S); c.lineCap = "round"; c.lineJoin = "round";
  c.textBaseline = "alphabetic"; c.textAlign = "left";
  const cardH = bandH + bodyH + timesH;
  // khung thẻ
  c.save(); c.shadowColor = "rgba(31,102,224,.16)"; c.shadowBlur = 14; c.shadowOffsetY = 5; rr(c, 1, 1, W - 2, cardH - 2, 20); c.fillStyle = "#FFFFFF"; c.fill(); c.restore();
  c.save(); rr(c, 1, 1, W - 2, cardH - 2, 20); c.clip();
  c.fillStyle = lin(c, 0, 0, W, bandH, ["#1B5FD9", "#3B8CF6"]); c.fillRect(0, 0, W, bandH);
  c.fillStyle = "#FFFFFF"; c.font = F(800, 18); c.textAlign = "center"; tLines.forEach((l, i) => c.fillText(l, W / 2, 30 + i * 24)); c.textAlign = "left";
  // vạch dọc giữa hình và điểm
  const splitX = Math.round(W * 0.44); c.fillStyle = "#D7E4F8"; c.fillRect(splitX, bandH + 18, 1, bodyH - 36);
  // hình bên trái: huy hiệu điểm tuân thủ (nếu có) hoặc vòng tỉ lệ đúng
  const cx = splitX / 2 + 4, cy = bandH + bodyH / 2;
  try {
    if (spec.comp != null) { const b = await art.heroFrom("compliance-" + spec.comp + ".webp"); if (b) { const im = await lib.loadImage(b); c.drawImage(im, cx - 92, cy - 70.5, 184, 141); } }
    else { const im = await lib.loadImage(await art.ring(spec.pct, spec.color)); c.drawImage(im, cx - 60, cy - 60, 120, 120); }
  } catch (e) { c.fillStyle = BL; c.font = F(800, 38); c.textAlign = "center"; c.fillText(Math.round(spec.pct) + "%", cx, cy + 12); c.textAlign = "left"; }
  // điểm + tỉ lệ + trạng thái
  const rx = splitX + 22, total = m.total || 0, score = attempt.score || 0;
  const sTop = bandH + 24;
  const sc = [{ t: score + "/" + total, f: F(800, 46), c: BL }, { t: " câu đúng", f: F(700, 17), c: NV }];
  runs(c, rx, sTop + 40, sc);
  runs(c, rx, sTop + 68, [{ t: "Tỉ lệ đúng: ", f: F(400, 16), c: GR }, { t: attempt.pct + "%", f: F(700, 16), c: BL }]);
  const sp = m.t.practice ? { bg: "#FFF1D6", fg: "#8A5200", mbg: "#D68F1E", mark: "!" } : m.ps === false ? { bg: "#FDE8E8", fg: "#D32F2F", mbg: "#E53935", mark: "x" } : m.ps === true ? { bg: "#E3F5EA", fg: "#17794A", mbg: "#18A957", mark: "v" } : { bg: "#E8F0FE", fg: BL, mbg: BL, mark: "v" };
  c.font = F(800, 15); const stW = c.measureText(m.status).width, pillW = 10 + 24 + 9 + stW + 16, pillY = sTop + 82;
  rr(c, rx, pillY, pillW, 38, 12); c.fillStyle = sp.bg; c.fill();
  c.beginPath(); c.arc(rx + 22, pillY + 19, 12, 0, Math.PI * 2); c.fillStyle = sp.mbg; c.fill();
  c.strokeStyle = "#FFFFFF"; c.fillStyle = "#FFFFFF"; c.lineWidth = 2.6; c.beginPath();
  const mx = rx + 22, my = pillY + 19;
  if (sp.mark === "v") { c.moveTo(mx - 5, my + 0.5); c.lineTo(mx - 1.5, my + 4); c.lineTo(mx + 5.5, my - 4); c.stroke(); }
  else if (sp.mark === "x") { c.moveTo(mx - 4.5, my - 4.5); c.lineTo(mx + 4.5, my + 4.5); c.moveTo(mx + 4.5, my - 4.5); c.lineTo(mx - 4.5, my + 4.5); c.stroke(); }
  else { c.font = F(800, 15); c.textAlign = "center"; c.fillText("!", mx, my + 5.5); c.textAlign = "left"; }
  c.fillStyle = sp.fg; c.font = F(800, 15); c.fillText(m.status, rx + 10 + 24 + 9, pillY + 24.5);
  c.restore();
  // hàng giờ giấc
  const ty = bandH + bodyH, tmParts = String(m.when || "").split(" "), tmT = (tmParts[0] || "").replace(/:\d{2}$/, ""), tmD = tmParts[1] || "";
  c.save(); rr(c, 14, ty - 6, W - 28, 44, 14); c.fillStyle = "#F0F6FF"; c.fill(); c.restore();
  const cells = [];
  if (m.dur != null) cells.push({ ic: "clock", parts: [{ t: "Làm bài trong: ", f: F(400, 14), c: GR }, { t: E.clock ? E.clock(m.dur) : clockOf(m.dur), f: F(700, 14), c: BL }] });
  cells.push({ ic: "cal", parts: [{ t: "Nộp lúc: ", f: F(400, 14), c: GR }, { t: tmT, f: F(700, 14), c: BL }, { t: " - " + tmD, f: F(700, 14), c: NV }] });
  const cw = (W - 28) / cells.length;
  for (let i = 0; i < cells.length; i++) {
    const x0 = 14 + i * cw, tw = runsW(c, cells[i].parts), ix = x0 + (cw - (24 + tw)) / 2;
    const im = await lib.loadImage(await art.icon(cells[i].ic)); c.drawImage(im, ix, ty + 5, 22, 22);
    runs(c, ix + 26, ty + 21, cells[i].parts);
    if (i < cells.length - 1) { c.fillStyle = "#D7E4F8"; c.fillRect(x0 + cw, ty - 2, 1, 36); }
  }
  // số lần thoát khỏi màn hình khi làm bài (ghi nhận lúc thí sinh rời tab / chuyển ứng dụng rồi quay lại)
  const leaves = Math.max(0, Math.round(Number(attempt.flags && attempt.flags.blur) || 0)), warnL = leaves >= 3, ly = ty + 44;
  c.save(); rr(c, 14, ly - 6, W - 28, 38, 14); c.fillStyle = warnL ? "#FFF4E0" : "#F0F6FF"; c.fill(); c.restore();
  const lcol = warnL ? "#B45309" : BL, lparts = [{ t: "Số lần thoát khỏi màn hình khi làm bài: ", f: F(400, 14), c: GR }, { t: leaves + " lần", f: F(800, 14), c: lcol }];
  const lw = runsW(c, lparts), lx = 14 + (W - 28 - (26 + lw)) / 2;
  c.save(); c.strokeStyle = lcol; c.lineWidth = 1.8; c.beginPath(); c.moveTo(lx + 1, ly + 14); c.quadraticCurveTo(lx + 11, ly + 3, lx + 21, ly + 14); c.quadraticCurveTo(lx + 11, ly + 25, lx + 1, ly + 14); c.stroke();
  c.beginPath(); c.arc(lx + 11, ly + 14, 3.2, 0, Math.PI * 2); c.stroke();
  if (leaves > 0) { c.beginPath(); c.moveTo(lx + 3, ly + 24); c.lineTo(lx + 19, ly + 4); c.stroke(); } c.restore();
  runs(c, lx + 28, ly + 19, lparts);
  // hộp nhận xét theo đạt / chưa đạt
  if (lead1) {
    const by = cardH + gap;
    c.save(); rr(c, 1, by, W - 2, tipH, 16); c.fillStyle = "#EAF2FF"; c.fill(); c.lineWidth = 1; c.strokeStyle = "#D6E5FA"; c.stroke(); c.restore();
    c.fillStyle = "#C9DAF5"; c.fillRect(73, by + 14, 1, tipH - 28);
    try { const im = await lib.loadImage(await art.bookBlue()); c.drawImage(im, 16, by + (tipH - 42) / 2, 42, 42); } catch (e) { /* thiếu biểu tượng: bỏ qua */ }
    c.font = F(800, 16); const l1 = wrap(c, lead1, W - 110).slice(0, 2); c.font = F(400, 15); const l2 = wrap(c, lead2, W - 110).slice(0, 2);
    const th = l1.length * 23 + l2.length * 22; let yy = by + (tipH - th) / 2 + 17;
    c.fillStyle = NV; c.font = F(800, 16); l1.forEach((l) => { c.fillText(l, 90, yy); yy += 23; });
    c.fillStyle = GR; c.font = F(400, 15); l2.forEach((l) => { c.fillText(l, 90, yy); yy += 22; });
  }
  return { png: await cv.encode("png"), width: W, height: H };
}
function clockOf(sec) { const s = Math.max(0, Math.round(sec)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }

module.exports = { card };
