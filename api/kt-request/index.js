// Công khai: thí sinh (đã xác thực bằng mã NV + email) gửi yêu cầu điều chỉnh thông tin cá nhân.
// Dữ liệu CHƯA được cập nhật: quản trị viên xem và xác nhận ở trang quản trị.
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const quiz = require("../_lib/quiz");
const cr = require("../_lib/changereq");
const { normPhone, normName } = require("../_lib/phone");

const clean = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    if (req.method !== "POST") return reply(context, 405, { ok: false, error: "Phương thức không hợp lệ." });
    if (!requireAjax(context, req)) return;
    if (quiz.tooManyFails(req, 8, 10 * 60 * 1000)) return reply(context, 429, { ok: false, error: "Bạn đã thử quá nhiều lần. Vui lòng đợi vài phút rồi thử lại." });
    const b = req.body || {};
    const code = quiz.normCode(b.code), email = quiz.normEmail(b.email);
    if (!code || !email) return reply(context, 400, { ok: false, error: "Thiếu thông tin thí sinh." });
    const candidates = await quiz.getCandidates();
    const found = candidates.find((c) => quiz.normCode(c.code) === code && quiz.normEmail(c.email) === email);
    if (!found) { quiz.noteFail(req); return reply(context, 404, { ok: false, error: "Không tìm thấy thí sinh." }); }

    const inp = b.changes && typeof b.changes === "object" ? b.changes : {};
    const proposed = {};
    if (inp.name != null) {
      const n = normName(inp.name);
      if (!n) return reply(context, 400, { ok: false, error: "Họ và tên chưa hợp lệ (cần ghi đầy đủ họ và tên, không có chữ số)." });
      proposed.name = n;
    }
    if (inp.email != null) {
      const e = quiz.normEmail(inp.email);
      if (!/^\S+@\S+\.\S+$/.test(e) || e.length > 120) return reply(context, 400, { ok: false, error: "Email chưa đúng định dạng." });
      proposed.email = e;
    }
    if (inp.phone != null && String(inp.phone).trim()) {
      const p = normPhone(inp.phone);
      if (!p) return reply(context, 400, { ok: false, error: "Số điện thoại chưa đúng (cần 10 số, bắt đầu bằng 0)." });
      proposed.phone = p;
    }
    if (inp.manager != null) proposed.manager = clean(inp.manager, 100);
    if (inp.title != null) proposed.title = quiz.normTitle(inp.title) || quiz.DEFAULT_TITLE;
    if (inp.segment != null) proposed.segment = quiz.normSegment(inp.segment);

    const cur = {
      name: String(found.name || ""), email: quiz.normEmail(found.email), manager: String(found.manager || ""), title: quiz.titleOf(found),
      segment: quiz.normSegment(found.segment), phone: normPhone(found.phone)
    };
    const changes = {};
    cr.FIELDS.forEach((k) => {
      if (proposed[k] === undefined) return;
      const same = k === "manager" ? quiz.normPerson(proposed[k]) === quiz.normPerson(cur[k]) : String(proposed[k]) === String(cur[k]);
      if (!same) changes[k] = { from: cur[k], to: proposed[k] };
    });
    const note = clean(b.note, 500);
    if (!Object.keys(changes).length && !note) return reply(context, 400, { ok: false, error: "Bạn chưa thay đổi thông tin nào. Hãy sửa ô cần chỉnh hoặc ghi chú nội dung cần điều chỉnh." });

    const list = await cr.getAll();
    const rest = list.filter((r) => !(r.status === "pending" && quiz.normCode(r.code) === code)); // yêu cầu mới thay yêu cầu đang chờ cũ
    rest.unshift({ id: cr.newId(), code: found.code, name: cur.name, status: "pending", at: Date.now(), changes, note });
    await cr.saveAll(rest);
    return reply(context, 200, { ok: true });
  } catch (e) {
    context.log.error("kt-request", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra, thử lại sau." });
  }
};
