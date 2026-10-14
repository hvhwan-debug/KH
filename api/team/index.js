// ASM (hoặc quản trị viên) xem toàn bộ nhân sự do mình phụ trách: hồ sơ, kế hoạch, báo cáo từng ngày, việc đã giao.
const { reply, guardConfigured, requireAjax, requireUser } = require("../_lib/http");
const store = require("../_lib/store");
const org = require("../_lib/org");

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    const u = requireUser(context, req);
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
    const profiles = (await org.listProfiles()).filter((p) => !scope || org.lc(p.asmEmail) === scope);

    const members = [];
    for (const p of profiles) {
      const rep = (await store.get("report/" + p.uid + ".json")) || {};
      const dir = (await store.get("directive/" + p.uid + ".json")) || { items: [] };
      const days = {};
      Object.keys(rep.days || {}).forEach((d) => { if (d >= from && d <= to) days[d] = rep.days[d]; });
      members.push({
        uid: p.uid, email: p.email, name: rep.name || p.name || "", nganh: p.nganh, province: p.province || "",
        asmEmail: p.asmEmail || "", locked: !!p.locked, plan: rep.plan || null, days, reportAt: rep.updatedAt || 0,
        dir: (dir.items || []).slice(-12)
      });
    }
    members.sort((a, b) => (a.nganh - b.nganh) || String(a.name || a.email).localeCompare(String(b.name || b.email), "vi"));
    const ud = (await store.get("user/" + u.uid + ".json")) || {};
    const meAsm = org.findAsm(roster, u.email);
    return reply(context, 200, {
      ok: true, now: Date.now(), today: org.vnToday(), month, scope,
      me: { email: u.email, name: (meAsm && meAsm.name) || ud.name || u.email, admin: roles.admin, asm: roles.asm },
      asms: roles.admin ? roster.asms : [], members
    });
  } catch (e) {
    context.log.error("team", e && e.message);
    return reply(context, 500, { ok: false, error: "Không tải được dữ liệu nhóm." });
  }
};
