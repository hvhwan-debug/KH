// Hình cho EMAIL MỜI chương trình học (theo mẫu "Thư mời tham gia" của Đào tạo Kinh doanh GT):
//  - hero(p): ảnh đầu thư 1200x440: ảnh bàn làm việc (assets/invite-desk.jpg) + lớp sáng bên trái + nhãn "THƯ MỜI THAM GIA"
//    + tên chương trình + khẩu hiệu + chữ viết tay "Học để phát triển cùng nhau". Ghép sẵn thành ảnh vì Outlook không hỗ trợ
//    ảnh nền có chữ đè lên; tên chương trình vẫn có trong alt và phần chữ của email.
//  - icons(): bộ biểu tượng xanh dạng PNG (Gmail chặn SVG): lịch, ghim, nhóm người, đồng hồ, điện thoại, bóng đèn, biểu đồ, cộng đồng, mục tiêu.
// Gửi kèm nội tuyến (cid). Ảnh được nhớ đệm.
const path = require("path");
const BLUE = "#1559C4", NAVY = "#0B2A6B", INK = "#1F3B6E";
let L = null;
function lib() {
  if (L) return L;
  L = require("@napi-rs/canvas");
  const dir = path.join(__dirname, "fonts");
  ["Regular", "Medium", "SemiBold", "Bold", "ExtraBold"].forEach((w) => L.GlobalFonts.registerFromPath(path.join(dir, "BeVietnamPro-" + w + ".ttf"), "Be Vietnam Pro"));
  L.GlobalFonts.registerFromPath(path.join(dir, "DancingScript.ttf"), "Dancing Script");
  return L;
}
const F = (w, s) => w + " " + s + 'px "Be Vietnam Pro"';
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function wrap(c, text, maxW) {
  const words = String(text || "").split(/\s+/).filter(Boolean), lines = []; let cur = "";
  words.forEach((w) => { const t = cur ? cur + " " + w : w; if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
  if (cur) lines.push(cur);
  return lines;
}

let BG = null; const HC = new Map();
async function hero(p) {
  const key = (p.title || "") + "|" + (p.tagline || "") + "|" + (p.label || "") + "|" + (Array.isArray(p.script) ? p.script.join("/") : "");
  if (HC.has(key)) return HC.get(key);
  const out = await drawHero(p);
  if (HC.size > 40) HC.clear(); HC.set(key, out);
  return out;
}
async function drawHero(p) {
  const { createCanvas, loadImage } = lib();
  if (!BG) BG = await loadImage(path.join(__dirname, "assets", "invite-desk.jpg"));
  const W = 1200, H = 440, cv = createCanvas(W, H), c = cv.getContext("2d");
  // ảnh nền: phủ kín, lệch về phía laptop (phải, dưới)
  // ảnh nền rộng bằng khung, đẩy sang phải và giữ phần bàn (dưới): bên trái là tường sáng để đặt chữ, giống mẫu
  const s = W / BG.width * 1.02, bw = BG.width * s, bh = BG.height * s;
  c.fillStyle = "#EEF4FC"; c.fillRect(0, 0, W, H);
  c.drawImage(BG, 170, H - bh + 70, bw, bh);
  // lớp sáng bên trái cho chữ dễ đọc
  const g = c.createLinearGradient(0, 0, W * 0.72, 0);
  g.addColorStop(0, "rgba(236,244,255,0.97)"); g.addColorStop(0.55, "rgba(236,244,255,0.88)"); g.addColorStop(1, "rgba(236,244,255,0)");
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // nhãn
  const X = 64; c.font = F(700, 21); const lab = String(p.label || "THƯ MỜI THAM GIA").slice(0, 28), lw = c.measureText(lab).width + 36;
  rr(c, X, 46, lw, 44, 12); c.fillStyle = "rgba(21,89,196,0.12)"; c.fill(); c.fillStyle = BLUE; c.textBaseline = "middle"; c.fillText(lab, X + 18, 69);
  // tên chương trình: tự thu nhỏ để vừa tối đa 3 dòng
  const maxW = 600; let size = 54, lines;
  for (; size >= 34; size -= 2) { c.font = F(800, size); lines = wrap(c, p.title, maxW); if (lines.length <= 3) break; }
  if (lines.length > 3) { lines = lines.slice(0, 3); lines[2] = lines[2].replace(/\s*\S*$/, "") + "…"; }
  c.fillStyle = NAVY; c.textBaseline = "alphabetic"; const lh = size * 1.18; let y = 112 + size;
  lines.forEach((l) => { c.fillText(l, X, y); y += lh; });
  // khẩu hiệu
  const tag = p.tagline || "Cùng nâng cao kiến thức – Tăng tự tin – Bứt phá doanh số";
  c.font = F(400, 24); c.fillStyle = "#3D5A8A";
  wrap(c, tag, 640).slice(0, 2).forEach((l, i) => c.fillText(l, X, y + 14 + i * 34));
  // chữ viết tay
  c.save(); c.translate(880, 78); c.rotate(-0.16); c.fillStyle = BLUE; c.font = '600 40px "Dancing Script"';
  const sc = Array.isArray(p.script) && p.script.length ? p.script.slice(0, 3) : ["Học để", "phát triển", "cùng nhau"];
  sc.forEach((t, i) => c.fillText(String(t).slice(0, 14), i === 2 ? 22 : 0, i * 44));
  c.beginPath(); c.moveTo(40, 118); c.quadraticCurveTo(130, 100, 215, 98); c.lineWidth = 3.5; c.strokeStyle = BLUE; c.lineCap = "round"; c.stroke();
  c.restore();
  return cv.encode("jpeg", 88);
}

// ---------- biểu tượng ----------
function icon(name, size) {
  const { createCanvas } = lib(), S = size || 96, cv = createCanvas(S, S), c = cv.getContext("2d");
  c.scale(S / 48, S / 48); c.strokeStyle = BLUE; c.fillStyle = BLUE; c.lineWidth = 2.6; c.lineCap = "round"; c.lineJoin = "round";
  const circle = (x, y, r, fill) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); fill ? c.fill() : c.stroke(); };
  switch (name) {
    case "calendar":
      rr(c, 6, 9, 36, 33, 6); c.fill(); c.fillStyle = "#fff"; rr(c, 9.5, 17, 29, 21.5, 3); c.fill();
      c.fillStyle = BLUE; rr(c, 13, 4, 4.5, 10, 2.2); c.fill(); rr(c, 30.5, 4, 4.5, 10, 2.2); c.fill();
      [[16, 24], [24, 24], [32, 24], [16, 32], [24, 32]].forEach((d) => circle(d[0], d[1], 2.3, true)); break;
    case "pin":
      c.beginPath(); c.moveTo(24, 45); c.bezierCurveTo(16, 35, 9, 27, 9, 19); c.arc(24, 19, 15, Math.PI, 0); c.bezierCurveTo(39, 27, 32, 35, 24, 45); c.fill();
      c.fillStyle = "#fff"; circle(24, 19, 6, true); break;
    case "people":
      circle(24, 14, 6.5, true); circle(11, 17, 5, true); circle(37, 17, 5, true);
      c.beginPath(); c.moveTo(12, 40); c.quadraticCurveTo(12, 24, 24, 24); c.quadraticCurveTo(36, 24, 36, 40); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(2, 37); c.quadraticCurveTo(2, 25, 11, 25); c.quadraticCurveTo(15, 25, 16, 27); c.quadraticCurveTo(11, 31, 11, 37); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(46, 37); c.quadraticCurveTo(46, 25, 37, 25); c.quadraticCurveTo(33, 25, 32, 27); c.quadraticCurveTo(37, 31, 37, 37); c.closePath(); c.fill(); break;
    case "clock":
      c.lineWidth = 3; circle(24, 24, 18); c.beginPath(); c.moveTo(24, 14); c.lineTo(24, 24); c.lineTo(31, 28); c.stroke(); break;
    case "phone":
      c.fillStyle = "#E3EEFC"; circle(24, 24, 23, true); c.fillStyle = BLUE;
      c.beginPath(); c.moveTo(16, 13); c.quadraticCurveTo(18, 11, 20, 13); c.lineTo(23, 18); c.quadraticCurveTo(24, 20, 22, 22); c.lineTo(21, 23);
      c.quadraticCurveTo(23, 28, 27, 29); c.lineTo(28, 28); c.quadraticCurveTo(30, 26, 32, 27); c.lineTo(36, 30); c.quadraticCurveTo(38, 32, 36, 34);
      c.lineTo(34, 36); c.quadraticCurveTo(29, 39, 21, 32); c.quadraticCurveTo(12, 23, 14, 16); c.closePath(); c.fill(); break;
    case "bulb":
      c.beginPath(); c.arc(24, 21, 10, Math.PI * 0.82, Math.PI * 2.18); c.lineTo(28.5, 34); c.lineTo(19.5, 34); c.closePath(); c.stroke();
      c.beginPath(); c.moveTo(20, 38.5); c.lineTo(28, 38.5); c.moveTo(21.5, 42.5); c.lineTo(26.5, 42.5); c.stroke();
      [[24, 3, 24, 6.5], [9, 9, 11.5, 11.5], [39, 9, 36.5, 11.5], [3, 21, 7, 21], [45, 21, 41, 21]].forEach((l) => { c.beginPath(); c.moveTo(l[0], l[1]); c.lineTo(l[2], l[3]); c.stroke(); }); break;
    case "chart":
      [[9, 8], [17, 13], [25, 18], [33, 24]].forEach((b) => { rr(c, b[0], 41 - b[1], 5.5, b[1], 1.5); c.fill(); });
      c.beginPath(); c.moveTo(7, 24); c.lineTo(17, 15); c.lineTo(24, 19); c.lineTo(40, 6); c.stroke();
      c.beginPath(); c.moveTo(33, 6); c.lineTo(40, 6); c.lineTo(40, 13); c.stroke(); c.beginPath(); c.moveTo(5, 44.5); c.lineTo(43, 44.5); c.stroke(); break;
    case "group":
      circle(24, 12, 5); circle(11, 17, 4.2); circle(37, 17, 4.2);
      c.beginPath(); c.moveTo(14, 37); c.quadraticCurveTo(14, 22, 24, 22); c.quadraticCurveTo(34, 22, 34, 37); c.closePath(); c.stroke();
      c.beginPath(); c.moveTo(3, 34); c.quadraticCurveTo(3, 24, 11, 24); c.moveTo(45, 34); c.quadraticCurveTo(45, 24, 37, 24); c.stroke();
      c.beginPath(); c.moveTo(3, 34); c.lineTo(10, 34); c.moveTo(45, 34); c.lineTo(38, 34); c.stroke(); break;
    case "target":
      circle(22, 26, 18); circle(22, 26, 11); circle(22, 26, 4, true);
      c.beginPath(); c.moveTo(22, 26); c.lineTo(40, 8); c.stroke(); c.beginPath(); c.moveTo(35, 7); c.lineTo(41, 2); c.lineTo(42, 7); c.lineTo(47, 8); c.lineTo(41, 13); c.lineTo(36, 12); c.closePath(); c.fill(); break;
  }
  return cv.encode("png");
}
const NAMES = ["calendar", "pin", "people", "clock", "phone", "bulb", "chart", "group", "target"];
let ICONS = null;
async function icons() {
  if (ICONS) return ICONS;
  lib(); const out = {};
  for (const n of NAMES) out[n] = await icon(n, n === "phone" ? 104 : 96);
  ICONS = out; return out;
}
// ---------- thẻ thông tin chương trình (vẽ lại MỖI LẦN người nhận mở thư, theo dữ liệu mới nhất) ----------
// p: chương trình hiện tại; st: { taken, state: "open"|"closed"|"expired"|"full"|"gone" }
const SP = (s) => { const x = String(s || "").split("|").map((v) => v.trim()).filter(Boolean); return { main: x[0] || "", sub: x.slice(1).join(" · ") }; };
function vnTime(ms) { const d = new Date(ms + 7 * 3600e3), p = (n) => String(n).padStart(2, "0"); return p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + " ngày " + p(d.getUTCDate()) + "/" + p(d.getUTCMonth() + 1) + "/" + d.getUTCFullYear(); }
function leftText(ms) { const d = ms - Date.now(); if (d <= 0) return ""; const days = Math.floor(d / 864e5), h = Math.floor(d / 36e5); return days >= 1 ? "còn " + days + " ngày" : h >= 1 ? "chỉ còn " + h + " giờ" : "sắp hết hạn"; }
async function infoCard(p, st) {
  const { createCanvas, loadImage } = lib(), I = await icons(), W = 720, PADX = 34;
  st = st || {};
  const rows = [];
  if (st.state === "gone") rows.push({ banner: ["CHƯƠNG TRÌNH KHÔNG CÒN TỔ CHỨC", "#B6372E", "#FDECEA"] });
  else if (st.state === "closed") rows.push({ banner: ["ĐÃ ĐÓNG ĐĂNG KÝ", "#B6372E", "#FDECEA"] });
  else if (st.state === "expired") rows.push({ banner: ["ĐÃ HẾT HẠN ĐĂNG KÝ", "#B45309", "#FFF4DE"] });
  else if (st.state === "full") rows.push({ banner: ["ĐÃ ĐỦ CHỖ", "#B45309", "#FFF4DE"] });
  if (st.state !== "gone") {
    const w = SP(p.when), wh = SP(p.where);
    if (w.main) rows.push({ ic: "calendar", label: "THỜI GIAN", main: w.main, sub: w.sub });
    if (wh.main) rows.push({ ic: "pin", label: "HÌNH THỨC / ĐỊA ĐIỂM", main: wh.main, sub: wh.sub });
    if (p.audience) rows.push({ ic: "people", label: "ĐỐI TƯỢNG THAM GIA", main: p.audience });
    if (p.speaker) rows.push({ ic: "group", label: "NGƯỜI CHIA SẺ", main: p.speaker });
    if (p.deadline) rows.push({ ic: "clock", label: "THỜI HẠN ĐĂNG KÝ", main: "Trước " + vnTime(p.deadline), hot: st.state === "open" ? leftText(p.deadline) : "" });
    if (p.capacity) { const left = Math.max(0, p.capacity - (st.taken || 0)); rows.push({ ic: "target", label: "SỐ CHỖ", main: left > 0 ? "Còn " + left + " / " + p.capacity + " chỗ" : "Đã đủ " + p.capacity + " chỗ", sub: st.taken ? st.taken + " đồng nghiệp đã đăng ký" : "", hot: left > 0 && left <= Math.max(3, Math.ceil(p.capacity * 0.2)) ? "sắp hết chỗ" : "" }); }
    else if (st.taken) rows.push({ ic: "group", label: "ĐÃ ĐĂNG KÝ", main: st.taken + " đồng nghiệp" });
    const ct = [p.phone ? "ĐT " + p.phone : "", p.email || ""].filter(Boolean).join("  ·  ");
    if (p.contact || ct) rows.push({ ic: "phone", label: "LIÊN HỆ", main: p.contact || p.org || "", sub: ct });
  }
  // đo chiều cao
  const m = createCanvas(10, 10).getContext("2d"), TW = W - PADX * 2 - 92;
  rows.forEach((r) => {
    if (r.banner) { r.h = 74; return; }
    m.font = F(700, 24); r.ml = wrap(m, r.main, TW); m.font = F(400, 20); r.sl = r.sub ? wrap(m, r.sub, TW) : [];
    r.h = 26 + 24 + r.ml.length * 32 + r.sl.length * 28 + (r.hot ? 32 : 0) + 20;
  });
  const H = 24 + rows.reduce((a, r) => a + r.h, 0) + 14;
  const cv = createCanvas(W, H), c = cv.getContext("2d");
  rr(c, 0, 0, W, H, 26); c.fillStyle = "#F1F6FD"; c.fill();
  let y = 24;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.banner) { rr(c, PADX, y + 8, W - PADX * 2, 56, 14); c.fillStyle = r.banner[2]; c.fill(); c.fillStyle = r.banner[1]; c.font = F(800, 24); c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(r.banner[0], W / 2, y + 37); c.textAlign = "left"; y += r.h; continue; }
    if (i && !rows[i - 1].banner) { c.fillStyle = "#DCE6F4"; c.fillRect(PADX, y, W - PADX * 2, 2); }
    const img = await loadImage(I[r.ic]); c.drawImage(img, PADX, y + 26, 54, 54);
    let ty = y + 26; c.textBaseline = "top"; const X = PADX + 92;
    c.fillStyle = "#6B7A96"; c.font = F(600, 17); c.fillText(r.label, X, ty); ty += 26;
    c.fillStyle = NAVY; c.font = F(700, 24); r.ml.forEach((l) => { c.fillText(l, X, ty); ty += 32; });
    c.fillStyle = "#33425E"; c.font = F(400, 20); r.sl.forEach((l) => { c.fillText(l, X, ty + 2); ty += 28; });
    if (r.hot) { c.font = F(700, 19); const tw = c.measureText(r.hot).width + 24; rr(c, X, ty + 4, tw, 30, 15); c.fillStyle = "#FFEDD5"; c.fill(); c.fillStyle = "#C2410C"; c.fillText(r.hot, X + 12, ty + 8); }
    y += r.h;
  }
  return cv.encode("png");
}
async function goneHero() {
  const { createCanvas } = lib(), cv = createCanvas(1200, 300), c = cv.getContext("2d");
  c.fillStyle = "#EEF2F8"; c.fillRect(0, 0, 1200, 300); c.fillStyle = "#6B7A96"; c.font = F(700, 40); c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText("Chương trình này không còn tổ chức", 600, 150); return cv.encode("jpeg", 85);
}
module.exports = { hero, icons, NAMES, infoCard, goneHero };
