// ASM (hoặc quản trị viên) xem toàn bộ nhân sự do mình phụ trách: hồ sơ, kế hoạch, báo cáo từng ngày, việc đã giao.
const { reply, guardConfigured, requireAjax, requireUserActive } = require("../_lib/http");
const store = require("../_lib/store");
const org = require("../_lib/org");

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    const u = await requireUserActive(context, req);
    if (!u) return;
    const roster = await org.getRoster();
    const roles = await org.rolesOf(u.email, roster);
    if (!roles.manager) return reply(context, 403, { ok: false, error: "Bạn không có quyền xem trang quản lý." });

    if (req.method === "POST") { // ASM gỡ một thành viên khỏi nhóm của mình (không xoá tài khoản)
      if (!requireAjax(context, req)) return;
      const b = req.body || {};
      if (b.op !== "removeMember" || !/^[a-f0-9]{16,40}$/.test(String(b.uid || ""))) return reply(context, 400, { ok: false, error: "Yêu cầu không hợp lệ." });
      const p = await org.getProfile(b.uid);
      if (!p || !p.asmEmail) return reply(context, 404, { ok: false, error: "Nhân sự này không thuộc nhóm nào." });
      if (!roles.admin && org.lc(p.asmEmail) !== u.email) return reply(context, 403, { ok: false, error: "Nhân sự này không thuộc nhóm của bạn." });
      const old = org.lc(p.asmEmail);
      p.blocked = (p.blocked || []).filter((x) => x !== old).concat([old]).slice(-20); // không tự chọn lại ASM đã gỡ mình
      p.asmEmail = ""; p.locked = false;
      await org.putProfile(p);
      return reply(context, 200, { ok: true });
    }
    const q = req.query || {};
    const month = org.MONTH_RE.test(String(q.month || "")) ? q.month : org.vnToday().slice(0, 7);
    const from = org.addDays(month + "-01", -10);
    const to = org.addDays(month + "-31", 0);

    // ASM chỉ thấy người của mình; quản trị viên thấy tất cả hoặc lọc theo một ASM.
    let scope = roles.admin ? org.lc(q.asm) : u.email;
    const all = (await org.listProfiles()).filter((p) => !scope || org.lc(p.asmEmail) === scope);

    // Tổng quan theo ASM (chỉ quản trị viên): đếm nhanh từ chỉ mục hồ sơ, không đọc báo cáo
    if (roles.admin && String(q.overview || "") === "1") {
      const by = {}; let unassigned = 0;
      all.forEach((p) => { const e = org.lc(p.asmEmail); if (!e) { unassigned++; return; } const r = by[e] || (by[e] = { email: e, n1: 0, n2: 0 }); if (p.nganh === 1) r.n1++; else r.n2++; });
      const asms = roster.asms.map((a) => { const r = by[a.email] || { n1: 0, n2: 0 }; return { email: a.email, name: a.name || "", n1: r.n1, n2: r.n2, count: r.n1 + r.n2 }; }).sort((x, y) => y.count - x.count || String(x.name || x.email).localeCompare(String(y.name || y.email), "vi"));
      return reply(context, 200, { ok: true, total: all.length, unassigned, asms });
    }

    // Lọc, sắp xếp, phân trang: chỉ mở báo cáo / việc đã giao của những người nằm trong trang trả về
    const LIMIT = Math.min(200, Math.max(1, parseInt(q.limit, 10) || 200)), OFFSET = Math.max(0, parseInt(q.offset, 10) || 0);
    const needle = String(q.q || "").trim().toLowerCase().slice(0, 60), ng = Number(q.nganh);
    const profiles = all.filter((p) => (ng !== 1 && ng !== 2) || p.nganh === ng)
      .filter((p) => !needle || ((p.name || "") + " " + p.email + " " + (p.province || "")).toLowerCase().indexOf(needle) >= 0)
      .sort((a, b) => (a.nganh - b.nganh) || String(a.name || a.email).localeCompare(String(b.name || b.email), "vi"));
    const total = profiles.length, page = profiles.slice(OFFSET, OFFSET + LIMIT);
    const members = await org.pmap(page, async (p) => {
      const rep = (await store.get("report/" + p.uid + ".json")) || {};
      const dir = (await store.get("directive/" + p.uid + ".json")) || { items: [] };
      const days = {};
      Object.keys(rep.days || {}).forEach((d) => { if (d >= from && d <= to) days[d] = rep.days[d]; });
      return {
        uid: p.uid, email: p.email, name: rep.name || p.name || "", nganh: p.nganh, province: p.province || "",
        asmEmail: p.asmEmail || "", locked: !!p.locked, plan: rep.plan || null, days, reportAt: rep.updatedAt || 0,
        dir: (dir.items || []).slice(-12)
      };
    }, 25);
    const ud = (await store.get("user/" + u.uid + ".json")) || {};
    const meAsm = org.findAsm(roster, u.email);
    return reply(context, 200, {
      ok: true, now: Date.now(), today: org.vnToday(), month, scope, total, limit: LIMIT, offset: OFFSET, truncated: total > members.length,
      me: { email: u.email, name: (meAsm && meAsm.name) || ud.name || u.email, admin: roles.admin, asm: roles.asm },
      asms: roles.admin ? roster.asms : [], members
    });
  } catch (e) {
    context.log.error("team", e && e.message);
    return reply(context, 500, { ok: false, error: "Không tải được dữ liệu nhóm." });
  }
};
