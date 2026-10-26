// Quản trị trợ lí KAI (chỉ ADMIN_EMAILS):
// - Tài liệu: thêm / sửa / bật-tắt / xoá văn bản chính sách (lưu kai/docs.json, KAI đọc cùng tài liệu có sẵn trong mã nguồn).
// - Người dùng: xem mức dùng hôm nay, đổi hạn mức riêng, khoá / mở khoá, đặt lại lượt hỏi, xoá người dùng đã duyệt.
// - Cài đặt chung: hạn mức mặc định, số câu dùng thử, tạm dừng KAI.
const crypto = require("crypto");
const { reply, guardConfigured, requireAjax, requireUserActive } = require("../_lib/http");
const { isAdmin } = require("../_lib/config");
const store = require("../_lib/store");
const quiz = require("../_lib/quiz");
const kb = require("../_lib/kai-kb");

const MAX_DOCS = 100, MAX_TEXT = 60000, MAX_TITLE = 150;
function vnDate(ts) { return new Date((ts || Date.now()) + 7 * 3600 * 1000).toISOString().slice(0, 10); }
const EMP_RE = /^kai\/usage\/emp-(.+)-(\d{4}-\d{2}-\d{2})\.json$/;
const code = (v) => quiz.normCode(v);

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    if (req.method !== "POST") return reply(context, 405, { ok: false, error: "Phương thức không hợp lệ." });
    if (!requireAjax(context, req)) return;
    const u = await requireUserActive(context, req);
    if (!u) return;
    if (!isAdmin(u.email)) return reply(context, 403, { ok: false, error: "Bạn không có quyền quản trị." });
    const b = req.body || {};
    const op = b.op;

    // ---------- Tài liệu ----------
    if (op === "docList") {
      const docs = await kb.getDocs();
      return reply(context, 200, {
        ok: true,
        docs: docs.map((d) => ({ id: d.id, title: d.title, enabled: d.enabled !== false, chars: (d.text || "").length, chunks: kb.chunkText(d.title, d.text).length, updatedAt: d.updatedAt, updatedBy: d.updatedBy || "" })),
        builtin: kb.STATIC_SECTIONS.map((x) => ({ title: x.title, chars: x.text.length })),
        limits: { maxDocs: MAX_DOCS, maxText: MAX_TEXT }
      });
    }
    if (op === "docGet") {
      const d = (await kb.getDocs()).find((x) => x.id === String(b.id || ""));
      if (!d) return reply(context, 404, { ok: false, error: "Không tìm thấy tài liệu." });
      return reply(context, 200, { ok: true, doc: d });
    }
    if (op === "docSave") {
      const title = String(b.title || "").trim().slice(0, MAX_TITLE);
      const text = String(b.text || "").replace(/\r/g, "").trim();
      if (!title) return reply(context, 400, { ok: false, error: "Nhập tiêu đề tài liệu." });
      if (text.length < 20) return reply(context, 400, { ok: false, error: "Nội dung quá ngắn." });
      if (text.length > MAX_TEXT) return reply(context, 400, { ok: false, error: "Nội dung quá dài (tối đa " + MAX_TEXT + " ký tự). Hãy tách thành nhiều tài liệu." });
      const docs = await kb.getDocs();
      const now = Date.now();
      let d = b.id ? docs.find((x) => x.id === String(b.id)) : null;
      if (b.id && !d) return reply(context, 404, { ok: false, error: "Không tìm thấy tài liệu." });
      if (!d) {
        if (docs.length >= MAX_DOCS) return reply(context, 400, { ok: false, error: "Đã đủ " + MAX_DOCS + " tài liệu, hãy xoá bớt." });
        d = { id: "doc" + now.toString(36) + crypto.randomBytes(3).toString("hex"), createdAt: now };
        docs.unshift(d);
      }
      Object.assign(d, { title, text, enabled: b.enabled !== false, updatedAt: now, updatedBy: u.email });
      await kb.saveDocs(docs);
      return reply(context, 200, { ok: true, id: d.id, chunks: kb.chunkText(title, text).length });
    }
    if (op === "docToggle" || op === "docDelete") {
      const docs = await kb.getDocs();
      const i = docs.findIndex((x) => x.id === String(b.id || ""));
      if (i < 0) return reply(context, 404, { ok: false, error: "Không tìm thấy tài liệu." });
      if (op === "docDelete") docs.splice(i, 1); else { docs[i].enabled = !!b.enabled; docs[i].updatedAt = Date.now(); docs[i].updatedBy = u.email; }
      await kb.saveDocs(docs);
      return reply(context, 200, { ok: true });
    }

    // ---------- Người dùng & cài đặt ----------
    if (op === "usage") {
      const [cfgK, names, cands, appr] = await Promise.all([kb.getSettings(), store.list("kai/usage/emp-"), quiz.getCandidates(), store.get("kai/approved.json")]);
      const today = vnDate();
      const perDay = {}, todayCodes = [];
      names.forEach((n) => {
        const m = EMP_RE.exec(n); if (!m) return;
        (perDay[m[2]] = perDay[m[2]] || new Set()).add(m[1]);
        if (m[2] === today) todayCodes.push(m[1]);
      });
      const info = {};
      (cands || []).forEach((c) => { info[code(c.code)] = { name: c.name || "", email: c.email || "" }; });
      (appr || []).forEach((c) => { const k = code(c.code); info[k] = Object.assign({ approved: true }, info[k] || {}, { name: (info[k] && info[k].name) || c.name || "", email: (info[k] && info[k].email) || c.email || "" }); });
      const counts = {};
      await Promise.all(todayCodes.map(async (c) => { const v = await store.get("kai/usage/emp-" + c + "-" + today + ".json"); counts[c] = (v && v.count) || 0; }));
      const all = new Set(todayCodes.concat(Object.keys(cfgK.blocked), Object.keys(cfgK.limits), Object.keys(cfgK.unlimited)));
      const users = Array.from(all).map((c) => ({
        code: c, name: (info[c] || {}).name || "", email: (info[c] || {}).email || "", used: counts[c] || 0,
        limit: cfgK.limits[c] || cfgK.defaultLimit, custom: !!cfgK.limits[c], blocked: !!cfgK.blocked[c], unlimited: !!cfgK.unlimited[c]
      })).sort((a, z) => z.used - a.used);
      const days = Object.keys(perDay).sort().slice(-7).map((d) => ({ day: d, users: perDay[d].size }));
      const anon = (await store.list("kai/usage/anon-")).length;
      return reply(context, 200, { ok: true, settings: cfgK, users, days, today, totalToday: users.reduce((a, x) => a + x.used, 0), anonVisitors: anon });
    }
    if (op === "settingsSave") {
      const cur = await kb.getSettings();
      const next = Object.assign({}, cur, {
        defaultLimit: b.defaultLimit != null ? b.defaultLimit : cur.defaultLimit,
        anonLimit: b.anonLimit != null ? b.anonLimit : cur.anonLimit,
        paused: b.paused != null ? !!b.paused : cur.paused,
        pausedMsg: b.pausedMsg != null ? String(b.pausedMsg).slice(0, 300) : cur.pausedMsg
      });
      await kb.saveSettings(next);
      return reply(context, 200, { ok: true, settings: await kb.getSettings() });
    }
    if (op === "userSet") {
      const c = code(b.code);
      if (!c) return reply(context, 400, { ok: false, error: "Nhập mã nhân viên." });
      const cur = await kb.getSettings();
      if (b.limit !== undefined) {
        const n = Number(b.limit);
        if (b.limit === null || b.limit === "" ) delete cur.limits[c];
        else if (Number.isFinite(n) && n >= 1 && n <= 500) cur.limits[c] = Math.round(n);
        else return reply(context, 400, { ok: false, error: "Hạn mức phải từ 1 đến 500 câu/ngày." });
      }
      if (b.unlimited !== undefined) { if (b.unlimited) cur.unlimited[c] = true; else delete cur.unlimited[c]; }
      if (b.blocked !== undefined) { if (b.blocked) cur.blocked[c] = true; else delete cur.blocked[c]; }
      await kb.saveSettings(cur);
      return reply(context, 200, { ok: true });
    }
    if (op === "userReset") {
      const c = code(b.code);
      if (!c) return reply(context, 400, { ok: false, error: "Thiếu mã nhân viên." });
      await store.del("kai/usage/emp-" + c + "-" + vnDate() + ".json");
      return reply(context, 200, { ok: true });
    }
    if (op === "approvedList") return reply(context, 200, { ok: true, list: (await store.get("kai/approved.json")) || [] });
    if (op === "approvedRemove") {
      const list = (await store.get("kai/approved.json")) || [];
      const next = list.filter((x) => !(code(x.code) === code(b.code) && quiz.normEmail(x.email) === quiz.normEmail(b.email)));
      await store.put("kai/approved.json", next);
      return reply(context, 200, { ok: true, removed: list.length - next.length });
    }
    return reply(context, 400, { ok: false, error: "Yêu cầu không hợp lệ." });
  } catch (e) {
    context.log.error("kai-admin", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra, thử lại sau." });
  }
};
