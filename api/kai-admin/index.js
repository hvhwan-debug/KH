// Quản trị trợ lí KAI (chỉ ADMIN_EMAILS):
// - Tài liệu: thêm / sửa / bật-tắt / xoá văn bản chính sách (lưu kai/docs.json, KAI đọc cùng tài liệu có sẵn trong mã nguồn).
// - Người dùng: xem mức dùng hôm nay, đổi hạn mức riêng, khoá / mở khoá, đặt lại lượt hỏi, xoá người dùng đã duyệt.
// - Cài đặt chung: hạn mức mặc định, số câu dùng thử, tạm dừng KAI.
const crypto = require("crypto");
const { reply, guardConfigured, requireAjax, requireUserActive } = require("../_lib/http");
const { isAdmin, validEmail } = require("../_lib/config");
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
    if (op === "docImportUrl") {
      const url = String(b.url || "").trim();
      if (!/^https?:\/\//i.test(url)) return reply(context, 400, { ok: false, error: "Nhập đúng địa chỉ URL (bắt đầu bằng http:// hoặc https://)." });
      let html;
      try {
        const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 12000);
        let r;
        try { r = await fetch(url, { signal: ac.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; KAI-bot/1.0)" } }); }
        finally { clearTimeout(t); }
        if (!r.ok) return reply(context, 502, { ok: false, error: "Không tải được trang (HTTP " + r.status + ")." });
        html = await r.text();
      } catch (e) {
        return reply(context, 502, { ok: false, error: "Không tải được trang này, kiểm tra lại URL hoặc thử lại sau." });
      }
      const title = (kb.extractTitleFromHtml ? kb.extractTitleFromHtml(html) : "") || url;
      const text = (kb.extractTextFromHtml ? kb.extractTextFromHtml(html) : "").slice(0, MAX_TEXT);
      if (!text) return reply(context, 502, { ok: false, error: "Không đọc được nội dung chữ từ trang này." });
      return reply(context, 200, { ok: true, title, text, url });
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
    if (op === "questionLog" || op === "questionsOf") {
      const log = (await store.get("kai/log.json")) || [];
      const days = Number(b.days) > 0 ? Number(b.days) : (op === "questionLog" ? 30 : 0);   // 0 = tất cả
      const since = days ? Date.now() - days * 24 * 3600 * 1000 : 0;
      const [cands, appr] = await Promise.all([quiz.getCandidates(), store.get("kai/approved.json")]);
      const info = {};
      (appr || []).forEach((c) => { info[code(c.code)] = { name: c.name || "", email: c.email || "" }; });
      (cands || []).forEach((c) => { info[code(c.code)] = { name: c.name || "", email: c.email || "" }; });
      const keyOf = (x) => x.code ? code(x.code) : (x.anon ? "anon:" + x.anon : "");   // "" = khách cũ chưa có mã ẩn danh
      const inRange = log.filter((x) => x.ts >= since);
      if (op === "questionsOf") {
        const key = String(b.key || ""), qs = String(b.q || "").trim().toLowerCase();
        let items = inRange.filter((x) => keyOf(x) === key);
        if (qs) items = items.filter((x) => String(x.question || "").toLowerCase().indexOf(qs) >= 0);
        const first = inRange.find((x) => keyOf(x) === key) || {};
        const inf = info[key] || {};
        const guest = !key || key.indexOf("anon:") === 0;
        return reply(context, 200, { ok: true, person: { key, guest, code: guest ? "" : key, name: inf.name || first.name || "", email: inf.email || "" },
          total: items.length, items: items.slice(0, 500).map((x) => ({ ts: x.ts, question: x.question })) });
      }
      const byEmp = {};
      inRange.forEach((x) => {
        const key = keyOf(x);
        if (!byEmp[key]) { const inf = info[key] || {}; byEmp[key] = { key, code: x.code ? code(x.code) : "", name: inf.name || x.name || "", email: inf.email || "", guest: !x.code, count: 0, last: 0 }; }
        byEmp[key].count++; byEmp[key].last = Math.max(byEmp[key].last, x.ts);
      });
      const people = Object.keys(byEmp).map((k) => byEmp[k]).sort((a, z) => z.count - a.count);
      return reply(context, 200, { ok: true, total: log.length, total30: inRange.length, days, people, recent: log.slice(0, 100) });
    }
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
    // Chủ động cấp quyền dùng KAI cho nhiều người một lần (không cần chờ họ gửi yêu cầu).
    if (op === "approvedAdd") {
      const items = Array.isArray(b.items) ? b.items.slice(0, 200) : [];
      if (!items.length) return reply(context, 400, { ok: false, error: "Nhập ít nhất một người." });
      const [list, pend, cands, cfgK] = await Promise.all([store.get("kai/approved.json"), store.get("kai/pending.json"), quiz.getCandidates(), kb.getSettings()]);
      const appr = list || [], pending = pend || [];
      const added = [], skipped = [], invalid = [];
      let limit = null;
      if (b.limit !== undefined && b.limit !== null && b.limit !== "") {
        limit = Number(b.limit);
        if (!Number.isFinite(limit) || limit < 1 || limit > 500) return reply(context, 400, { ok: false, error: "Hạn mức phải từ 1 đến 500 câu/ngày." });
        limit = Math.round(limit);
      }
      items.forEach((it) => {
        const c = code(it && it.code), e = quiz.normEmail(it && it.email), name = String((it && it.name) || "").trim().slice(0, 100);
        if (!c || c.length > 40 || !e || !validEmail(e)) { invalid.push(String((it && it.code) || "") + " / " + String((it && it.email) || "")); return; }
        const inCands = (cands || []).some((x) => code(x.code) === c && quiz.normEmail(x.email) === e);
        const inAppr = appr.some((x) => code(x.code) === c && quiz.normEmail(x.email) === e);
        if (!inAppr && !inCands) appr.push({ code: c, email: e, name, addedBy: u.email, addedAt: Date.now() });
        if (inAppr || inCands) skipped.push(c); else added.push(c);
        pending.forEach((p) => { if (p.status === "pending" && code(p.code) === c && quiz.normEmail(p.email) === e) { p.status = "approved"; p.doneAt = Date.now(); } });
        if (limit) cfgK.limits[c] = limit;
        if (b.unlimited) cfgK.unlimited[c] = true;
        if (b.unlimited === false) delete cfgK.unlimited[c];
      });
      if (added.length) await store.put("kai/approved.json", appr);
      await store.put("kai/pending.json", pending);
      if (limit || b.unlimited !== undefined) await kb.saveSettings(cfgK);
      return reply(context, 200, { ok: true, added, skipped, invalid });
    }
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
