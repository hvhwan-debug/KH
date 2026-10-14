// Quản trị tổ chức (chỉ ADMIN_EMAILS): khai báo ASM, gán SR vào ASM, đổi ngành cho SR.
const { reply, guardConfigured, requireAjax, requireUser } = require("../_lib/http");
const { isAdmin, emailAllowed } = require("../_lib/config");
const store = require("../_lib/store");
const org = require("../_lib/org");

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    const u = requireUser(context, req);
    if (!u) return;
    if (!isAdmin(u.email)) return reply(context, 403, { ok: false, error: "Bạn không có quyền quản trị." });
    const roster = await org.getRoster();

    if (req.method === "GET") {
      const profiles = await org.listProfiles();
      const known = {};
      profiles.forEach((p) => { known[p.uid] = 1; });
      const orphans = []; // đã có tài khoản nhưng chưa chọn ngành/ASM
      for (const k of await store.list("user/")) {
        const uid = k.replace(/^user\//, "").replace(/\.json$/, "");
        if (known[uid]) continue;
        let d = null; try { d = await store.get(k); } catch (e) { continue; }
        if (d && d.email) orphans.push({ uid, email: d.email, name: d.name || "" });
      }
      return reply(context, 200, {
        ok: true, asms: roster.asms,
        profiles: profiles.map((p) => ({ uid: p.uid, email: p.email, name: p.name || "", nganh: p.nganh, asmEmail: p.asmEmail || "", locked: !!p.locked, province: p.province || "" })),
        orphans
      });
    }

    if (!requireAjax(context, req)) return;
    const b = req.body || {};

    if (b.op === "addAsm") {
      const email = org.lc(b.email);
      if (!org.validEmail(email) || !emailAllowed(email)) return reply(context, 400, { ok: false, error: "Email không hợp lệ hoặc chưa được phép dùng ứng dụng." });
      const cur = org.findAsm(roster, email);
      const rec = { email, name: org.str(b.name, 80), area: org.str(b.area, 80), addedAt: cur ? cur.addedAt : Date.now() };
      roster.asms = roster.asms.filter((a) => a.email !== email).concat([rec]).slice(0, 200);
      await org.putRoster(roster);
      return reply(context, 200, { ok: true, asms: roster.asms });
    }

    if (b.op === "removeAsm") {
      const email = org.lc(b.email);
      roster.asms = roster.asms.filter((a) => a.email !== email);
      await org.putRoster(roster);
      for (const p of await org.listProfiles()) { // SR của ASM này trở thành "chưa gán"
        if (org.lc(p.asmEmail) === email) { p.asmEmail = ""; p.locked = false; await org.putProfile(p); }
      }
      return reply(context, 200, { ok: true, asms: roster.asms });
    }

    if (b.op === "assign" || b.op === "setNganh") {
      const uid = String(b.uid || "");
      if (!/^[a-f0-9]{16,40}$/.test(uid)) return reply(context, 400, { ok: false, error: "Sai mã nhân sự." });
      let p = await org.getProfile(uid);
      if (!p) { // chưa tự chọn: tạo hồ sơ từ tài khoản
        const ud = await store.get("user/" + uid + ".json");
        if (!ud || !ud.email) return reply(context, 404, { ok: false, error: "Không tìm thấy nhân sự." });
        p = { uid, email: ud.email, name: ud.name || "", nganh: 2, asmEmail: "", province: "", locked: false, createdAt: Date.now() };
      }
      if (b.op === "assign") {
        const asmEmail = org.lc(b.asmEmail);
        if (asmEmail && !org.findAsm(roster, asmEmail)) return reply(context, 400, { ok: false, error: "ASM chưa có trong danh sách." });
        p.asmEmail = asmEmail; p.locked = !!asmEmail && b.lock !== false;
      } else {
        if (Number(b.nganh) !== 1 && Number(b.nganh) !== 2) return reply(context, 400, { ok: false, error: "Ngành không hợp lệ." });
        p.nganh = Number(b.nganh);
      }
      await org.putProfile(p);
      return reply(context, 200, { ok: true });
    }
    return reply(context, 400, { ok: false, error: "Yêu cầu không hợp lệ." });
  } catch (e) {
    context.log.error("org", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra. Thử lại sau." });
  }
};
