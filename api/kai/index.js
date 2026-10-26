// Trợ lí KAI: tra cứu chính sách nội bộ Karofi/Livotec cho nhân viên.
// - Chưa đăng nhập: hỏi được tối đa ANON_LIMIT câu (không reset theo ngày).
// - Đăng nhập (mã NV + email đối chiếu với danh sách nhân viên trong hệ thống kiemtra, hoặc danh sách đã
//   được quản trị viên duyệt riêng): hỏi tối đa DAILY_LIMIT câu/ngày (theo giờ Việt Nam).
// - Không khớp danh sách: tạo yêu cầu chờ quản trị viên duyệt (op "pending"/"approve"/"reject", chỉ admin).
// - Trả lời CHỈ dựa trên nội dung tài liệu trong api/_lib/kai-kb.js, không bịa thêm.
const crypto = require("crypto");
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const quiz = require("../_lib/quiz");
const store = require("../_lib/store");
const session = require("../_lib/session");
const { isAdmin } = require("../_lib/config");
const llm = require("../_lib/llm");
const { pickRelevant } = require("../_lib/kai-kb");

const DAILY_LIMIT = 30;
const ANON_LIMIT = 3;
const COOKIE_NAME = "kai_id";
const ANON_COOKIE = "kai_anon";
const MAX_AGE = 180 * 24 * 3600; // giây, 180 ngày

