// Hình minh hoạ cho EMAIL KẾT QUẢ (logo, ảnh đầu thư, vòng tỉ lệ đúng, biểu tượng, bóng đèn, sách + mũ tốt nghiệp).
// Vẽ bằng @napi-rs/canvas ở máy chủ (gấp 2 lần kích thước hiển thị cho màn hình nét) rồi đính kèm nội tuyến (cid),
// nên không phụ thuộc ảnh lưu trên web và không bị Gmail lọc như SVG. Ảnh tĩnh được nhớ đệm; chỉ vòng tỉ lệ và
// huy hiệu trạng thái (đạt / chưa đạt) vẽ theo từng bài. Thiếu thư viện / phông thì ném lỗi để email gửi bản không ảnh.
const path = require("path");

let L = null;
function load() {
  if (L) return L;
  const lib = require("@napi-rs/canvas");
  const dir = path.join(__dirname, "fonts");
  ["Regular", "SemiBold", "Bold", "ExtraBold"].forEach((w) => {
    if (!lib.GlobalFonts.registerFromPath(path.join(dir, "BeVietnamPro-" + w + ".ttf"), "Be Vietnam Pro")) throw new Error("Không nạp được phông " + w);
  });
  L = lib;
  return L;
}
const F = '"Be Vietnam Pro",Arial,sans-serif';
const BLUE = "#1F6FE5", NAVY = "#0F2A5C";

function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function lin(c, x0, y0, x1, y1, stops) { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach((s, i) => (typeof s === "string" ? g.addColorStop(i / (stops.length - 1), s) : g.addColorStop(s[0], s[1]))); return g; }
function canvas(w, h, s) { const cv = load().createCanvas(Math.round(w * s), Math.round(h * s)), c = cv.getContext("2d"); c.scale(s, s); c.lineCap = "round"; c.lineJoin = "round"; return { cv, c }; }
const png = (o) => o.cv.encode("png");

// Bảng ghi có tick (dùng cho ảnh đầu thư và thẻ "Kết quả bài làm")
function clipboard(c, x, y, w, h, rows) {
  c.save();
  c.shadowColor = "rgba(10,40,110,.28)"; c.shadowBlur = w * 0.12; c.shadowOffsetY = w * 0.05;
  rr(c, x, y, w, h, w * 0.09); c.fillStyle = lin(c, x, y, x + w, y + h, ["#5B9BFF", "#1D5FD8"]); c.fill();
  c.restore();
  const m = w * 0.08; rr(c, x + m, y + m * 1.3, w - 2 * m, h - m * 2.2, w * 0.05); c.fillStyle = lin(c, x, y, x, y + h, ["#FFFFFF", "#E8F0FF"]); c.fill();
  // kẹp giấy
  const cw = w * 0.42, cx = x + (w - cw) / 2; rr(c, cx, y - h * 0.04, cw, h * 0.11, h * 0.03); c.fillStyle = lin(c, cx, 0, cx + cw, 0, ["#7DB2FF", "#3F7EEA"]); c.fill();
  c.beginPath(); c.arc(x + w / 2, y - h * 0.05, w * 0.07, Math.PI, 0); c.lineWidth = w * 0.035; c.strokeStyle = "#3F7EEA"; c.stroke();
  const top = y + h * 0.2, gap = (h * 0.68) / rows, b = Math.min(w * 0.16, gap * 0.62);
  for (let i = 0; i < rows; i++) {
    const by = top + i * gap;
    rr(c, x + m * 1.8, by, b, b, b * 0.22); c.fillStyle = "#2E74EE"; c.fill();
    c.beginPath(); c.moveTo(x + m * 1.8 + b * 0.24, by + b * 0.52); c.lineTo(x + m * 1.8 + b * 0.43, by + b * 0.72); c.lineTo(x + m * 1.8 + b * 0.78, by + b * 0.3);
    c.lineWidth = b * 0.15; c.strokeStyle = "#fff"; c.stroke();
    const lx = x + m * 1.8 + b * 1.4, lw = w - (lx - x) - m * 1.9;
    rr(c, lx, by + b * 0.18, lw, b * 0.2, b * 0.1); c.fillStyle = "#9CC1FF"; c.fill();
    rr(c, lx, by + b * 0.58, lw * 0.62, b * 0.17, b * 0.08); c.fillStyle = "#CFE0FF"; c.fill();
  }
}

