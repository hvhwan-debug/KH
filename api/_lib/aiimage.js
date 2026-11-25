// Ảnh minh hoạ (ảnh bìa) cho học liệu.
// 1) AI vẽ theo tiêu đề + giới thiệu + danh mục:
//    - Azure OpenAI: cần AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_KEY + AZURE_OPENAI_IMAGE_DEPLOYMENT (tên bản triển khai gpt-image-1 hoặc dall-e-3)
//    - OpenAI: cần OPENAI_API_KEY (tuỳ chọn OPENAI_IMAGE_MODEL, mặc định gpt-image-1; OPENAI_IMAGE_QUALITY: low | medium | high)
// 2) Chưa cấu hình AI / AI lỗi / quá thời gian: TỰ VẼ ảnh minh hoạ theo chủ đề bằng @napi-rs/canvas (không có chữ),
//    để học liệu không bao giờ trống ảnh. Kết quả luôn là JPEG 1280x720 (nhẹ, hợp thẻ 16:9).
const path = require("path");
const W = 1280, H = 720;
const fold = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

let L = null;
function lib() {
  if (L) return L;
  L = require("@napi-rs/canvas");
  return L;
}

// ---------- chủ đề theo từ khoá ----------
const THEMES = [ // chủ đề cụ thể (chính sách, kỹ năng) đứng trước chủ đề sản phẩm: "Chính sách bảo hành máy lọc" là chính sách
  ["policy", /quy trinh|chinh sach|quy dinh|hop dong|bao hanh|thu tuc|an toan|noi quy/],
  ["sales", /ban hang|ky nang|doanh so|tu van|chot|khach hang|thuyet phuc|dam phan|marketing/],
  ["kitchen", /bep|noi |chao|gia dung|quat|noi chien|may xay|am sieu toc|hut mui/],
  ["water", /loc|nuoc|ro\b|loi |nong lanh|tinh khiet|hydrogen|kiem/]
];
// Xét TIÊU ĐỀ trước; tiêu đề không rõ chủ đề mới xét giới thiệu + danh mục ("Catalog máy lọc… điểm bán hàng" vẫn là máy lọc)
function themeOf(o) {
  for (const s of [fold(o.title), fold([o.desc, o.catName].join(" "))]) { const m = THEMES.find((x) => x[1].test(s)); if (m) return m[0]; }
  return "learn";
}

function prompt(o) {
  const SUBJ = {
    water: "a modern home water purifier with glowing filter cartridges and clean water droplets",
    kitchen: "modern home kitchen appliances arranged neatly on a counter",
    sales: "a friendly sales consultation scene symbolised by a rising bar chart, handshake and shopping elements",
    policy: "a clean checklist document, a shield and a stamp symbolising company policies and procedures",
    learn: "an open book with light, a graduation cap and learning icons"
  }[themeOf(o)];
  return "Wide 16:9 cover illustration for a corporate e-learning material of a Vietnamese home appliance company (water purifiers, kitchen appliances). " +
    "Topic (Vietnamese): \"" + String(o.title || "").slice(0, 150) + "\". " + (o.desc ? "Details: \"" + String(o.desc).slice(0, 300) + "\". " : "") +
    (o.catName ? "Category: \"" + o.catName + "\". " : "") + (o.type === "video" ? "It is a training video. " : "It is a PDF document. ") +
    "Show " + SUBJ + ". Style: clean modern 3D flat illustration, soft lighting, blue and white palette (#1B78E8, #0B55C9, white, light cyan accents), " +
    "plenty of empty space on the left-bottom. Absolutely NO text, NO letters, NO numbers, NO logos, NO brand names, NO watermarks, no realistic human faces.";
}