function vnDate(ts) { return new Date((ts || Date.now()) + 7 * 3600 * 1000).toISOString().slice(0, 10); }
function kaiCookie(name, payload, maxAge) { return name + "=" + session.sign(payload) + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + maxAge + "; Secure"; }
function clearKaiCookie(name) { return name + "=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure"; }
function parseCookies(h) {
  const out = {};
  String(h || "").split(";").forEach((p) => { const i = p.indexOf("="); if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim(); });
  return out;
}
function identityFromReq(req) {
  const c = parseCookies((req.headers || {}).cookie);
  if (c[COOKIE_NAME]) { const p = session.verify(c[COOKIE_NAME]); if (p && p.code) return { kind: "emp", code: p.code, name: p.name || "" }; }
  if (c[ANON_COOKIE]) { const p = session.verify(c[ANON_COOKIE]); if (p && p.id) return { kind: "anon", id: p.id }; }
  return null;
}
async function usageCount(key) { const v = await store.get(key); return (v && v.count) || 0; }
async function usageInc(key) { const v = (await store.get(key)) || { count: 0 }; v.count = (v.count || 0) + 1; await store.put(key, v); return v.count; }
function newAnonId() { return crypto.randomBytes(12).toString("hex"); }

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    if (req.method !== "POST") return reply(context, 405, { ok: false, error: "Phương thức không hợp lệ." });
    const b = req.body || {};
    const op = b.op;

    // ---- Quản trị viên: xem / duyệt / từ chối yêu cầu truy cập ----
    if (op === "pending" || op === "approve" || op === "reject") {
      if (!requireAjax(context, req)) return;
      const u = session.userFromReq(req);
      if (!u || !u.email || !isAdmin(u.email)) return reply(context, 403, { ok: false, error: "Chỉ quản trị viên mới xem được." });
      const list = (await store.get("kai/pending.json")) || [];
      if (op === "pending") return reply(context, 200, { ok: true, list: list.filter((x) => x.status === "pending") });
      const id = String(b.id || "");
      const i = list.findIndex((x) => x.id === id);
      if (i < 0) return reply(context, 404, { ok: false, error: "Không tìm thấy yêu cầu." });
      list[i].status = op === "approve" ? "approved" : "rejected";
      list[i].doneAt = Date.now();
      if (op === "approve") {
        const appr = (await store.get("kai/approved.json")) || [];
        appr.push({ code: list[i].code, email: list[i].email, name: list[i].name || "" });
        await store.put("kai/approved.json", appr);
      }
      await store.put("kai/pending.json", list);
      return reply(context, 200, { ok: true });
    }

    if (op === "logout") return reply(context, 200, { ok: true }, { "Set-Cookie": clearKaiCookie(COOKIE_NAME) });

    if (op === "me") {
      const id = identityFromReq(req);
      if (id && id.kind === "emp") {
        const used = await usageCount("kai/usage/emp-" + id.code + "-" + vnDate() + ".json");
        return reply(context, 200, { ok: true, loggedIn: true, name: id.name, used, limit: DAILY_LIMIT });
      }
      const headers = {};
      let anonId = id && id.kind === "anon" ? id.id : null;
      if (!anonId) { anonId = newAnonId(); headers["Set-Cookie"] = kaiCookie(ANON_COOKIE, { id: anonId }, MAX_AGE); }
      const used = await usageCount("kai/usage/anon-" + anonId + ".json");
      return reply(context, 200, { ok: true, loggedIn: false, used, limit: ANON_LIMIT }, headers);
    }

    if (op === "login") {
      if (!requireAjax(context, req)) return;
      if (quiz.tooManyFails(req, 8, 10 * 60 * 1000)) return reply(context, 429, { ok: false, error: "Bạn đã thử quá nhiều lần. Vui lòng đợi vài phút rồi thử lại." });
      const code = quiz.normCode(b.code), email = quiz.normEmail(b.email);
      if (!code || !email) return reply(context, 400, { ok: false, error: "Nhập đầy đủ mã nhân viên và email." });
      const candidates = await quiz.getCandidates();
      let found = candidates.find((c) => quiz.normCode(c.code) === code && quiz.normEmail(c.email) === email);
      if (!found) {
        const appr = (await store.get("kai/approved.json")) || [];
        found = appr.find((c) => quiz.normCode(c.code) === code && quiz.normEmail(c.email) === email);
      }
      if (found) {
        return reply(context, 200, { ok: true, matched: true, name: found.name || "" }, { "Set-Cookie": kaiCookie(COOKIE_NAME, { code, name: found.name || "" }, MAX_AGE) });
      }
      quiz.noteFail(req);
      const list = (await store.get("kai/pending.json")) || [];
      const already = list.find((x) => x.status === "pending" && quiz.normCode(x.code) === code && quiz.normEmail(x.email) === email);
      if (!already) {
        list.unshift({ id: "kaireq" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), code, email, name: String(b.name || "").slice(0, 100), status: "pending", requestedAt: Date.now() });
        await store.put("kai/pending.json", list);
      }
      return reply(context, 200, { ok: true, matched: false, pending: true });
    }

    if (op === "ask") {
      if (!requireAjax(context, req)) return;
      const question = String(b.question || "").trim();
      if (!question) return reply(context, 400, { ok: false, error: "Nhập câu hỏi." });
      if (question.length > 600) return reply(context, 400, { ok: false, error: "Câu hỏi quá dài, hỏi ngắn gọn hơn nhé." });

      const id = identityFromReq(req);
      const headers = {};
      let usageKey, limit;
      if (id && id.kind === "emp") {
        usageKey = "kai/usage/emp-" + id.code + "-" + vnDate() + ".json";
        limit = DAILY_LIMIT;
      } else {
        let anonId = id && id.kind === "anon" ? id.id : null;
        if (!anonId) { anonId = newAnonId(); headers["Set-Cookie"] = kaiCookie(ANON_COOKIE, { id: anonId }, MAX_AGE); }
        usageKey = "kai/usage/anon-" + anonId + ".json";
        limit = ANON_LIMIT;
      }
      const used = await usageCount(usageKey);
      if (used >= limit) {
        const msg = id && id.kind === "emp"
          ? "Bạn đã hỏi đủ " + limit + " câu hôm nay, quay lại vào ngày mai nhé."
          : "Bạn đã dùng hết " + limit + " câu hỏi thử miễn phí. Đăng nhập bằng mã nhân viên để hỏi thêm (tối đa " + DAILY_LIMIT + " câu/ngày).";
        return reply(context, 403, { ok: false, quotaExceeded: true, used, limit, error: msg }, headers);
      }

      const sys = "Bạn là KAI, trợ lí nội bộ tra cứu chính sách và thông tin sản phẩm của Karofi/Livotec, dùng cho nhân viên nội bộ. " +
        "QUY TẮC BẮT BUỘC: Chỉ được trả lời dựa trên đúng nội dung tài liệu được cung cấp dưới đây. " +
        "Nếu câu hỏi không có thông tin hoặc thông tin không đủ rõ trong tài liệu, phải trả lời rằng bạn chưa có thông tin này trong tài liệu và đề nghị người hỏi liên hệ phòng ban phụ trách. " +
        "TUYỆT ĐỐI không suy đoán, không bịa thêm số liệu, điều kiện, mốc thời gian hay tên sản phẩm không có trong tài liệu. " +
        "Trả lời ngắn gọn, rõ ràng, bằng tiếng Việt; có thể trích nguyên số liệu/mốc thời gian/điều kiện khi có; liệt kê gạch đầu dòng nếu có nhiều mục liên quan.\n\n" +
        "TÀI LIỆU:\n" + pickRelevant(question, 9000);

      let answer;
      try {
        answer = await llm.chat([{ role: "system", content: sys }, { role: "user", content: question }], { temperature: 0.2, max_tokens: 700, timeoutMs: 25000 });
      } catch (e) {
        context.log.error("kai ask", e && e.message, e && e.status, "promptChars:", sys.length);
        return reply(context, 502, { ok: false, error: "Trợ lí đang bận hoặc chưa sẵn sàng, thử lại sau." }, headers);
      }
      const newUsed = await usageInc(usageKey);
      return reply(context, 200, { ok: true, answer, used: newUsed, limit }, headers);
    }

    return reply(context, 400, { ok: false, error: "Yêu cầu không hợp lệ." });
  } catch (e) {
    context.log.error("kai", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra, thử lại sau." });
  }
};
