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
        orphans, invites: Object.values((await org.getInvites()).items)
      });
    }

    if (!requireAjax(context, req)) return;
    const b = req.body || {};

    if (b.op === "addAsm") {
      const email = org.lc(b.email);
      if (!org.validEmail(email) || !emailAllowed(email)) return reply(context, 400, { ok: false, error: "Email không hợp lệ hoặc chưa được phép dùng ứng dụng." });
      const cur = org.findAsm(roster, email);
      const rec = org.asmRec(b, cur, email);
      roster.asms = roster.asms.filter((a) => a.email !== email).concat([rec]).slice(0, 200);
      await org.putRoster(roster);
      return reply(context, 200, { ok: true, asms: roster.asms });
    }

    if (b.op === "invite") { // tạo trước thành viên: khi họ đăng nhập app lần đầu sẽ tự có ngành + ASM + tỉnh
      const email = org.lc(b.email);
      if (!org.validEmail(email) || !emailAllowed(email)) return reply(context, 400, { ok: false, error: "Email không hợp lệ hoặc chưa được phép dùng ứng dụng." });
      const nganh = Number(b.nganh);
      if (nganh !== 1 && nganh !== 2) return reply(context, 400, { ok: false, error: "Hãy chọn ngành." });
      const asmEmail = org.lc(b.asmEmail);
      if (asmEmail && !org.findAsm(roster, asmEmail)) return reply(context, 400, { ok: false, error: "ASM chưa có trong danh sách." });
      const rec = { email, name: org.str(b.name, 80), nganh, asmEmail, province: org.str(b.province, 60), createdAt: Date.now() };
      const existing = (await org.listProfiles()).find((p) => org.lc(p.email) === email);
      if (existing) { // đã có tài khoản: áp dụng luôn
        Object.assign(existing, { nganh, asmEmail, locked: !!asmEmail, province: rec.province || existing.province, blocked: (existing.blocked || []).filter((x) => x !== asmEmail) });
        await org.putProfile(existing);
        return reply(context, 200, { ok: true, applied: true });
      }
      const inv = await org.getInvites(); inv.items[email] = rec;
      const keys = Object.keys(inv.items); if (keys.length > 500) delete inv.items[keys[0]];
      await org.putInvites(inv);
      return reply(context, 200, { ok: true, applied: false, invites: Object.values(inv.items) });
    }

    if (b.op === "bulkImport") { // nhập hàng loạt từ file nhân sự: ASM (kèm ngành, tỉnh) và SR (kèm ngành, ASM)
      const asmsIn = Array.isArray(b.asms) ? b.asms.slice(0, 300) : [], memIn = Array.isArray(b.members) ? b.members.slice(0, 300) : [];
      const res = { asms: 0, applied: 0, invited: 0, skipped: 0 };
      if (asmsIn.length) {
        for (const x of asmsIn) {
          const email = org.lc(x && x.email);
          if (!org.validEmail(email) || !emailAllowed(email)) { res.skipped++; continue; }
          const rec = org.asmRec(x, org.findAsm(roster, email), email);
          roster.asms = roster.asms.filter((r) => r.email !== email).concat([rec]); res.asms++;
        }
        roster.asms = roster.asms.slice(0, 200); await org.putRoster(roster);
      }
      if (memIn.length) {
        const byEmail = {}; (await org.listProfiles()).forEach((p) => { byEmail[org.lc(p.email)] = p; });
        const inv = await org.getInvites();
        for (const x of memIn) {
          const email = org.lc(x && x.email), nganh = Number(x && x.nganh);
          if (!org.validEmail(email) || !emailAllowed(email) || (nganh !== 1 && nganh !== 2)) { res.skipped++; continue; }
          const asmEmail = org.findAsm(roster, x.asmEmail) ? org.lc(x.asmEmail) : "";
          const ex = byEmail[email];
          if (ex) { Object.assign(ex, { nganh, asmEmail, locked: !!asmEmail, blocked: (ex.blocked || []).filter((y) => y !== asmEmail) }); await org.putProfile(ex); res.applied++; }
          else { inv.items[email] = { email, name: org.str(x.name, 80), nganh, asmEmail, province: org.str(x.province, 60), createdAt: Date.now() }; res.invited++; }
        }
        await org.putInvites(inv);
      }
      return reply(context, 200, Object.assign({ ok: true }, res));
    }

    if (b.op === "removeInvite") {
      const inv = await org.getInvites(); delete inv.items[org.lc(b.email)]; await org.putInvites(inv);
      return reply(context, 200, { ok: true, invites: Object.values(inv.items) });
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
        if (asmEmail) p.blocked = (p.blocked || []).filter((x) => x !== asmEmail);
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
