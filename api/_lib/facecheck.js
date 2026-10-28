// Kiểm tra lại ở MÁY CHỦ: ảnh xác nhận có đúng một khuôn mặt người CHỤP TRỰC TIẾP không (trình duyệt có thể bị vượt qua).
// Dùng AI nhìn ảnh qua Azure OpenAI (cùng cấu hình với /api/ai). Groq chỉ dùng khi đặt GROQ_VISION_MODEL.
// Nguyên tắc: AI nói KHÔNG có mặt / nhiều người / nghi chụp lại từ màn hình-ảnh in -> chặn. AI không trả lời được
// (lỗi, quá giờ, mô hình không đọc ảnh) -> không chặn chỉ vì lỗi máy chủ, nhưng ghi "chưa xác minh" để quản trị viên
// xem lại; trừ khi trình duyệt đã báo không có mặt.
const PROMPT = "Bạn kiểm tra ảnh xác nhận danh tính trước khi làm bài thi. Ảnh PHẢI là chụp trực tiếp một người thật qua camera, " +
  "không được là ảnh chụp lại từ màn hình điện thoại/máy tính/TV hay chụp lại một tấm ảnh in/ảnh giấy. " +
  "Xem kỹ các dấu hiệu chụp lại (giả mạo): thấy viền/khung của điện thoại, máy tính bảng, màn hình hay khung ảnh lọt vào trong ảnh; " +
  "vệt sáng chói hoặc loá phản chiếu kiểu mặt kính; các vệt sọc/nhiễu dạng lưới (moiré) đặc trưng khi chụp lại màn hình; " +
  "ảnh trông phẳng, thiếu chiều sâu tự nhiên của khuôn mặt thật; nhìn thấy mép/góc của tờ giấy ảnh in; ánh sáng/màu sắc bất thường như nhìn qua lớp kính. " +
  "Đếm số khuôn mặt NGƯỜI THẬT nhìn thấy rõ trong ảnh (không tính ảnh in, màn hình, tượng, hình vẽ). " +
  "Trả lời DUY NHẤT một JSON, không thêm chữ nào khác: " +
  "{\"faces\": <số khuôn mặt người thật nhìn rõ>, \"clear\": <true nếu có đúng một khuôn mặt nhìn rõ, đủ sáng>, " +
  "\"spoof\": <true nếu nghi ngờ đây là ảnh chụp lại từ màn hình hoặc ảnh in, không phải chụp trực tiếp người thật qua camera>, " +
  "\"reason\": \"<lý do ngắn bằng tiếng Việt>\"}";

async function ask(url, headers, model, photo, ms) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { method: "POST", signal: ac.signal, headers: Object.assign({ "Content-Type": "application/json" }, headers),
      body: JSON.stringify(Object.assign(model ? { model } : {}, { temperature: 0, max_tokens: 120,
        messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, { type: "image_url", image_url: { url: photo, detail: "low" } }] }] })) });
    if (!r.ok) return null;
    const j = await r.json();
    const txt = String((j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "");
    const m = txt.match(/\{[\s\S]*\}/); if (!m) return null;
    const o = JSON.parse(m[0]); const faces = Number(o.faces);
    if (!Number.isFinite(faces)) return null;
    return { faces: Math.max(0, Math.round(faces)), clear: o.clear === true, spoof: o.spoof === true, reason: String(o.reason || "").slice(0, 160) };
  } catch (e) { return null; } finally { clearTimeout(t); }
}

async function serverCheck(photo) {
  const ep = (process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/+$/, ""), key = process.env.AZURE_OPENAI_KEY, dep = process.env.AZURE_OPENAI_DEPLOYMENT;
  if (ep && key && dep) { const r = await ask(ep + "/chat/completions", { "api-key": key, "Authorization": "Bearer " + key }, dep, photo, 9000); if (r) return Object.assign(r, { by: "azure" }); }
  const gk = process.env.GROQ_API_KEY, gm = process.env.GROQ_VISION_MODEL;
  if (gk && gm) { const r = await ask("https://api.groq.com/openai/v1/chat/completions", { "Authorization": "Bearer " + gk }, gm, photo, 9000); if (r) return Object.assign(r, { by: "groq" }); }
  return null;
}

