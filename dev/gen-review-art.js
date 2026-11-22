// Vẽ hình bảng ghi + kính lúp cho màn xem lại bài làm (kiemtra/review-art.png). Chạy: node dev/gen-review-art.js
const path = require("path");
const L = require(path.join(__dirname, "../api/node_modules/@napi-rs/canvas"));
const W = 300, H = 260, S = 2, cv = L.createCanvas(W * S, H * S), c = cv.getContext("2d");
c.scale(S, S); c.lineCap = "round"; c.lineJoin = "round";
const lin = (x0, y0, x1, y1, st) => { const g = c.createLinearGradient(x0, y0, x1, y1); st.forEach((s, i) => g.addColorStop(i / (st.length - 1), s)); return g; };
function rr(x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
// quầng sáng
let g = c.createRadialGradient(140, 140, 10, 140, 140, 140); g.addColorStop(0, "rgba(120,200,255,.45)"); g.addColorStop(1, "rgba(120,200,255,0)"); c.fillStyle = g; c.fillRect(0, 0, W, H);
c.save(); c.translate(130, 128); c.rotate(-0.16);
// bảng ghi (khối 3D)
c.save(); c.shadowColor = "rgba(0,20,90,.45)"; c.shadowBlur = 24; c.shadowOffsetY = 12;
rr(-86, -92, 172, 196, 22); c.fillStyle = "#1A4FC8"; c.fill(); c.restore();
rr(-90, -100, 172, 196, 22); c.fillStyle = lin(-90, -100, 82, 96, ["#6AA8FF", "#2A6AE6"]); c.fill();
rr(-76, -84, 144, 166, 14); c.fillStyle = lin(0, -84, 0, 82, ["#FFFFFF", "#E2EDFF"]); c.fill();
// kẹp
rr(-34, -114, 64, 30, 10); c.fillStyle = lin(-34, 0, 30, 0, ["#8FC0FF", "#3F7EEA"]); c.fill();
c.beginPath(); c.arc(-2, -114, 11, Math.PI, 0); c.lineWidth = 6; c.strokeStyle = "#3F7EEA"; c.stroke();
// 3 dòng tick
[-54, -10, 34].forEach((y) => {
  rr(-62, y, 30, 30, 8); c.fillStyle = lin(0, y, 0, y + 30, ["#3FE08A", "#16A956"]); c.fill();
  c.beginPath(); c.moveTo(-54, y + 16); c.lineTo(-48, y + 22); c.lineTo(-38, y + 9); c.strokeStyle = "#fff"; c.lineWidth = 4.5; c.stroke();
  rr(-22, y + 6, 70, 7, 3.5); c.fillStyle = "#9CC1FF"; c.fill(); rr(-22, y + 18, 46, 6, 3); c.fillStyle = "#CFE0FF"; c.fill();
});
c.restore();
// kính lúp
const mx = 184, my = 164;
c.save(); c.shadowColor = "rgba(0,20,90,.45)"; c.shadowBlur = 16; c.shadowOffsetY = 8;
c.beginPath(); c.moveTo(mx + 26, my + 26); c.lineTo(mx + 66, my + 66); c.lineWidth = 20; c.strokeStyle = lin(mx, my, mx + 66, my + 66, ["#2E6BE6", "#1A45B8"]); c.stroke(); c.restore();
c.beginPath(); c.arc(mx, my, 40, 0, Math.PI * 2); c.lineWidth = 13; c.strokeStyle = lin(mx - 40, my - 40, mx + 40, my + 40, ["#6FB0FF", "#2563E0"]); c.stroke();
c.beginPath(); c.arc(mx, my, 33, 0, Math.PI * 2); c.fillStyle = "rgba(200,232,255,.55)"; c.fill();
c.beginPath(); c.arc(mx - 10, my - 12, 13, Math.PI * 1.05, Math.PI * 1.6); c.lineWidth = 5; c.strokeStyle = "rgba(255,255,255,.9)"; c.stroke();
cv.encode("png").then((b) => require("fs").writeFileSync(path.join(__dirname, "../kiemtra/review-art.png"), b));