// ---------- gọi AI ----------
async function postJson(url, headers, body, ms) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { method: "POST", signal: ac.signal, headers: Object.assign({ "Content-Type": "application/json" }, headers), body: JSON.stringify(body) });
    if (!r.ok) { const e = new Error("upstream " + r.status); e.status = r.status; throw e; }
    const j = await r.json(), d = j && j.data && j.data[0];
    if (d && d.b64_json) return Buffer.from(d.b64_json, "base64");
    if (d && d.url) { const g = await fetch(d.url, { signal: ac.signal }); if (g.ok) return Buffer.from(await g.arrayBuffer()); }
    throw new Error("empty");
  } catch (e) { if (e && e.name === "AbortError") { const x = new Error("timeout"); x.status = 504; throw x; } throw e; }
  finally { clearTimeout(t); }
}
function aiConfigured() {
  return !!((process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_KEY && process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT) || process.env.OPENAI_API_KEY);
}
async function aiImage(o, ms) {
  const p = prompt(o), q = process.env.OPENAI_IMAGE_QUALITY || "medium";
  const ep = (process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/+$/, ""), key = process.env.AZURE_OPENAI_KEY, dep = process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT;
  if (ep && key && dep) {
    const dalle = /dall/i.test(dep);
    const url = ep + "/openai/deployments/" + encodeURIComponent(dep) + "/images/generations?api-version=" + (dalle ? "2024-02-01" : "2025-04-01-preview");
    return postJson(url, { "api-key": key }, dalle ? { prompt: p, n: 1, size: "1792x1024", response_format: "b64_json" } : { prompt: p, n: 1, size: "1536x1024", quality: q }, ms);
  }
  const m = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1", dalle = /dall/i.test(m);
  return postJson("https://api.openai.com/v1/images/generations", { Authorization: "Bearer " + process.env.OPENAI_API_KEY },
    dalle ? { model: m, prompt: p, n: 1, size: "1792x1024", response_format: "b64_json" } : { model: m, prompt: p, n: 1, size: "1536x1024", quality: q }, ms);
}

// Cắt vừa khung 16:9 và nén JPEG
async function toCover(buf) {
  const { createCanvas, loadImage } = lib();
  const img = await loadImage(buf), cv = createCanvas(W, H), c = cv.getContext("2d");
  const s = Math.max(W / img.width, H / img.height), w = img.width * s, h = img.height * s;
  c.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  return cv.encode("jpeg", 86);
}

// ---------- ảnh tự vẽ (không cần AI) ----------
function seedOf(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rnd(seed) { let x = seed || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 10000) / 10000; }; }
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function lg(c, x0, y0, x1, y1, a) { const g = c.createLinearGradient(x0, y0, x1, y1); a.forEach((s, i) => g.addColorStop(i / (a.length - 1), s)); return g; }
const PAL = { water: ["#1B78E8", "#0B4FC0", "#7FD6FF"], kitchen: ["#F08A24", "#C8551B", "#FFD9A8"], sales: ["#12A58F", "#0B6E78", "#9BF0DC"], policy: ["#5A55E0", "#3730A3", "#C9C6FF"], learn: ["#1B78E8", "#0B3F94", "#A9D2FF"] };

function drop(c, x, y, r, fill) { c.beginPath(); c.moveTo(x, y - r * 1.55); c.bezierCurveTo(x + r * 0.55, y - r * 0.75, x + r, y - r * 0.2, x + r, y + r * 0.25); c.arc(x, y + r * 0.25, r, 0, Math.PI); c.bezierCurveTo(x - r, y - r * 0.2, x - r * 0.55, y - r * 0.75, x, y - r * 1.55); c.closePath(); c.fillStyle = fill; c.fill(); }
function shadow(c, on, blur, oy) { c.shadowColor = on ? "rgba(5,25,80,.35)" : "transparent"; c.shadowBlur = blur || 0; c.shadowOffsetY = oy || 0; }

