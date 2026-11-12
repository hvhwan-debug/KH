// Dựng ảnh THẺ KẾT QUẢ (PNG, 1080 px) ở máy chủ để đính kèm email kết quả.
// Phần VẼ là chính mã vẽ thẻ trên trang kết quả (kiemtra/index.html, khối <share-card>) được sinh sang sharecard-draw.js bằng
// dev/sync-sharecard.js, nên thẻ trong email y hệt thẻ người dùng thấy / lưu từ trang. Thư viện canvas và phông chữ chỉ nạp khi cần;
// thiếu hoặc lỗi thì ném lỗi để nơi gọi gửi email KHÔNG kèm thẻ (không chặn việc gửi kết quả).
const path = require("path");
const quiz = require("./quiz");
const { cfg } = require("./config");

const ZONE = "Asia/Ho_Chi_Minh";
let lib = null, drawer = null;
function load() {
  if (lib && drawer) return;
  const L = require("@napi-rs/canvas");
  const dir = path.join(__dirname, "fonts");
  ["Regular", "Medium", "SemiBold", "Bold", "ExtraBold"].forEach((w) => {
    if (!L.GlobalFonts.registerFromPath(path.join(dir, "BeVietnamPro-" + w + ".ttf"), "Be Vietnam Pro")) throw new Error("Không nạp được phông " + w);
  });
  drawer = require("./sharecard-draw")(() => L.createCanvas(8, 8).getContext("2d"));
  lib = L;
}

const fmtFull = (ms) => { try { return new Date(ms).toLocaleString("vi-VN", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", second: "2-digit", day: "2-digit", month: "2-digit", year: "numeric", hour12: false }); } catch (e) { return ""; } };
const fmtClock = (sec) => { sec = Math.max(0, Math.round(sec || 0)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60, p = (x) => (x < 10 ? "0" : "") + x; return h ? h + ":" + p(m) + ":" + p(s) : m + ":" + p(s); };
function initials(n) { const p = String(n || "").trim().split(/\s+/).filter(Boolean); if (!p.length) return "?"; return ((p.length > 1 ? p[0].charAt(0) : "") + p[p.length - 1].charAt(0)).toUpperCase(); }
function qrMatrix(text) {
  try {
    const qr = require("./vendor/qr-make")(0, "M"); qr.addData(text); qr.make();
    const n = qr.getModuleCount(), m = [];
    for (let r = 0; r < n; r++) { const row = []; for (let c = 0; c < n; c++) row.push(!!qr.isDark(r, c)); m.push(row); }
    return m;
  } catch (e) { return null; }
}

// Dữ liệu thẻ: cùng cách tính với trang xác thực (api/kt-verify) và với shareData() trên trang kết quả
function cardData(attempt, settings, now) {
  settings = settings || {};
  const base = String(cfg().appUrl || "https://kh.io.vn").replace(/\/+$/, "");
  const url = base + "/kiemtra/ketqua.html?t=" + encodeURIComponent(quiz.verifyToken(attempt.id));
  const total = attempt.total || 0, dur = attempt.submittedAt && attempt.startedAt ? Math.round((attempt.submittedAt - attempt.startedAt) / 1000) : null;
  const ps = quiz.passState(attempt.pct, settings);
  let host = "kh.io.vn"; try { host = new URL(base).host; } catch (e) { /* giữ mặc định */ }
  return {
    title: attempt.examTitle || settings.examTitle || "Bài kiểm tra",
    name: attempt.name || attempt.code || "", code: attempt.code || "", initials: initials(attempt.name || attempt.code),
    practice: attempt.practice != null ? !!attempt.practice : !!settings.practice,
    passed: ps === true || ps === false ? ps : null, pct: attempt.pct == null ? 0 : attempt.pct, score: attempt.score, total,
    compliance: attempt.compliancePoints, passScore: quiz.passScoreOf(settings),
    clock: dur != null ? fmtClock(dur) : "", wrong: attempt.wrong, blank: attempt.blank, proof: quiz.proofCode(attempt.id),
    manager: attempt.manager || "",
    startedText: attempt.startedAt ? fmtFull(attempt.startedAt) : "", submittedText: attempt.submittedAt ? fmtFull(attempt.submittedAt) : "",
    stampText: fmtFull(now || Date.now()), host: host + "/kiemtra",
    qr: qrMatrix(url), avgSec: dur != null && total ? Math.round(dur / total) : null, cats: []
  };
}

// Trả về Buffer PNG của thẻ kết quả
async function renderPng(attempt, settings, now) {
  load();
  const d = cardData(attempt, settings, now), H = drawer.height(d), cv = lib.createCanvas(1080, H);
  drawer.draw(cv.getContext("2d"), 1080, H, d);
  return cv.encode("png");
}
// Ảnh QR (PNG, nền trắng có viền yên tĩnh) của liên kết xác thực, đính kèm nội tuyến (cid) trong email để QR hiện ngay trong thư
function verifyUrl(attempt) { return String(cfg().appUrl || "https://kh.io.vn").replace(/\/+$/, "") + "/kiemtra/ketqua.html?t=" + encodeURIComponent(quiz.verifyToken(attempt.id)); }
async function qrPng(attempt) {
  load();
  const m = qrMatrix(verifyUrl(attempt)); if (!m) throw new Error("Không dựng được mã QR");
  const n = m.length, cell = Math.max(3, Math.floor(264 / (n + 8))), size = cell * (n + 8), cv = lib.createCanvas(size, size), c = cv.getContext("2d");
  c.fillStyle = "#ffffff"; c.fillRect(0, 0, size, size); c.fillStyle = "#0A2552";
  for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) if (m[r][q]) c.fillRect((q + 4) * cell, (r + 4) * cell, cell, cell);
  return cv.encode("png");
}
const fileName = (attempt) => "the-ket-qua-" + String(attempt.code || "kiem-tra").replace(/[^A-Za-z0-9_-]+/g, "") + ".png";

module.exports = { renderPng, qrPng, cardData, fileName, verifyUrl };