// Ảnh đầu thư: biểu đồ cột + bảng ghi + bia ngắm có mũi tên (nền trong suốt, đặt trên dải xanh)
function hero() {
  const W = 260, H = 200, o = canvas(W, H, 2), c = o.c;
  // vệt sáng
  c.beginPath(); c.ellipse(140, 170, 125, 26, -0.12, 0, Math.PI * 2); c.fillStyle = "rgba(120,190,255,.32)"; c.fill();
  c.beginPath(); c.ellipse(150, 176, 100, 14, -0.12, 0, Math.PI * 2); c.fillStyle = "rgba(190,230,255,.35)"; c.fill();
  // cột
  [[20, 120, 40], [44, 100, 60], [68, 72, 88]].forEach((b) => { rr(c, b[0], b[1], 20, b[2], 4); c.fillStyle = lin(c, 0, b[1], 0, b[1] + b[2], ["rgba(220,240,255,.98)", "rgba(140,195,255,.75)"]); c.fill(); });
  // bảng ghi (nghiêng nhẹ)
  c.save(); c.translate(150, 96); c.rotate(-0.08); clipboard(c, -58, -76, 116, 150, 3); c.restore();
  // bia ngắm
  const tx = 196, ty = 134;
  c.save(); c.shadowColor = "rgba(10,40,110,.35)"; c.shadowBlur = 14; c.shadowOffsetY = 6;
  c.beginPath(); c.arc(tx, ty, 44, 0, Math.PI * 2); c.fillStyle = "#1E5FD6"; c.fill(); c.restore();
  [[40, "#2F7BF0"], [32, "#FFFFFF"], [24, "#2F7BF0"], [16, "#FFFFFF"], [8, "#1D5FD8"]].forEach((r) => { c.beginPath(); c.arc(tx, ty, r[0], 0, Math.PI * 2); c.fillStyle = r[1]; c.fill(); });
  // mũi tên
  c.beginPath(); c.moveTo(tx + 2, ty - 2); c.lineTo(tx + 34, ty - 34); c.lineWidth = 4.5; c.strokeStyle = "#8A5A12"; c.stroke();
  c.beginPath(); c.moveTo(tx + 28, ty - 40); c.lineTo(tx + 44, ty - 58); c.lineTo(tx + 52, ty - 40); c.lineTo(tx + 40, ty - 28); c.closePath(); c.fillStyle = "#FFB020"; c.fill();
  c.beginPath(); c.moveTo(tx + 34, ty - 46); c.lineTo(tx + 46, ty - 52); c.lineTo(tx + 46, ty - 36); c.closePath(); c.fillStyle = "#FFD25A"; c.fill();
  return png(o);
}

// Vòng tỉ lệ trả lời đúng (chữ số nằm trong ảnh; alt của thẻ img mang cùng nội dung)
function ring(pct, color) {
  const W = 230, H = 230, o = canvas(W, H, 2), c = o.c, cx = W / 2, cy = 104, R = 84;
  // bệ
  c.beginPath(); c.ellipse(cx, 200, 100, 18, 0, 0, Math.PI * 2); c.fillStyle = lin(c, 0, 186, 0, 218, ["#5EA2FF", "#1F5FD6"]); c.fill();
  c.beginPath(); c.ellipse(cx, 194, 86, 12, 0, 0, Math.PI * 2); c.fillStyle = "#D9EAFF"; c.fill();
  c.beginPath(); c.ellipse(cx, 194, 60, 7, 0, 0, Math.PI * 2); c.fillStyle = "#FFFFFF"; c.fill();
  // nền vòng
  c.save(); c.shadowColor = "rgba(30,80,170,.18)"; c.shadowBlur = 18; c.shadowOffsetY = 6;
  c.beginPath(); c.arc(cx, cy, R + 12, 0, Math.PI * 2); c.fillStyle = "#EEF4FD"; c.fill(); c.restore();
  c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.lineWidth = 16; c.strokeStyle = "#DCE6F4"; c.stroke();
  const p = Math.max(0, Math.min(100, pct)) / 100;
  if (p > 0) { c.beginPath(); c.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p); c.lineWidth = 16; c.lineCap = p >= 1 ? "butt" : "butt"; c.strokeStyle = color; c.stroke(); }
  c.beginPath(); c.arc(cx, cy, R - 10, 0, Math.PI * 2); c.fillStyle = "#FFFFFF"; c.fill();
  c.textAlign = "center"; c.textBaseline = "alphabetic"; c.fillStyle = color;
  const s = Math.round(pct) + "%"; c.font = "800 " + (s.length > 3 ? 46 : 54) + "px " + F; c.fillText(s, cx, cy + 10);
  c.font = "500 13.5px " + F; c.fillStyle = NAVY; c.fillText("Tỉ lệ trả lời đúng", cx, cy + 36);
  return png(o);
}

