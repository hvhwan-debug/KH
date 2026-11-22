// Vẽ hình minh hoạ trang chủ /kiemtra (kiemtra/home-art.png): laptop có danh sách tick, thẻ AI, biểu đồ, bia ngắm.
// Chạy: node dev/gen-home-art.js
const path = require("path");
const L = require(path.join(__dirname, "../api/node_modules/@napi-rs/canvas"));
const W = 640, H = 500, S = 2, cv = L.createCanvas(W * S, H * S), c = cv.getContext("2d");
c.scale(S, S); c.lineJoin = "round"; c.lineCap = "round";
const F = path.join(__dirname, "../api/_lib/fonts/BeVietnamPro-ExtraBold.ttf"); L.GlobalFonts.registerFromPath(F, "BVP");
const lin = (x0, y0, x1, y1, st) => { const g = c.createLinearGradient(x0, y0, x1, y1); st.forEach((s, i) => g.addColorStop(i / (st.length - 1), s)); return g; };
function rr(x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function glow(col, blur, fn) { c.save(); c.shadowColor = col; c.shadowBlur = blur; fn(); c.restore(); }
// quầng sáng tròn phía sau
let g = c.createRadialGradient(300, 230, 20, 300, 230, 260); g.addColorStop(0, "rgba(90,180,255,.45)"); g.addColorStop(.6, "rgba(60,140,255,.15)"); g.addColorStop(1, "rgba(60,140,255,0)");
c.fillStyle = g; c.fillRect(0, 0, W, H);
glow("rgba(140,220,255,.9)", 18, () => { c.beginPath(); c.arc(300, 250, 220, Math.PI * 0.95, Math.PI * 2.02); c.strokeStyle = "rgba(170,230,255,.7)"; c.lineWidth = 2.5; c.stroke(); });
// vòng sáng dưới chân
[[300, 430, 260, 46, .55, 3], [300, 430, 205, 34, .8, 2.5], [300, 430, 150, 24, .5, 2]].forEach(([x, y, rx, ry, a, lw]) => glow("rgba(120,220,255,1)", 16, () => { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.strokeStyle = "rgba(190,240,255," + a + ")"; c.lineWidth = lw; c.stroke(); }));
c.beginPath(); c.ellipse(300, 432, 190, 28, 0, 0, Math.PI * 2); c.fillStyle = "rgba(110,200,255,.22)"; c.fill();
// laptop: đế
c.save(); c.translate(40, 0);
c.beginPath(); c.moveTo(60, 392); c.lineTo(420, 352); c.lineTo(470, 420); c.lineTo(110, 470); c.closePath(); c.fillStyle = lin(60, 380, 470, 440, ["#E8F1FF", "#B9D3F7"]); c.fill();
c.beginPath(); c.moveTo(110, 470); c.lineTo(470, 420); c.lineTo(470, 430); c.lineTo(110, 482); c.closePath(); c.fillStyle = "#7FA6E0"; c.fill();
c.beginPath(); c.moveTo(60, 392); c.lineTo(110, 470); c.lineTo(110, 482); c.lineTo(58, 402); c.closePath(); c.fillStyle = "#9DBCEB"; c.fill();
// bàn phím: các phím nhỏ trên mặt đế
for (let r = 0; r < 3; r++) for (let k = 0; k < 11; k++) {
  const u = (k + 0.5) / 11, v = 0.12 + r * 0.17;
  const x = 60 + (420 - 60) * u + (110 - 60) * v + ((470 - 420) - (110 - 60)) * u * v, y = 392 + (352 - 392) * u + (470 - 392) * v + ((420 - 352) - (470 - 392)) * u * v;
  c.save(); c.translate(x, y); c.transform(1, -0.111, 0.35, 0.55, 0, 0); rr(-12, -7, 24, 14, 3); c.fillStyle = "#A9C2EA"; c.fill(); c.restore();
}
// màn hình (nghiêng)
c.beginPath(); c.moveTo(14, 110); c.lineTo(300, 70); c.lineTo(388, 352); c.lineTo(60, 392); c.closePath(); c.fillStyle = lin(14, 70, 388, 392, ["#5A8DF0", "#1E4FC2"]); c.fill();
c.beginPath(); c.moveTo(30, 122); c.lineTo(290, 86); c.lineTo(370, 340); c.lineTo(68, 376); c.closePath(); c.fillStyle = lin(30, 86, 370, 376, ["#F4F8FF", "#C9DCFA"]); c.fill();
// thanh trên màn hình + 3 dòng tick
[0, 1, 2].forEach((i) => { const t = i / 3, x = 70 + t * 38 + 8, y = 168 + i * 60 - t * 6;
  glow("rgba(30,200,110,.6)", 10, () => { c.save(); c.translate(x, y); c.rotate(-0.13); rr(0, 0, 40, 40, 8); c.fillStyle = lin(0, 0, 0, 40, ["#3FE08A", "#16A956"]); c.fill(); c.restore(); });
  c.save(); c.translate(x, y); c.rotate(-0.13); c.beginPath(); c.moveTo(10, 21); c.lineTo(18, 29); c.lineTo(31, 12); c.strokeStyle = "#fff"; c.lineWidth = 5; c.stroke();
  rr(56, 8, 120, 9, 4.5); c.fillStyle = "#8FB5F2"; c.fill(); rr(56, 24, 80, 7, 3.5); c.fillStyle = "#BFD5F8"; c.fill(); c.restore(); });
c.restore();
// thẻ AI
glow("rgba(120,210,255,.95)", 22, () => { rr(378, 54, 118, 100, 20); c.fillStyle = lin(378, 54, 496, 154, ["rgba(70,150,255,.95)", "rgba(20,80,220,.95)"]); c.fill(); });
rr(378, 54, 118, 100, 20); c.strokeStyle = "rgba(190,240,255,.95)"; c.lineWidth = 2.5; c.stroke();
c.strokeStyle = "rgba(200,240,255,.9)"; c.lineWidth = 3; [[392, 80, 1, 1], [482, 80, -1, 1], [392, 128, 1, -1], [482, 128, -1, -1]].forEach(([x, y, dx, dy]) => { c.beginPath(); c.moveTo(x, y + dy * 12); c.lineTo(x, y); c.lineTo(x + dx * 12, y); c.stroke(); });
c.font = "800 50px BVP"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#fff"; glow("rgba(150,230,255,1)", 12, () => c.fillText("AI", 437, 106));
// lấp lánh
const spark = (x, y, s) => { c.beginPath(); c.moveTo(x, y - s); c.quadraticCurveTo(x, y, x + s, y); c.quadraticCurveTo(x, y, x, y + s); c.quadraticCurveTo(x, y, x - s, y); c.quadraticCurveTo(x, y, x, y - s); c.fillStyle = "#fff"; c.fill(); };
glow("rgba(180,240,255,1)", 10, () => { spark(518, 46, 13); spark(540, 76, 6); });
// thẻ biểu đồ
glow("rgba(120,210,255,.8)", 18, () => { c.save(); c.translate(440, 190); c.rotate(-0.06); rr(0, 0, 150, 96, 16); c.fillStyle = "rgba(90,170,255,.55)"; c.fill(); c.strokeStyle = "rgba(200,240,255,.85)"; c.lineWidth = 2; c.stroke();
  rr(16, 16, 48, 7, 3.5); c.fillStyle = "rgba(255,255,255,.8)"; c.fill(); rr(16, 28, 30, 6, 3); c.fillStyle = "rgba(255,255,255,.5)"; c.fill();
  [[22, 24], [50, 40], [78, 56], [106, 70]].forEach(([x, h]) => { rr(x, 84 - h, 18, h, 5); c.fillStyle = lin(0, 84 - h, 0, 84, ["#FFFFFF", "#9FD8FF"]); c.fill(); }); c.restore(); });
// bia ngắm
const tx = 420, ty = 360;
glow("rgba(10,40,130,.55)", 24, () => { c.beginPath(); c.ellipse(tx, ty, 92, 98, -0.35, 0, Math.PI * 2); c.fillStyle = "#1546B8"; c.fill(); });
c.beginPath(); c.ellipse(tx + 10, ty - 4, 86, 92, -0.35, 0, Math.PI * 2); c.fillStyle = lin(tx - 80, ty - 90, tx + 90, ty + 90, ["#4F8FF5", "#1A52CE"]); c.fill();
[[70, "#EAF3FF"], [56, "#3F7FEF"], [40, "#F4F9FF"], [26, "#2F6FE6"], [12, "#F4F9FF"]].forEach(([r, col]) => { c.beginPath(); c.ellipse(tx + 14, ty - 6, r, r * 1.07, -0.35, 0, Math.PI * 2); c.fillStyle = col; c.fill(); });
// mũi tên cắm vào tâm bia, đuôi lông vũ ở ngoài
c.beginPath(); c.moveTo(tx + 14, ty - 6); c.lineTo(tx + 118, ty - 92); c.lineWidth = 7; c.strokeStyle = lin(tx, ty, tx + 118, ty - 92, ["#C9640A", "#FFB43A"]); c.stroke();
[[-1, "#FFB020"], [1, "#FFD45A"]].forEach(([d, col]) => { c.save(); c.translate(tx + 112, ty - 87); c.rotate(-0.69); c.beginPath(); c.moveTo(0, 0); c.lineTo(34, d * 2); c.lineTo(44, d * 18); c.lineTo(10, d * 14); c.closePath(); c.fillStyle = col; c.fill(); c.restore(); });
cv.encode("png").then((b) => require("fs").writeFileSync(path.join(__dirname, "../kiemtra/home-art.png"), b));
