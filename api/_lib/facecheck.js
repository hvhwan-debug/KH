// Kiểm tra lại ở MÁY CHỦ: ảnh xác nhận có đúng một khuôn mặt người không (trình duyệt có thể bị vượt qua).
// Dùng AI nhìn ảnh qua Azure OpenAI (cùng cấu hình với /api/ai). Groq chỉ dùng khi đặt GROQ_VISION_MODEL.
// Nguyên tắc: AI nói KHÔNG có mặt / nhiều người -> chặn. AI không trả lời được (lỗi, quá giờ, mô hình không đọc ảnh)
// -> không chặn chỉ vì lỗi máy chủ, nhưng ghi "chưa xác minh" để quản trị viên xem lại; trừ khi trình duyệt đã báo không có mặt.
const PROMPT = "Bạn kiểm tra ảnh xác nhận danh tính trước khi làm bài thi. Đếm số khuôn mặt NGƯỜI THẬT nhìn thấy rõ trong ảnh " +
  "(không tính ảnh in, màn hình, tượng, hình vẽ nếu nhận ra được). Trả lời DUY NHẤT một JSON, không thêm chữ nào khác: " +
  "{\"faces\": <số khuôn mặt người thật nhìn rõ>, \"clear\": <true nếu có đúng một khuôn mặt nhìn rõ, đủ sáng>, \"reason\": \"<lý do ngắn bằng tiếng Việt>\"}";

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
    return { faces: Math.max(0, Math.round(faces)), clear: o.clear === true, reason: String(o.reason || "").slice(0, 160) };
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

// Trả về { allow, message?, record } - record lưu vào bài làm làm minh chứng
async function verify(photo, clientRaw) {
  const client = cleanClient(clientRaw);
  const srv = await serverCheck(photo);
  const at = Date.now();
  if (srv) {
    if (srv.faces === 0) return { allow: false, message: "Hệ thống không thấy khuôn mặt người trong ảnh xác nhận. Hãy nhìn thẳng camera, đủ sáng, rồi chụp lại.", record: { status: "noface", by: srv.by, server: srv, client, at } };
    if (srv.faces > 1) return { allow: false, message: "Ảnh xác nhận có nhiều hơn một người. Chỉ người làm bài được có mặt trong ảnh, hãy chụp lại.", record: { status: "multi", by: srv.by, server: srv, client, at } };
    return { allow: true, record: { status: srv.clear ? "ok" : "unclear", by: srv.by, server: srv, client, at } };
  }
  // AI máy chủ không trả lời: dựa vào kết quả trên máy thí sinh
  if (client && ["noface", "multi", "small", "dark"].indexOf(client.status) >= 0) {
    return { allow: false, message: "Ảnh xác nhận chưa đạt (không thấy rõ một khuôn mặt). Hãy chụp lại.", record: { status: client.status, by: "client", client, at } };
  }
  return { allow: true, record: { status: client && client.status === "ok" ? "client_ok" : "unverified", by: client ? "client" : "none", client, at } };
}

module.exports = { verify };
