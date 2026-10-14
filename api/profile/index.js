// Hồ sơ công việc của SR: ngành đang làm + ASM phụ trách. SR tự chọn khi đăng nhập lần đầu;
// quản trị viên có thể gán và "khoá" ASM (khi đó SR không tự đổi được).
const { reply, guardConfigured, requireAjax, requireUser } = require("../_lib/http");
const { emailAllowed } = require("../_lib/config");
const { clearCookie } = require("../_lib/session");
const store = require("../_lib/store");
const org = require("../_lib/org");

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    const u = requireUser(context, req);
    if (!u) return;
    if (!emailAllowed(u.email)) return reply(context, 403, { ok: false, error: "Tài khoản không còn được phép." }, { "Set-Cookie": clearCookie() });

    const roster = await org.getRoster();
    const roles = await org.rolesOf(u.email, roster);
    let p = await org.getProfile(u.uid);
    const asms = roster.asms.map((a) => ({ email: a.email, name: a.name || a.email, area: a.area || "" }));
    const pub = (x) => x && ({ nganh: x.nganh, asmEmail: x.asmEmail || "", province: x.province || "", locked: !!x.locked, updatedAt: x.updatedAt });

    if (req.method === "GET") {
      let asmName = "";
      if (p && p.asmEmail) { const a = org.findAsm(roster, p.asmEmail); asmName = a ? (a.name || a.email) : p.asmEmail; }
      return reply(context, 200, { ok: true, profile: pub(p), asmName, asms, admin: roles.admin, asm: roles.asm });
    }

    if (!requireAjax(context, req)) return;
    const b = req.body || {};
    const nganh = Number(b.nganh);
    if (nganh !== 1 && nganh !== 2) return reply(context, 400, { ok: false, error: "Hãy chọn ngành 1 hoặc ngành 2." });
    const asmEmail = org.lc(b.asmEmail);
    if (asmEmail && !org.findAsm(roster, asmEmail)) return reply(context, 400, { ok: false, error: "ASM này chưa có trong danh sách." });

    const ud = (await store.get("user/" + u.uid + ".json")) || {};
    const now = Date.now();
    const prev = p || { uid: u.uid, createdAt: now, locked: false, asmEmail: "" };
    let note = "";
    p = Object.assign({}, prev, {
      uid: u.uid, email: u.email, name: org.str(ud.name, 80) || prev.name || "",
      nganh, province: org.str(b.province != null ? b.province : prev.province, 60)
    });
    if (prev.locked && asmEmail !== (prev.asmEmail || "")) note = "ASM đã được quản trị viên gán, bạn không tự đổi được.";
    else p.asmEmail = asmEmail;
    await org.putProfile(p);
    return reply(context, 200, { ok: true, profile: pub(p), note });
  } catch (e) {
    context.log.error("profile", e && e.message);
    return reply(context, 500, { ok: false, error: "Không lưu được hồ sơ. Thử lại sau." });
  }
};