// Bảng ghi nhỏ + huy hiệu trạng thái (✕ đỏ / ✓ xanh lá / không huy hiệu)
function resultBadge(state) {
  const W = 104, H = 104, o = canvas(W, H, 2), c = o.c;
  c.save(); c.translate(48, 50); c.rotate(0.06); clipboard(c, -32, -38, 64, 80, 3); c.restore();
  if (state === true || state === false) {
    const bx = 80, by = 76, col = state ? "#18A957" : "#F0394A";
    c.save(); c.shadowColor = "rgba(0,0,0,.25)"; c.shadowBlur = 8; c.shadowOffsetY = 3;
    c.beginPath(); c.arc(bx, by, 19, 0, Math.PI * 2); c.fillStyle = col; c.fill(); c.restore();
    c.beginPath(); c.arc(bx, by, 19, 0, Math.PI * 2); c.lineWidth = 2.5; c.strokeStyle = "#fff"; c.stroke();
    c.lineWidth = 4.5; c.strokeStyle = "#fff"; c.beginPath();
    if (state) { c.moveTo(bx - 8, by + 1); c.lineTo(bx - 2, by + 7); c.lineTo(bx + 9, by - 6); }
    else { c.moveTo(bx - 7, by - 7); c.lineTo(bx + 7, by + 7); c.moveTo(bx + 7, by - 7); c.lineTo(bx - 7, by + 7); }
    c.stroke();
  }
  return png(o);
}

// Logo: ô vuông xanh có danh sách tick + bút
function logo() {
  const S = 48, o = canvas(S, S, 2), c = o.c;
  rr(c, 4, 6, 36, 40, 7); c.fillStyle = lin(c, 4, 6, 40, 46, ["#4C93FF", "#145AD6"]); c.fill();
  rr(c, 14, 3, 16, 7, 3); c.fillStyle = "#8DBBFF"; c.fill();
  c.strokeStyle = "#fff"; c.lineWidth = 2.6;
  [16, 25, 34].forEach((y) => { c.beginPath(); c.arc(11.5, y, 1.6, 0, Math.PI * 2); c.fillStyle = "#fff"; c.fill(); c.beginPath(); c.moveTo(17, y); c.lineTo(31, y); c.stroke(); });
  c.save(); c.translate(36, 36); c.rotate(Math.PI / 4);
  rr(c, -3.5, -16, 7, 22, 2); c.fillStyle = "#2A6CE6"; c.fill(); c.lineWidth = 1.6; c.strokeStyle = "#fff"; c.stroke();
  c.beginPath(); c.moveTo(-3.5, 6); c.lineTo(0, 11); c.lineTo(3.5, 6); c.closePath(); c.fillStyle = "#fff"; c.fill();
  c.restore();
  return png(o);
}