const CLIENT_OK = ["ok", "noface", "multi", "small", "dark", "unavailable"];
function cleanClient(c) {
  if (!c || typeof c !== "object") return null;
  return { status: CLIENT_OK.indexOf(c.status) >= 0 ? c.status : "unknown", faces: Number.isFinite(+c.faces) ? +c.faces : null, score: Number.isFinite(+c.score) ? +c.score : null };
}

const store = require("./store");
const REJ_KEY = "kt/face-rejections.json";
const REJ_MAX = 500; // chỉ giữ gần đây nhất, tránh phình to mãi

// Ghi lại các lần bị TỪ CHỐI (kể cả chưa tạo được bài làm) để quản trị viên thấy ai đang cố tình nhiều lần.
async function logRejection(code, period, status, reason) {
  try {
    const ta = (await store.get("kt/testaccounts.json")) || [];
    if (ta.some((x) => String(x.code || "").trim().toLowerCase() === String(code || "").trim().toLowerCase())) return; // tài khoản thử nghiệm: không ghi nhật ký
    const list = (await store.get(REJ_KEY)) || [];
    list.push({ at: Date.now(), code: String(code || "").trim().slice(0, 50), period: String(period || ""), status, reason: String(reason || "").slice(0, 160) });
    await store.put(REJ_KEY, list.slice(-REJ_MAX));
  } catch (e) { /* không để lỗi ghi log làm hỏng luồng chính */ }
}
async function getRejections() { return (await store.get(REJ_KEY)) || []; }

// Trả về { allow, message?, record } - record lưu vào bài làm làm minh chứng
async function verify(photo, clientRaw, code, period) {
  const client = cleanClient(clientRaw);
  const srv = await serverCheck(photo);
  const at = Date.now();
  if (srv) {
    if (srv.faces === 0) { await logRejection(code, period, "noface", srv.reason); return { allow: false, message: "Hệ thống không thấy khuôn mặt người trong ảnh xác nhận. Hãy nhìn thẳng camera, đủ sáng, rồi chụp lại.", record: { status: "noface", by: srv.by, server: srv, client, at } }; }
    if (srv.faces > 1) { await logRejection(code, period, "multi", srv.reason); return { allow: false, message: "Ảnh xác nhận có nhiều hơn một người. Chỉ người làm bài được có mặt trong ảnh, hãy chụp lại.", record: { status: "multi", by: srv.by, server: srv, client, at } }; }
    if (srv.spoof) { await logRejection(code, period, "spoof", srv.reason); return { allow: false, message: "Ảnh xác nhận có dấu hiệu chụp lại từ màn hình hoặc ảnh in, không phải chụp trực tiếp qua camera. Hãy mở camera và chụp ảnh thật của chính bạn, không chụp qua điện thoại/ảnh khác.", record: { status: "spoof", by: srv.by, server: srv, client, at } }; }
    return { allow: true, record: { status: srv.clear ? "ok" : "unclear", by: srv.by, server: srv, client, at } };
  }
  // AI máy chủ không trả lời: dựa vào kết quả trên máy thí sinh
  if (client && ["noface", "multi", "small", "dark"].indexOf(client.status) >= 0) {
    await logRejection(code, period, client.status, "client");
    return { allow: false, message: "Ảnh xác nhận chưa đạt (không thấy rõ một khuôn mặt). Hãy chụp lại.", record: { status: client.status, by: "client", client, at } };
  }
  return { allow: true, record: { status: client && client.status === "ok" ? "client_ok" : "unverified", by: client ? "client" : "none", client, at } };
}

module.exports = { verify, getRejections };