function artWater(c, P) {
  // máy lọc
  shadow(c, 1, 60, 24); rr(c, 700, 150, 300, 470, 44); c.fillStyle = lg(c, 700, 150, 1000, 620, ["#FFFFFF", "#DCE9FB"]); c.fill(); shadow(c, 0);
  rr(c, 730, 185, 240, 120, 24); c.fillStyle = lg(c, 730, 185, 970, 305, ["#0E2C66", "#163E8C"]); c.fill();
  [0, 1, 2].forEach((i) => { c.beginPath(); c.arc(785 + i * 65, 245, 16, 0, Math.PI * 2); c.fillStyle = ["#7FD6FF", "#5BE3B4", "#FFD166"][i]; c.fill(); });
  [0, 1, 2].forEach((i) => { rr(c, 745 + i * 78, 340, 56, 230, 26); c.fillStyle = lg(c, 0, 340, 0, 570, ["#E9F4FF", "#B9D6F7"]); c.fill(); rr(c, 752 + i * 78, 350, 42, 40, 14); c.fillStyle = P[0]; c.fill(); });
  // giọt nước
  drop(c, 520, 380, 120, lg(c, 400, 200, 640, 520, ["#BDEBFF", "#2E9BFF"]));
  c.beginPath(); c.ellipse(475, 380, 22, 46, -0.4, 0, Math.PI * 2); c.fillStyle = "rgba(255,255,255,.65)"; c.fill();
  drop(c, 1090, 250, 34, "rgba(255,255,255,.85)"); drop(c, 380, 230, 22, "rgba(255,255,255,.7)"); drop(c, 1110, 520, 20, "rgba(191,235,255,.9)");
}
function artKitchen(c, P) {
  shadow(c, 1, 50, 20); rr(c, 560, 330, 420, 230, 60); c.fillStyle = lg(c, 560, 330, 980, 560, ["#FFFFFF", "#F1E2D3"]); c.fill(); shadow(c, 0);
  rr(c, 520, 300, 500, 52, 26); c.fillStyle = "#3B2A22"; c.fill(); rr(c, 740, 262, 60, 44, 16); c.fillStyle = "#3B2A22"; c.fill();
  rr(c, 470, 380, 90, 32, 16); c.fill(); rr(c, 980, 380, 90, 32, 16); c.fill();
  [0, 1, 2].forEach((i) => { c.beginPath(); c.moveTo(680 + i * 90, 240); c.bezierCurveTo(650 + i * 90, 200, 710 + i * 90, 170, 680 + i * 90, 120); c.lineWidth = 14; c.strokeStyle = "rgba(255,255,255,.75)"; c.lineCap = "round"; c.stroke(); });
  c.beginPath(); c.arc(330, 470, 110, 0, Math.PI * 2); c.fillStyle = "rgba(255,255,255,.18)"; c.fill();
}
function artSales(c, P) {
  shadow(c, 1, 60, 24); rr(c, 560, 150, 520, 430, 40); c.fillStyle = "#FFFFFF"; c.fill(); shadow(c, 0);
  const hs = [120, 190, 160, 260, 330];
  hs.forEach((h, i) => { rr(c, 620 + i * 88, 520 - h, 56, h, 14); c.fillStyle = lg(c, 0, 520 - h, 0, 520, [P[2], P[0]]); c.fill(); });
  c.beginPath(); c.moveTo(610, 430); c.lineTo(760, 350); c.lineTo(860, 380); c.lineTo(1040, 220); c.lineWidth = 16; c.strokeStyle = P[1]; c.lineCap = "round"; c.lineJoin = "round"; c.stroke();
  c.beginPath(); c.moveTo(1040, 220); c.lineTo(990, 222); c.moveTo(1040, 220); c.lineTo(1036, 270); c.stroke();
  c.beginPath(); c.arc(400, 300, 70, 0, Math.PI * 2); c.fillStyle = "#FFD166"; c.fill(); c.beginPath(); c.arc(400, 300, 46, 0, Math.PI * 2); c.lineWidth = 10; c.strokeStyle = "#E0A82E"; c.stroke();
}
function artPolicy(c, P) {
  shadow(c, 1, 60, 24); rr(c, 620, 120, 380, 490, 36); c.fillStyle = "#FFFFFF"; c.fill(); shadow(c, 0);
  [0, 1, 2, 3].forEach((i) => { const y = 210 + i * 95; rr(c, 670, y, 46, 46, 12); c.fillStyle = P[0]; c.fill();
    c.beginPath(); c.moveTo(681, y + 24); c.lineTo(691, y + 34); c.lineTo(706, y + 14); c.lineWidth = 7; c.strokeStyle = "#fff"; c.stroke();
    rr(c, 740, y + 8, 200 - (i % 2) * 50, 14, 7); c.fillStyle = "#D8DEF5"; c.fill(); rr(c, 740, y + 30, 140, 10, 5); c.fillStyle = "#E9ECF8"; c.fill(); });
  c.beginPath(); c.moveTo(450, 230); c.lineTo(560, 270); c.lineTo(560, 380); c.bezierCurveTo(560, 450, 500, 500, 450, 520); c.bezierCurveTo(400, 500, 340, 450, 340, 380); c.lineTo(340, 270); c.closePath();
  shadow(c, 1, 40, 16); c.fillStyle = lg(c, 340, 230, 560, 520, ["#FFFFFF", P[2]]); c.fill(); shadow(c, 0);
  c.beginPath(); c.moveTo(400, 380); c.lineTo(440, 420); c.lineTo(510, 340); c.lineWidth = 18; c.strokeStyle = P[1]; c.stroke();
}
function artLearn(c, P) {
  shadow(c, 1, 50, 22);
  c.beginPath(); c.moveTo(560, 300); c.quadraticCurveTo(700, 250, 820, 310); c.lineTo(820, 560); c.quadraticCurveTo(700, 500, 560, 550); c.closePath(); c.fillStyle = "#FFFFFF"; c.fill();
  c.beginPath(); c.moveTo(1080, 300); c.quadraticCurveTo(940, 250, 820, 310); c.lineTo(820, 560); c.quadraticCurveTo(940, 500, 1080, 550); c.closePath(); c.fillStyle = "#EEF4FF"; c.fill(); shadow(c, 0);
  [0, 1, 2].forEach((i) => { rr(c, 600, 340 + i * 44, 180 - i * 30, 12, 6); c.fillStyle = "#D6E3F8"; c.fill(); rr(c, 860, 340 + i * 44, 180 - i * 20, 12, 6); c.fill(); });
  c.beginPath(); c.moveTo(820, 120); c.lineTo(980, 180); c.lineTo(820, 240); c.lineTo(660, 180); c.closePath(); c.fillStyle = "#0E2C66"; c.fill();
  rr(c, 740, 200, 160, 60, 20); c.fill(); c.beginPath(); c.moveTo(960, 186); c.lineTo(960, 250); c.lineWidth = 8; c.strokeStyle = "#FFD166"; c.stroke(); c.beginPath(); c.arc(960, 258, 12, 0, Math.PI * 2); c.fillStyle = "#FFD166"; c.fill();
}
async function artImage(o) {
  const { createCanvas } = lib(), th = themeOf(o), P = PAL[th], r = rnd(seedOf(o.title + "|" + o.desc));
  const cv = createCanvas(W, H), c = cv.getContext("2d");
  c.fillStyle = lg(c, 0, 0, W, H, [P[0], P[1]]); c.fillRect(0, 0, W, H);
  for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(r() * W, r() * H, 60 + r() * 220, 0, Math.PI * 2); c.fillStyle = "rgba(255,255,255," + (0.05 + r() * 0.07).toFixed(3) + ")"; c.fill(); }
  c.beginPath(); c.moveTo(0, H * 0.78); c.bezierCurveTo(W * 0.3, H * 0.66, W * 0.6, H * 0.95, W, H * 0.8); c.lineTo(W, H); c.lineTo(0, H); c.closePath(); c.fillStyle = "rgba(255,255,255,.10)"; c.fill();
  ({ water: artWater, kitchen: artKitchen, sales: artSales, policy: artPolicy, learn: artLearn })[th](c, P);
  if (o.type === "video") { shadow(c, 1, 30, 10); c.beginPath(); c.arc(1150, 600, 62, 0, Math.PI * 2); c.fillStyle = "#FFFFFF"; c.fill(); shadow(c, 0); c.beginPath(); c.moveTo(1132, 568); c.lineTo(1132, 632); c.lineTo(1186, 600); c.closePath(); c.fillStyle = P[0]; c.fill(); }
  return cv.encode("jpeg", 88);
}

// Trả { buf (JPEG), source: "ai" | "art", note }
async function cover(o, opt) {
  opt = opt || {};
  if (aiConfigured() && !opt.artOnly) {
    try { return { buf: await toCover(await aiImage(o, opt.timeoutMs || 38000)), source: "ai" }; }
    catch (e) { return { buf: await artImage(o), source: "art", note: e && e.status === 504 ? "AI vẽ quá thời gian, đã dùng ảnh tự vẽ. Bấm lại để thử AI lần nữa." : "AI chưa vẽ được (" + ((e && e.status) || "lỗi") + "), đã dùng ảnh tự vẽ." }; }
  }
  return { buf: await artImage(o), source: "art", note: aiConfigured() ? "" : "Máy chủ chưa bật quyền tạo ảnh AI nên đã dùng ảnh minh hoạ tự vẽ theo chủ đề." };
}

module.exports = { cover, artImage, themeOf, prompt, aiConfigured, PAL };
