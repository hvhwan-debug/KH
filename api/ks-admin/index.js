// Chỉ ADMIN_EMAILS (đăng nhập qua /kiemtra/admin): tạo / sửa / xoá khảo sát, xem và xoá phiếu trả lời.
// GET  ?op=list | get&code= | results&code=
// POST {op:"save"|"delete"|"delresp", ...}
const { reply, guardConfigured, requireAjax, requireUserActive } = require("../_lib/http");
const { isAdmin } = require("../_lib/config");
const store = require("../_lib/store");
const quiz = require("../_lib/quiz");
const ks = require("../_lib/survey");
const ksai = require("../_lib/ksai");

const posInt = (v, max) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0; };
const ts = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };


async function loadRows(code) {
  const prefix = ks.respPrefix(code), names = await store.list(prefix), rows = [];
  for (let i = 0; i < names.length; i += 25) {
    const part = await Promise.all(names.slice(i, i + 25).map((n) => store.get(n).catch(() => null)));
    part.forEach((x, k) => { if (x) rows.push(Object.assign({ id: names[i + k].slice(prefix.length).replace(/\.json$/, "") }, x)); });
  }
  rows.sort((a, b) => a.submittedAt - b.submittedAt);
  return rows;
}

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

    // Danh sách nhân sự từ Hồ sơ học tập để gán người tham gia (kèm khoá đã chuẩn hoá để giao diện lọc giống máy chủ)
    if (op === "roster" && !post) {
      const list = await quiz.getCandidates();
      const rows = list.map((c) => Object.assign({ code: String(c.code || ""), name: c.name || "", manager: c.manager || "", title: quiz.titleOf(c), province: c.province || "", left: !!quiz.isLeft(c) }, ks.candKeys(c)));
      return reply(context, 200, { ok: true, rows });
    }

    if (op === "results" && !post) {
      if (!ks.validCode(code)) return reply(context, 400, { ok: false, error: "Mã không hợp lệ." });
      const rows = await loadRows(code);
      const out = { ok: true, rows };
      const sv = await ks.getSurvey(code);
      if (sv && sv.identity === "roster") { // tiến độ theo nhân sự được gán
        const done = new Set(rows.map((r) => r.nc).filter(Boolean));
        out.staff = (await quiz.getCandidates()).filter((c) => ks.inAudience(sv.audience, c)).map((c) => {
          const k = ks.candKeys(c);
          return { code: String(c.code || ""), name: c.name || "", manager: c.manager || "", title: quiz.titleOf(c), phone: c.phone || "", done: done.has(k.nc) };
        });
      }
      return reply(context, 200, out);
    }

    // ---------- AI (chỉ quản trị viên) ----------
    if (op === "ai_get" && !post) {
      if (!ks.validCode(code)) return reply(context, 400, { ok: false, error: "Mã không hợp lệ." });
      return reply(context, 200, { ok: true, ai: await store.get("ks/ai/" + code + ".json"), n: await ks.countResponses(code) });
    }
    if (op === "ai_draft" && post) {
      const r = await ksai.draft({ prompt: q.prompt, count: q.count, audience: q.audience, logic: q.logic });
      return r.error ? reply(context, 422, { ok: false, error: r.error }) : reply(context, 200, Object.assign({ ok: true }, r));
    }
    if (op === "ai_review" && post) {
      const r = await ksai.review({ title: q.title, description: q.description, questions: q.questions });
      return r.error ? reply(context, 422, { ok: false, error: r.error }) : reply(context, 200, Object.assign({ ok: true }, r));
    }
    if (op === "ai_analyze" && post) {
      if (!ks.validCode(code)) return reply(context, 400, { ok: false, error: "Mã không hợp lệ." });
      const sv = await ks.getSurvey(code);
      if (!sv) return reply(context, 404, { ok: false, error: "Không có khảo sát này." });
      const r = await ksai.analyze(sv, await loadRows(code));
      if (r.error) return reply(context, 422, { ok: false, error: r.error });
      const ai = { at: Date.now(), n: r.n, by: u.email, result: r.result };
      await store.put("ks/ai/" + code + ".json", ai);
      return reply(context, 200, { ok: true, ai, n: r.n });
    }

    // Xem thử bản ĐANG SOẠN (chưa lưu): chạy đúng bước làm sạch/kiểm tra như khi lưu nhưng không ghi gì.
    // Nhờ vậy xem thử luôn khớp với cái sẽ được lưu, và lỗi (nếu có) báo ngay tại nút Xem thử.
    if (op === "preview" && post) {
      let questions;
      try { questions = ks.cleanQuestions(q.questions); } catch (e) { return reply(context, 400, { ok: false, error: e.message }); }
      return reply(context, 200, { ok: true, survey: {
        code: ks.validCode(code) ? code : "xem-thu", title: ks.str(q.title, 200) || "(chưa đặt tên)",
        description: ks.str(q.description, 2000), thanks: ks.str(q.thanks, 500),
        identity: ["none", "name", "emp", "roster"].includes(q.identity) ? q.identity : "none",
        showProgress: q.showProgress !== false, flow: ["auto", "page", "step"].includes(q.flow) ? q.flow : "auto", questions
      } });
    }

    if (op === "save" && post) {
      if (!ks.validCode(code)) return reply(context, 400, { ok: false, error: "Mã khảo sát chỉ gồm chữ thường, số, gạch ngang (2–40 ký tự)." });
      const title = ks.str(q.title, 200);
      if (!title) return reply(context, 400, { ok: false, error: "Cần nhập tên khảo sát." });
      let questions;
      try { questions = ks.cleanQuestions(q.questions); } catch (e) { return reply(context, 400, { ok: false, error: e.message }); }
      const openAt = ts(q.openAt), closeAt = ts(q.closeAt);
      if (openAt && closeAt && closeAt <= openAt) return reply(context, 400, { ok: false, error: "Giờ đóng phải sau giờ mở." });
      const identity = ["none", "name", "emp", "roster"].includes(q.identity) ? q.identity : "none";
      const old = await ks.getSurvey(code);
      // Khảo sát MỚI không được ghi đè lên khảo sát đã có cùng mã (tránh vô tình mất nội dung cũ)
      if (q.create && old) return reply(context, 409, { ok: false, error: "Mã \"" + code + "\" đã có khảo sát khác dùng. Hãy đặt mã khác, hoặc mở khảo sát đó bằng nút Sửa." });
      const s = {
        code, title, questions,
        description: ks.str(q.description, 2000), thanks: ks.str(q.thanks, 500),
        identity, audience: identity === "roster" ? ks.cleanAudience(q.audience) : null,
        showProgress: q.showProgress !== false, flow: ["auto", "page", "step"].includes(q.flow) ? q.flow : "auto", open: q.open !== false,
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
