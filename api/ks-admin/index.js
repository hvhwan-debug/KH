// Chỉ ADMIN_EMAILS (đăng nhập qua /kiemtra/admin): tạo / sửa / xoá khảo sát, xem và xoá phiếu trả lời.
// GET  ?op=list | get&code= | results&code=
// POST {op:"save"|"delete"|"delresp", ...}
const { reply, guardConfigured, requireAjax, requireUserActive } = require("../_lib/http");
const { isAdmin } = require("../_lib/config");
const store = require("../_lib/store");
const ks = require("../_lib/survey");

const posInt = (v, max) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0; };
const ts = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    const u = await requireUserActive(context, req);
    if (!u) return;
    if (!isAdmin(u.email)) return reply(context, 403, { ok: false, error: "Bạn không có quyền quản trị." });
    const post = req.method === "POST";
    if (post && !requireAjax(context, req)) return;
    const q = Object.assign({}, req.query || {}, post ? (req.body || {}) : {});
    const op = String(q.op || "");
    const code = String(q.code || "").trim().toLowerCase();

    if (op === "list" && !post) {
      const names = (await store.list("ks/survey/")).filter((n) => n.endsWith(".json"));
      const all = (await Promise.all(names.map((n) => store.get(n).catch(() => null)))).filter(Boolean);
      const counts = await Promise.all(all.map((s) => ks.countResponses(s.code).catch(() => 0)));
      const items = all.map((s, i) => ({ code: s.code, title: s.title, state: ks.state(s), count: counts[i], max: s.maxResponses || 0, createdAt: s.createdAt || 0 }))
        .sort((a, b) => b.createdAt - a.createdAt);
      return reply(context, 200, { ok: true, items });
    }

    if (op === "get" && !post) {
      const s = await ks.getSurvey(code);
      if (!s) return reply(context, 404, { ok: false, error: "Không có khảo sát này." });
      if (!s.identity) s.identity = s.askIdentity ? "emp" : "none"; // khảo sát tạo từ bản cũ
      return reply(context, 200, { ok: true, survey: s });
    }

    if (op === "results" && !post) {
      if (!ks.validCode(code)) return reply(context, 400, { ok: false, error: "Mã không hợp lệ." });
      const prefix = ks.respPrefix(code), names = await store.list(prefix);
      const rows = [];
      for (let i = 0; i < names.length; i += 25) {
        const part = await Promise.all(names.slice(i, i + 25).map((n) => store.get(n).catch(() => null)));
        part.forEach((x, k) => { if (x) rows.push(Object.assign({ id: names[i + k].slice(prefix.length).replace(/\.json$/, "") }, x)); });
      }
      rows.sort((a, b) => a.submittedAt - b.submittedAt);
      return reply(context, 200, { ok: true, rows });
    }

    if (op === "save" && post) {
      if (!ks.validCode(code)) return reply(context, 400, { ok: false, error: "Mã khảo sát chỉ gồm chữ thường, số, gạch ngang (2–40 ký tự)." });
      const title = ks.str(q.title, 200);
      if (!title) return reply(context, 400, { ok: false, error: "Cần nhập tên khảo sát." });
      let questions;
      try { questions = ks.cleanQuestions(q.questions); } catch (e) { return reply(context, 400, { ok: false, error: e.message }); }
      const openAt = ts(q.openAt), closeAt = ts(q.closeAt);
      if (openAt && closeAt && closeAt <= openAt) return reply(context, 400, { ok: false, error: "Giờ đóng phải sau giờ mở." });
      const old = await ks.getSurvey(code);
      const s = {
        code, title, questions,
        description: ks.str(q.description, 2000), thanks: ks.str(q.thanks, 500),
        identity: ["none", "name", "emp"].includes(q.identity) ? q.identity : "none",
        showProgress: q.showProgress !== false, open: q.open !== false,
        openAt, closeAt, maxResponses: posInt(q.maxResponses, 1000000),
        createdAt: old ? old.createdAt : Date.now(), updatedAt: Date.now(), updatedBy: u.email
      };
      await store.put(ks.surveyKey(code), s);
      const n = old ? await ks.countResponses(code).catch(() => 0) : 0;
      return reply(context, 200, { ok: true, link: "/kiemtra/ks=" + code, existing: n });
    }

    if (op === "delete" && post) {
      if (!ks.validCode(code)) return reply(context, 400, { ok: false, error: "Mã không hợp lệ." });
      await store.del(ks.surveyKey(code)); // kết quả đã thu giữ nguyên trong kho, chỉ link ngừng hoạt động
      return reply(context, 200, { ok: true });
    }

    if (op === "delresp" && post) {
      const id = String(q.id || "").replace(/[^a-z0-9._-]/gi, "");
      if (!ks.validCode(code) || !id) return reply(context, 400, { ok: false, error: "Thiếu mã khảo sát hoặc mã phiếu." });
      await store.del(ks.respPrefix(code) + id + ".json");
      return reply(context, 200, { ok: true });
    }

    return reply(context, 400, { ok: false, error: "Thao tác không hợp lệ." });
  } catch (e) {
    context.log.error(e);
    return reply(context, 500, { ok: false, error: "Lỗi máy chủ." });
  }
};
