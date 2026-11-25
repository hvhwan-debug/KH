// Kết quả số bán theo tháng (Salerep GT): chỉ quản trị viên (ADMIN_EMAILS).
// Lưu mỗi tháng một tệp kt/sales/YYYY-MM.json trong kho lưu trữ (KHÔNG để số liệu nhân sự trong repo vì repo công khai).
// Xoá một tháng = ghi dấu xoá (giữ dấu vết ai xoá, lúc nào).
const { reply, guardConfigured, requireAjax, requireUserActive } = require("../_lib/http");
const { isAdmin } = require("../_lib/config");
const store = require("../_lib/store");

const PREFIX = "kt/sales/";
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_ROWS = 3000;
const s = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n || 120);
const n = (v) => { const x = Number(v); return v == null || v === "" || !isFinite(x) ? null : Math.round(x * 1e6) / 1e6; };

function clean(b) {
  const month = s(b.month, 7);
  if (!MONTH.test(month)) throw new Error("Tháng không hợp lệ.");
  if (!Array.isArray(b.rows) || !b.rows.length) throw new Error("Không có dòng dữ liệu nào.");
  if (b.rows.length > MAX_ROWS) throw new Error("Quá nhiều dòng (tối đa " + MAX_ROWS + ").");
  const extras = (Array.isArray(b.extras) ? b.extras : []).slice(0, 12).map((x, i) => ({ key: "x" + i, label: s(x && x.label, 60) }));
  const rows = b.rows.map((r) => {
    r = r || {};
    const ex = {};
    extras.forEach((x, i) => { const v = n(r.extra && r.extra["x" + i]); if (v != null) ex[x.key] = v; });
    return {
      stt: n(r.stt), mien: s(r.mien, 20), asmCode: s(r.asmCode, 30).toUpperCase(), asmName: s(r.asmName, 80),
      code: s(r.code, 30).toUpperCase(), name: s(r.name, 80), joinDate: /^\d{4}-\d{2}-\d{2}$/.test(r.joinDate || "") ? r.joinDate : "",
      pos: s(r.pos, 30), kv: s(r.kv, 30), route: s(r.route, 120), nppCode: s(r.nppCode, 30), nppName: s(r.nppName, 160), channel: s(r.channel, 30),
      target: n(r.target), actual: n(r.actual) || 0, htFile: n(r.htFile), probation: s(r.probation, 40), extra: ex
    };
  }).filter((r) => r.code || r.name);
  if (!rows.length) throw new Error("Không có dòng nhân viên hợp lệ.");
  const el = n(b.elapsed);
  return { v: 1, month, title: s(b.title, 160), elapsed: el != null && el >= 0 && el <= 1 ? el : null, extras, rows,
    source: { file: s(b.fileName, 200) } };
}

function summary(d) {
  const t = d.rows.reduce((a, r) => a + (r.target || 0), 0), act = d.rows.reduce((a, r) => a + (r.actual || 0), 0);
  return { month: d.month, title: d.title, count: d.rows.length, target: t, actual: act, elapsed: d.elapsed,
    updatedAt: d.updatedAt || 0, by: d.by || "", file: (d.source && d.source.file) || "" };
}

async function loadAll() {
  const out = {};
  const names = await store.list(PREFIX);
  const docs = await Promise.all(names.filter((x) => /\d{4}-\d{2}\.json$/.test(x)).map((x) => store.get(x).catch(() => null)));
  docs.forEach((d) => { if (d && MONTH.test(d.month)) { if (d.deleted) delete out[d.month]; else out[d.month] = d; } });
  return out;
}

module.exports = require("../_lib/auditlog").wrap(async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    const u = await requireUserActive(context, req);
    if (!u) return;
    if (!isAdmin(u.email)) return reply(context, 403, { ok: false, error: "Bạn không có quyền quản trị." });

    if (req.method === "GET") {
      const q = req.query || {}, op = q.op || "list";
      const all = await loadAll();
      if (op === "list") {
        const months = Object.keys(all).sort().reverse().map((m) => summary(all[m]));
        return reply(context, 200, { ok: true, months });
      }
      if (op === "byEmp") { // cho trang Hồ sơ học tập: kết quả từng tháng của mỗi mã NV
        const months = Object.keys(all).sort(), emp = {};
        months.forEach((m) => {
          const d = all[m];
          d.rows.forEach((r) => {
            if (!r.code) return;
            (emp[r.code] = emp[r.code] || []).push({ month: m, target: r.target, actual: r.actual || 0, asmName: r.asmName, kv: r.kv,
              npp: r.nppName, mien: r.mien, elapsed: d.elapsed });
          });
        });
        return reply(context, 200, { ok: true, months, emp });
      }
      if (op === "month") {
        const m = s(q.m, 7);
        if (!all[m]) return reply(context, 404, { ok: false, error: "Chưa có dữ liệu tháng này." });
        const keys = Object.keys(all).sort(), i = keys.indexOf(m);
        const prev = i > 0 ? all[keys[i - 1]] : null;
        return reply(context, 200, { ok: true, data: all[m], prev: prev ? { month: prev.month, rows: prev.rows.map((r) => ({ code: r.code, target: r.target, actual: r.actual })) } : null });
      }
      return reply(context, 400, { ok: false, error: "Thao tác không hợp lệ." });
    }

    if (!requireAjax(context, req)) return;
    const b = (req.body && typeof req.body === "object") ? req.body : {};
    if (b.op === "saveMonth") {
      let doc;
      try { doc = clean(b.data || {}); } catch (e) { return reply(context, 400, { ok: false, error: e.message }); }
      doc.updatedAt = Date.now(); doc.by = String(u.email).toLowerCase();
      await store.put(PREFIX + doc.month + ".json", doc);
      return reply(context, 200, { ok: true, month: doc.month, count: doc.rows.length });
    }
    if (b.op === "deleteMonth") {
      const m = s(b.month, 7);
      if (!MONTH.test(m)) return reply(context, 400, { ok: false, error: "Tháng không hợp lệ." });
      await store.put(PREFIX + m + ".json", { v: 1, month: m, deleted: true, updatedAt: Date.now(), by: String(u.email).toLowerCase() });
      return reply(context, 200, { ok: true, month: m });
    }
    return reply(context, 400, { ok: false, error: "Thao tác không hợp lệ." });
  } catch (e) {
    context.log.error(e);
    return reply(context, 500, { ok: false, error: "Lỗi máy chủ, vui lòng thử lại." });
  }
}, "sales");