// Biểu tượng nét (26 px hiển thị)
function icon(kind, color) {
  const S = 26, o = canvas(S, S, 3), c = o.c; c.strokeStyle = color || BLUE; c.fillStyle = color || BLUE; c.lineWidth = 2;
  const st = () => c.stroke();
  if (kind === "user") { c.beginPath(); c.arc(13, 8.5, 4.6, 0, Math.PI * 2); st(); c.beginPath(); c.moveTo(4.5, 23); c.quadraticCurveTo(4.5, 15, 13, 15); c.quadraticCurveTo(21.5, 15, 21.5, 23); c.closePath(); st(); }
  else if (kind === "id") { rr(c, 2.5, 5, 21, 16, 3); st(); rr(c, 6, 9.5, 6, 7, 1); c.fill(); [10.5, 14, 17.5].forEach((y, i) => { c.beginPath(); c.moveTo(14.5, y); c.lineTo(i === 2 ? 18 : 20, y); st(); }); }
  else if (kind === "target") { [10.5, 6.5, 2.6].forEach((r) => { c.beginPath(); c.arc(12, 14, r, 0, Math.PI * 2); st(); }); c.beginPath(); c.moveTo(12, 14); c.lineTo(22, 4); st(); c.beginPath(); c.moveTo(18.5, 3.5); c.lineTo(22, 4); c.lineTo(22.5, 7.5); st(); }
  else if (kind === "clip") { rr(c, 4.5, 4.5, 17, 19, 2.5); st(); rr(c, 9, 2.5, 8, 4, 1.5); c.fillStyle = "#fff"; c.fill(); st(); [[11.5], [16.5]].forEach((y) => { c.beginPath(); c.moveTo(8, y[0]); c.lineTo(9.5, y[0] + 1.6); c.lineTo(12, y[0] - 1.4); st(); c.beginPath(); c.moveTo(14, y[0]); c.lineTo(18.5, y[0]); st(); }); }
  else if (kind === "clock") { c.beginPath(); c.arc(13, 15, 9, 0, Math.PI * 2); st(); c.beginPath(); c.moveTo(10, 2.5); c.lineTo(16, 2.5); c.moveTo(13, 2.5); c.lineTo(13, 6); c.moveTo(20, 7.5); c.lineTo(21.8, 5.8); st(); c.beginPath(); c.moveTo(13, 15); c.lineTo(13, 10); c.moveTo(13, 15); c.lineTo(16.5, 17); st(); }
  else if (kind === "cal") { rr(c, 3, 5, 20, 18, 3); st(); c.beginPath(); c.moveTo(3, 10.5); c.lineTo(23, 10.5); c.moveTo(8.5, 2.5); c.lineTo(8.5, 7); c.moveTo(17.5, 2.5); c.lineTo(17.5, 7); st(); for (let r = 0; r < 2; r++) for (let q = 0; q < 3; q++) { rr(c, 6.5 + q * 5, 13.5 + r * 4.5, 3, 2.6, 0.6); c.fill(); } }
  else if (kind === "book") { c.lineWidth = 2.2; c.beginPath(); c.moveTo(13, 6.5); c.quadraticCurveTo(8, 4, 2.5, 5); c.lineTo(2.5, 21); c.quadraticCurveTo(8, 20, 13, 22.5); c.quadraticCurveTo(18, 20, 23.5, 21); c.lineTo(23.5, 5); c.quadraticCurveTo(18, 4, 13, 6.5); c.lineTo(13, 22.5); st(); [10, 14].forEach((y) => { c.beginPath(); c.moveTo(5.5, y); c.lineTo(10, y + 0.6); c.moveTo(16, y + 0.6); c.lineTo(20.5, y); st(); }); }
  return png(o);
}

// Bóng đèn ý tưởng có tia sáng
function bulb() {
  const W = 84, H = 84, o = canvas(W, H, 2), c = o.c, cx = 42, cy = 36;
  c.save(); c.shadowColor = "rgba(255,190,40,.55)"; c.shadowBlur = 16;
  c.beginPath(); c.arc(cx, cy, 21, Math.PI * 0.8, Math.PI * 2.2); c.quadraticCurveTo(cx + 13, cy + 22, cx + 9, cy + 28); c.lineTo(cx - 9, cy + 28); c.quadraticCurveTo(cx - 13, cy + 22, cx - 17, cy + 12.5); c.closePath();
  c.fillStyle = lin(c, cx - 20, cy - 20, cx + 20, cy + 26, ["#FFF07A", "#FFC21A", "#FF9A00"]); c.fill(); c.restore();
  c.beginPath(); c.ellipse(cx - 8, cy - 8, 5, 8, 0.5, 0, Math.PI * 2); c.fillStyle = "rgba(255,255,255,.7)"; c.fill();
  [[0, "#8E9AAE"], [5, "#6E7A90"], [10, "#8E9AAE"]].forEach((b) => { rr(c, cx - 10, cy + 29 + b[0], 20, 4.5, 2); c.fillStyle = b[1]; c.fill(); });
  c.beginPath(); c.arc(cx, cy + 44, 4.5, 0, Math.PI); c.fillStyle = "#5E6A80"; c.fill();
  c.strokeStyle = "#FFB61E"; c.lineWidth = 2.6;
  [[-Math.PI / 2, 30, 36], [-Math.PI * 0.82, 29, 35], [-Math.PI * 0.18, 29, 35], [Math.PI, 30, 36], [0, 30, 36]].forEach((r) => { c.beginPath(); c.moveTo(cx + Math.cos(r[0]) * r[1], cy + Math.sin(r[0]) * r[1]); c.lineTo(cx + Math.cos(r[0]) * r[2], cy + Math.sin(r[0]) * r[2]); c.stroke(); });
  const spark = (x, y, s) => { c.beginPath(); c.moveTo(x, y - s); c.quadraticCurveTo(x, y, x + s, y); c.quadraticCurveTo(x, y, x, y + s); c.quadraticCurveTo(x, y, x - s, y); c.quadraticCurveTo(x, y, x, y - s); c.fillStyle = "#FFC21A"; c.fill(); };
  spark(10, 18, 5); spark(12, 62, 5.5); spark(74, 12, 4);
  return png(o);
}

