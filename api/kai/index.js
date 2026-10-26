// Trợ lí KAI: tra cứu chính sách nội bộ Karofi/Livotec cho nhân viên.
// - Chưa đăng nhập: hỏi được tối đa ANON_LIMIT câu (không reset theo ngày).
// - Đăng nhập (mã NV + email đối chiếu với danh sách nhân viên trong hệ thống kiemtra, hoặc danh sách đã
//   được quản trị viên duyệt riêng): hỏi tối đa DAILY_LIMIT câu/ngày (theo giờ Việt Nam).
// - Không khớp danh sách: tạo yêu cầu chờ quản trị viên duyệt (op "pending"/"approve"/"reject", chỉ admin).
// - Chính sách/số liệu: CHỈ dựa trên tài liệu trong api/_lib/kai-kb.js, không bịa thêm.
// - Kỹ năng bán hàng/tư vấn: được trả lời linh hoạt (ghi rõ là gợi ý tham khảo). Có nhận lịch sử hội thoại gần nhất.
const crypto = require("crypto");
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const quiz = require("../_lib/quiz");
const store = require("../_lib/store");
const session = require("../_lib/session");
const { isAdmin } = require("../_lib/config");
const llm = require("../_lib/llm");
const kb = require("../_lib/kai-kb");

// Hạn mức mặc định (30 câu/ngày, 3 câu dùng thử) có thể đổi trong trang quản trị > Trợ lí KAI (kai/settings.json).
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
      const cfgK = await kb.getSettings();
      if (id && id.kind === "emp") {
        const used = await usageCount("kai/usage/emp-" + id.code + "-" + vnDate() + ".json");
        const blocked = !!cfgK.blocked[id.code];
        const unlimited = !!cfgK.unlimited[id.code];
        return reply(context, 200, { ok: true, loggedIn: true, name: id.name, used, limit: cfgK.limits[id.code] || cfgK.defaultLimit, blocked, unlimited });
      }
      const headers = {};
      let anonId = id && id.kind === "anon" ? id.id : null;
      if (!anonId) { anonId = newAnonId(); headers["Set-Cookie"] = kaiCookie(ANON_COOKIE, { id: anonId }, MAX_AGE); }
      const used = await usageCount("kai/usage/anon-" + anonId + ".json");
      return reply(context, 200, { ok: true, loggedIn: false, used, limit: cfgK.anonLimit }, headers);
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
      const cfgK = await kb.getSettings();
      if (cfgK.paused) return reply(context, 503, { ok: false, error: cfgK.pausedMsg || "KAI đang tạm dừng để bảo trì, vui lòng quay lại sau." });
      let usageKey, limit, unlimited = false;
      if (id && id.kind === "emp") {
        if (cfgK.blocked[id.code]) return reply(context, 403, { ok: false, error: "Tài khoản của bạn đang bị tạm khoá sử dụng KAI. Vui lòng liên hệ quản trị viên." });
        usageKey = "kai/usage/emp-" + id.code + "-" + vnDate() + ".json";
        limit = cfgK.limits[id.code] || cfgK.defaultLimit;
        unlimited = !!cfgK.unlimited[id.code];
      } else {
        let anonId = id && id.kind === "anon" ? id.id : null;
        if (!anonId) { anonId = newAnonId(); headers["Set-Cookie"] = kaiCookie(ANON_COOKIE, { id: anonId }, MAX_AGE); }
        usageKey = "kai/usage/anon-" + anonId + ".json";
        limit = cfgK.anonLimit;
      }
      const used = await usageCount(usageKey);
      if (!unlimited && used >= limit) {
        const msg = id && id.kind === "emp"
          ? "Bạn đã hỏi đủ " + limit + " câu hôm nay, quay lại vào ngày mai nhé."
          : "Bạn đã dùng hết " + limit + " câu hỏi thử miễn phí. Đăng nhập bằng mã nhân viên để hỏi thêm (hỏi được nhiều câu hơn mỗi ngày).";
        return reply(context, 403, { ok: false, quotaExceeded: true, used, limit, error: msg }, headers);
      }

      // Lịch sử gần nhất do trình duyệt gửi lên để KAI hiểu câu hỏi nối tiếp ("giá này", "sản phẩm đó"...).
      const hist = [];
      if (Array.isArray(b.history)) {
        b.history.slice(-8).forEach((m) => {
          if (!m || (m.role !== "user" && m.role !== "assistant")) return;
          const t = String(m.content || "").trim().slice(0, 1500);
          if (t) hist.push({ role: m.role, content: t });
        });
      }
      // Tìm tài liệu theo cả câu hỏi hiện tại lẫn câu hỏi người dùng liền trước (để câu hỏi ngắn vẫn đúng ngữ cảnh).
      const lastUser = hist.filter((m) => m.role === "user").slice(-1)[0];
      const lastBot = hist.filter((m) => m.role === "assistant").slice(-1)[0];
      // Câu hỏi ngắn ("có", "còn loại kia?") phụ thuộc ngữ cảnh: tìm tài liệu theo cả câu trước và đoạn đầu câu trả lời trước.
      const searchText = (lastUser ? lastUser.content + " " : "") + question + (question.length < 40 && lastBot ? " " + lastBot.content.slice(0, 400) : "");

      const sys = "Bạn là KAI, trợ lí nội bộ của Karofi/Livotec dành cho nhân viên kinh doanh. Giọng văn thân thiện, tự nhiên như một đồng nghiệp giàu kinh nghiệm, xưng \"mình\", gọi người hỏi là \"bạn\", bằng tiếng Việt, ngắn gọn, rõ ràng.\n\n" +
        "BẠN CÓ HAI CHẾ ĐỘ TRẢ LỜI, tự nhận biết theo câu hỏi:\n\n" +
        "1) HỎI VỀ CHÍNH SÁCH / SỐ LIỆU (khuyến mại, chiết khấu, bảng giá, điều kiện, mốc thời gian, thông số sản phẩm, chương trình đầu tư hình ảnh...): " +
        "CHỈ dựa trên đúng nội dung phần TÀI LIỆU bên dưới. Có thể trích nguyên số liệu, điều kiện, mốc thời gian và nêu mã thông báo nếu có. " +
        "Tuyệt đối không bịa hoặc suy đoán số liệu, điều kiện, tên sản phẩm không có trong tài liệu. " +
        "Nếu tài liệu không có hoặc không đủ rõ, nói thẳng là chưa có thông tin này trong tài liệu, rồi kết thúc bằng đúng câu: \"Nếu cần thêm thông tin, vui lòng liên hệ quản lí hoặc Mr. Lâm Anh để được hỗ trợ.\" (không gợi ý liên hệ phòng ban hay người nào khác); nhưng nếu vẫn giúp được phần nào (ví dụ giải thích cách hiểu, cách áp dụng phần đã có) thì giúp luôn thay vì chỉ từ chối.\n\n" +
        "2) HỎI VỀ KỸ NĂNG BÁN HÀNG / TƯ VẤN / CÁCH LÀM (cách giới thiệu sản phẩm, thuyết phục khách, xử lý từ chối, so sánh, mở đầu cuộc nói chuyện, chốt đơn, chăm sóc khách, giải thích dễ hiểu...): " +
        "trả lời linh hoạt, nhẹ nhàng, thực tế bằng kiến thức bán hàng chung, có thể đưa ví dụ câu nói mẫu và các bước ngắn gọn. " +
        "Khi có thể, gắn với điểm mạnh sản phẩm hoặc chính sách có trong TÀI LIỆU để lời tư vấn sát thực tế. " +
        "Ghi rõ phần nào là gợi ý kỹ năng tham khảo chung (không phải quy định của công ty). " +
        "Vẫn KHÔNG tự đặt ra con số giảm giá, quà tặng, chương trình khuyến mại hay cam kết không có trong tài liệu.\n\n" +
        "Nếu câu hỏi trộn cả hai (ví dụ: \"giá này thì bán thế nào\"), hãy tách rõ: nêu phần số liệu theo tài liệu trước, rồi gợi ý cách bán. " +
        "Câu hỏi nối tiếp (\"giá này\", \"sản phẩm đó\", \"còn loại kia\") phải hiểu theo cuộc trò chuyện trước đó. " +
        "Chào hỏi, cảm ơn hay trò chuyện xã giao thì đáp lại thân thiện, ngắn gọn rồi hỏi bạn cần tra cứu gì. " +
        "Không trả lời chủ đề hoàn toàn không liên quan đến công việc bán hàng, sản phẩm, chính sách của công ty.\n\n" +
        "MẠCH TRÒ CHUYỆN (rất quan trọng, phải nói chuyện liền mạch như người thật):\n" +
        "- Chỉ chào ở tin đầu tiên hoặc khi người dùng vừa chào. Các câu trả lời sau KHÔNG mở đầu bằng \"Chào bạn\", \"Xin chào\", \"Xin lỗi\" lặp lại, vào thẳng nội dung.\n" +
        "- Không kết thúc mọi câu trả lời bằng câu hỏi chung chung như \"Còn gì mình có thể hỗ trợ thêm không?\". Chỉ gợi ý bước tiếp theo khi thật sự có ích và phải cụ thể (ví dụ: \"Bạn muốn mình so sánh với model 30L không?\").\n" +
        "- Tin ngắn như \"có\", \"ok\", \"tiếp đi\", \"rồi sao\" là phản hồi cho câu bạn vừa hỏi hoặc gợi ý ở lượt trước: làm tiếp đúng việc đó, tuyệt đối không quay về lời chào hay hỏi lại từ đầu.\n" +
        "- Nếu người dùng dán lại một đoạn từ câu trả lời trước kèm một câu hỏi ngắn, hiểu đoạn dán là NGỮ CẢNH và câu hỏi ngắn là ý chính cần trả lời, ví dụ \"khách hàng mất tiền không\" nghĩa là khoản đó có thu phí hay không.\n" +
        "- Hiểu ý theo ngữ cảnh gần nhất và trả lời luôn. Chỉ hỏi lại một câu ngắn khi thật sự không đoán được; không bắt người dùng nói lại.\n" +
        "- Khi tài liệu không có đúng phần được hỏi, nói rõ cụ thể thiếu gì (ví dụ: \"tài liệu chỉ nói công ty cung cấp kệ trưng bày, không nói có thu phí hay không\") và nêu phần liên quan đã có, thay vì từ chối chung chung.\n" +
        "- Giữ giọng nhất quán, đoạn văn liền ý, không dùng biểu tượng cảm xúc trừ khi người dùng dùng trước.\n\n" +
        "Trình bày: ưu tiên câu ngắn, dùng gạch đầu dòng khi có nhiều ý, in đậm số liệu quan trọng.\n\n" +
        "TÀI LIỆU:\n" + kb.pickRelevant(searchText, 9000, await kb.getSections());

      let answer;
      try {
        answer = await llm.chat([{ role: "system", content: sys }].concat(hist, [{ role: "user", content: question }]), { temperature: 0.4, max_tokens: 900, timeoutMs: 25000 });
      } catch (e) {
        context.log.error("kai ask", e && e.message, e && e.status, "promptChars:", sys.length);
        return reply(context, 502, { ok: false, error: "Trợ lí đang bận hoặc chưa sẵn sàng, thử lại sau." }, headers);
      }
      const newUsed = await usageInc(usageKey);
      return reply(context, 200, { ok: true, answer, used: newUsed, limit, unlimited }, headers);
    }

    return reply(context, 400, { ok: false, error: "Yêu cầu không hợp lệ." });
  } catch (e) {
    context.log.error("kai", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra, thử lại sau." });
  }
};