// Chồng sách + mũ tốt nghiệp
function grad() {
  const W = 220, H = 120, o = canvas(W, H, 2), c = o.c;
  c.beginPath(); c.ellipse(108, 108, 96, 10, 0, 0, Math.PI * 2); c.fillStyle = "rgba(60,130,230,.18)"; c.fill();
  const book = (x, y, w, h, cover, page) => { rr(c, x, y, w, h, 5); c.fillStyle = cover; c.fill(); rr(c, x + w - 16, y + 4, 12, h - 8, 3); c.fillStyle = page; c.fill(); c.strokeStyle = "rgba(0,0,0,.08)"; c.lineWidth = 1; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(x + w - 16, y + 4 + i * (h - 8) / 4); c.lineTo(x + w - 4, y + 4 + i * (h - 8) / 4); c.stroke(); } };
  book(14, 82, 168, 22, lin(c, 0, 82, 0, 104, ["#FFC94A", "#F2A413"]), "#FFF6DC");
  book(24, 62, 150, 21, lin(c, 0, 62, 0, 83, ["#4F95FF", "#1D5FD8"]), "#EEF4FF");
  book(36, 43, 128, 20, lin(c, 0, 43, 0, 63, ["#7DB6FF", "#3F7EEA"]), "#FFFFFF");
  // mũ
  c.save(); c.shadowColor = "rgba(10,30,90,.35)"; c.shadowBlur = 10; c.shadowOffsetY = 4;
  c.beginPath(); c.moveTo(60, 36); c.lineTo(66, 22); c.lineTo(134, 22); c.lineTo(140, 36); c.quadraticCurveTo(100, 50, 60, 36); c.fillStyle = "#14318A"; c.fill(); c.restore();
  c.beginPath(); c.moveTo(100, 2); c.lineTo(166, 20); c.lineTo(100, 38); c.lineTo(34, 20); c.closePath(); c.fillStyle = lin(c, 34, 2, 166, 38, ["#3D6FE0", "#1A3D9E"]); c.fill();
  c.beginPath(); c.arc(100, 20, 3.5, 0, Math.PI * 2); c.fillStyle = "#FFC21A"; c.fill();
  c.beginPath(); c.moveTo(100, 20); c.lineTo(150, 30); c.lineTo(152, 56); c.lineWidth = 2.2; c.strokeStyle = "#FFC21A"; c.stroke();
  c.beginPath(); c.moveTo(147, 56); c.lineTo(157, 56); c.lineTo(159, 74); c.lineTo(145, 74); c.closePath(); c.fillStyle = "#FFB61E"; c.fill();
  return png(o);
}

// Ảnh đầu thư khi CHƯA ĐẠT: ảnh "Chưa đạt" (assets/fail-photo.webp) đặt gọn trong khung cùng cỡ ảnh đầu thư thường
let failHero; // undefined: chưa dựng; null: lỗi (dùng ảnh đầu thư thường)
async function heroFail() {
  if (failHero !== undefined) return failHero;
  try {
    const im = await load().loadImage(path.join(__dirname, "assets", "fail-photo.webp"));
    const W = 260, H = 200, o = canvas(W, H, 2), c = o.c, k = Math.min(W / im.width, H / im.height) * 0.98;
    const w = im.width * k, h = im.height * k;
    c.drawImage(im, (W - w) / 2 + 6, H - h, w, h);
    failHero = await png(o);
  } catch (e) { failHero = null; }
  return failHero;
}

let cache = null;
// Trả về { atts: [tệp đính kèm nội tuyến], cid: { khoá: mã cid } }
async function render(pct, state, ringColor) {
  load();
  if (!cache) {
    const icons = {};
    for (const k of ["user", "id", "target", "clip", "clock", "cal"]) icons["ic-" + k] = await icon(k);
    icons["ic-book"] = await icon("book", "#FFFFFF");
    cache = Object.assign({ logo: await logo(), hero: await hero(), bulb: await bulb(), grad: await grad() }, icons);
  }
  const all = Object.assign({}, cache, { ring: await ring(pct, ringColor), badge: await resultBadge(state) });
  if (state === false) { const fh = await heroFail(); if (fh) all.hero = fh; }
  const atts = [], cid = {};
  Object.keys(all).forEach((k) => {
    cid[k] = k + "@ketqua.kiemtra";
    atts.push({ filename: k + ".png", content: all[k], contentType: "image/png", cid: cid[k], contentDisposition: "inline" });
  });
  return { atts, cid };
}

module.exports = { render, hero };
