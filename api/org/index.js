// Quản trị tổ chức (chỉ ADMIN_EMAILS): khai báo ASM, gán SR vào ASM, đổi ngành cho SR.
const { reply, guardConfigured, requireAjax, requireUserActive } = require("../_lib/http");
const { isAdmin, emailAllowed } = require("../_lib/config");
const store = require("../_lib/store");
const pwdlib = require("../_lib/pwd");
const org = require("../_lib/org");
const PROV = require("../_lib/provinces");
const crypto = require("crypto");
const { uidOf } = require("../_lib/session");

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    const u = await requireUserActive(context, req);
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
        if (d && d.email) orphans.push({ uid, email: d.email, name: d.name || "", disabled: !!d.disabled });
      }
      const plist = await org.pmap(profiles, async (p) => {
        let ud = null; try { ud = await store.get("user/" + p.uid + ".json"); } catch (e) {}
        return { uid: p.uid, email: p.email, name: (ud && ud.name) || p.name || "", nganh: p.nganh, asmEmail: p.asmEmail || "", locked: !!p.locked, province: p.province || "", disabled: !!(ud && ud.disabled) };
      }, 40);
      return reply(context, 200, {
        ok: true, asms: roster.asms, profiles: plist, orphans, invites: Object.values((await org.getInvites()).items), audit: (await org.getAudit()).slice(-25).reverse(), me: u.uid
      });
    }

    if (!requireAjax(context, req)) return;
    const b = req.body || {};

    if (["editMember", "setPassword", "setDisabled", "signOut", "deleteMember"].indexOf(b.op) >= 0) {
      const uid = String(b.uid || "");
      if (!/^[a-f0-9]{16,40}$/.test(uid)) return reply(context, 400, { ok: false, error: "Sai mã thành viên." });
      const ukey = "user/" + uid + ".json", ud = await store.get(ukey);
      if (!ud) return reply(context, 404, { ok: false, error: "Không tìm thấy thành viên." });
      const self = uid === u.uid, now = Date.now();
      if (b.op === "editMember") {
        const name = org.str(b.name, 80);
        if (!name) return reply(context, 400, { ok: false, error: "Họ tên không được để trống." });
        ud.name = name; await store.put(ukey, ud);
        let pv = null;
        if (b.province != null && String(b.province).trim()) { pv = PROV.canonProvince(b.province); if (!pv) return reply(context, 400, { ok: false, error: "Tỉnh/thành không có trong danh sách. Hãy chọn từ danh sách." }); }
        const p = await org.getProfile(uid);
        if (p) { p.name = name; if (b.province != null) p.province = pv || ""; await org.putProfile(p); }
        await org.audit(u.email, "Sửa thông tin", ud.email);
      } else if (b.op === "setPassword") {
        const pw = String(b.password || "");
        if (pw.length < 8) return reply(context, 400, { ok: false, error: "Mật khẩu do quản trị viên đặt cần ít nhất 8 ký tự." });
        if (pw.length > 200) return reply(context, 400, { ok: false, error: "Mật khẩu quá dài." });
        ud.pwd = pwdlib.hash(pw); ud.verified = true; ud.failTimes = []; ud.otp = ""; ud.otpExp = 0;
        if (!self) ud.sessAfter = now;           // người đó bị đăng xuất khỏi mọi thiết bị, phải đăng nhập bằng mật khẩu mới
        await store.put(ukey, ud);
        await org.audit(u.email, "Đặt mật khẩu mới", ud.email);
      } else if (b.op === "setDisabled") {
        if (self) return reply(context, 400, { ok: false, error: "Không thể tự khoá tài khoản đang đăng nhập." });
        ud.disabled = !!b.disabled; if (ud.disabled) ud.sessAfter = now;
        await store.put(ukey, ud);
        await org.audit(u.email, ud.disabled ? "Khoá tài khoản" : "Mở khoá tài khoản", ud.email);
      } else if (b.op === "signOut") {
        if (self) return reply(context, 400, { ok: false, error: "Hãy dùng nút Đăng xuất để thoát tài khoản của chính bạn." });
        ud.sessAfter = now; await store.put(ukey, ud);
        await org.audit(u.email, "Đăng xuất mọi thiết bị", ud.email);
      } else { // deleteMember
        if (self) return reply(context, 400, { ok: false, error: "Không thể tự xoá chính tài khoản đang đăng nhập." });
        const email = org.lc(ud.email);
        await store.del(ukey);
        for (const k of ["report/", "directive/"]) { try { await store.del(k + uid + ".json"); } catch (e) {} }
        await org.dropProfile(uid);
        const inv = await org.getInvites(); if (inv.items[email]) { delete inv.items[email]; await org.putInvites(inv); }
        if (org.findAsm(roster, email)) { // nếu là ASM: bỏ khỏi danh sách ASM và thả nhóm của họ về "chưa gán"
          roster.asms = roster.asms.filter((a) => a.email !== email); await org.putRoster(roster);
          for (const p of await org.listProfiles()) { if (org.lc(p.asmEmail) === email) { p.asmEmail = ""; p.locked = false; await org.putProfile(p); } }
        }
        await org.audit(u.email, "Xoá tài khoản", email);
      }
      return reply(context, 200, { ok: true });
    }

    // ---- Dọn dữ liệu hàng loạt: giữ lại một số ASM + nhân sự của họ, xoá phần còn lại ----
    if (["purgePreview", "purgeBackup", "purgeRun"].indexOf(b.op) >= 0) {
      const keepIn = (Array.isArray(b.keep) ? b.keep : []).map(org.lc).filter((e) => org.findAsm(roster, e));
      if (!keepIn.length) return reply(context, 400, { ok: false, error: "Hãy chọn ít nhất một ASM để giữ lại." });
      const keep = new Set(keepIn);
      const profiles = await org.listProfiles(), keepUids = new Set();
      profiles.forEach((p) => { if (keep.has(org.lc(p.asmEmail))) keepUids.add(p.uid); });
      const plan = { users: [], invites: [], asms: [], keepStaff: keepUids.size, keepInvites: 0 };
      for (const k of await store.list("user/")) {
        let d = null; try { d = await store.get(k); } catch (e) { continue; }
        if (!d || !d.email) continue;
        const uid = k.replace(/^user\//, "").replace(/\.json$/, ""), email = org.lc(d.email);
        if (uid === u.uid || isAdmin(email) || keep.has(email) || keepUids.has(uid)) continue; // luôn giữ: chính bạn, quản trị viên, ASM giữ lại, nhân sự của họ
        plan.users.push({ uid, email, name: d.name || "" });
      }
      const inv = await org.getInvites();
      Object.values(inv.items).forEach((i) => { if (keep.has(org.lc(i.asmEmail))) plan.keepInvites++; else plan.invites.push({ email: i.email, name: i.name || "" }); });
      roster.asms.forEach((a) => { if (!keep.has(a.email) && !isAdmin(a.email)) plan.asms.push({ email: a.email, name: a.name || "" }); });
      const counts = { users: plan.users.length, invites: plan.invites.length, asms: plan.asms.length };

      if (b.op === "purgePreview") {
        return reply(context, 200, { ok: true, counts, keepStaff: plan.keepStaff, keepInvites: plan.keepInvites, keepAsms: keepIn.map((e) => (org.findAsm(roster, e) || {}).name || e),
          users: plan.users.slice(0, 400), invites: plan.invites.slice(0, 400), asms: plan.asms });
      }
      if (b.op === "purgeBackup") { // bản sao lưu để khôi phục thủ công nếu cần (không chứa mật khẩu và dữ liệu lập kế hoạch cá nhân)
        const backup = { createdAt: new Date().toISOString(), by: u.email, asms: roster.asms.filter((a) => !keep.has(a.email) && !isAdmin(a.email)), invites: Object.values(inv.items).filter((i) => !keep.has(org.lc(i.asmEmail))), users: [] };
        for (const x of plan.users) backup.users.push({ email: x.email, name: x.name, profile: await org.getProfile(x.uid), report: await store.get("report/" + x.uid + ".json"), directive: await store.get("directive/" + x.uid + ".json") });
        return reply(context, 200, { ok: true, backup });
      }
      // purgeRun
      if (String(b.confirm || "") !== "XOA HET") return reply(context, 400, { ok: false, error: "Hãy gõ đúng cụm XOA HET để xác nhận." });
      const ex = b.expect || {};
      if (Number(ex.users) !== counts.users || Number(ex.invites) !== counts.invites || Number(ex.asms) !== counts.asms) return reply(context, 409, { ok: false, error: "Dữ liệu vừa thay đổi so với bản xem trước. Hãy xem trước lại rồi xác nhận.", counts });
      for (const x of plan.users) {
        await store.del("user/" + x.uid + ".json");
        for (const k of ["report/", "directive/"]) { try { await store.del(k + x.uid + ".json"); } catch (e) {} }
        await org.dropProfile(x.uid);
      }
      const drop = new Set(plan.invites.map((i) => org.lc(i.email)));
      Object.keys(inv.items).forEach((e) => { if (drop.has(org.lc(e))) delete inv.items[e]; });
      await org.putInvites(inv);
      const dropA = new Set(plan.asms.map((a) => a.email));
      roster.asms = roster.asms.filter((a) => !dropA.has(a.email)); await org.putRoster(roster);
      await org.audit(u.email, "Xoá hàng loạt", counts.users + " tài khoản, " + counts.invites + " hồ sơ chờ, " + counts.asms + " ASM; giữ " + keepIn.join(", "));
      return reply(context, 200, { ok: true, deleted: counts });
    }

    // Quản trị viên tạo thành viên trực tiếp: tài khoản + vai trò (ASM hoặc SR) + ngành / ASM / tỉnh trong một lần
    if (b.op === "createMember") {
      const email = org.lc(b.email), name = org.str(b.name, 80), role = b.role === "asm" ? "asm" : b.role === "sr" ? "sr" : "";
      if (!org.validEmail(email) || !emailAllowed(email)) return reply(context, 400, { ok: false, error: "Email không hợp lệ hoặc chưa được phép dùng ứng dụng (kiểm tra ALLOWED_EMAILS / tên miền cho phép)." });
      if (!name) return reply(context, 400, { ok: false, error: "Hãy nhập họ tên." });
      if (!role) return reply(context, 400, { ok: false, error: "Hãy chọn vai trò ASM hoặc SR." });
      if (isAdmin(email) && role === "sr") return reply(context, 400, { ok: false, error: "Email này là quản trị viên (ADMIN_EMAILS), không đặt làm SR." });
      let nganh = Number(b.nganh), asmEmail = org.lc(b.asmEmail);
      if (role === "sr") {
        if (nganh !== 1 && nganh !== 2) return reply(context, 400, { ok: false, error: "Hãy chọn ngành cho SR." });
        if (asmEmail && !org.findAsm(roster, asmEmail)) return reply(context, 400, { ok: false, error: "ASM chưa có trong danh sách." });
      }
      let cpv = ""; const cpl = PROV.canonList(b.provinces);
      if (role === "sr" && String(b.province || "").trim()) { cpv = PROV.canonProvince(b.province); if (!cpv) return reply(context, 400, { ok: false, error: "Tỉnh/thành không có trong danh sách. Hãy chọn từ danh sách." }); }
      if (role === "asm" && cpl.bad.length) return reply(context, 400, { ok: false, error: "Tỉnh/thành không có trong danh sách: " + cpl.bad.slice(0, 3).join(", ") + ". Hãy chọn từ danh sách." });
      let pw = String(b.password || "");
      if (pw && (pw.length < 8 || pw.length > 200)) return reply(context, 400, { ok: false, error: "Mật khẩu cần từ 8 đến 200 ký tự (hoặc để trống để hệ thống tự tạo)." });
      const uid = uidOf(email), ukey = "user/" + uid + ".json";
      let ud = await store.get(ukey), created = false, tempPassword = "";
      if (!ud) {
        if (!pw) { // mật khẩu tạm ngẫu nhiên, chỉ hiện một lần cho quản trị viên
          const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
          pw = Array.from(crypto.randomBytes(10)).map((x) => chars[x % chars.length]).join("");
          tempPassword = pw;
        }
        ud = { v: 1, uid, email, name, rev: 0, state: null, digest: null, prefs: {}, sent: {}, pwd: pwdlib.hash(pw), verified: true };
        await store.put(ukey, ud); created = true;
      } else {
        if (name) ud.name = name;
        if (pw) { ud.pwd = pwdlib.hash(pw); ud.verified = true; ud.failTimes = []; ud.otp = ""; ud.otpExp = 0; ud.sessAfter = Date.now(); }
        await store.put(ukey, ud);
      }
      if (role === "asm") {
        const rec = org.asmRec({ name, nganh: Array.isArray(b.nganhs) ? b.nganhs : undefined, provinces: cpl.list }, org.findAsm(roster, email), email);
        roster.asms = roster.asms.filter((a) => a.email !== email).concat([rec]).slice(0, 200);
        await org.putRoster(roster);
        const old = await org.getProfile(uid); // đang là SR thì bỏ hồ sơ SR, chuyển sang ASM
        if (old) await org.dropProfile(uid);
      } else {
        if (org.findAsm(roster, email)) { roster.asms = roster.asms.filter((a) => a.email !== email); await org.putRoster(roster); }
        let p = await org.getProfile(uid);
        p = Object.assign(p || { uid, createdAt: Date.now() }, { uid, email, name, nganh, asmEmail, locked: !!asmEmail, province: cpv, blocked: ((p && p.blocked) || []).filter((x) => x !== asmEmail) });
        await org.putProfile(p);
      }
      const inv = await org.getInvites(); if (inv.items[email]) { delete inv.items[email]; await org.putInvites(inv); }
      await org.audit(u.email, created ? "Tạo thành viên (" + role.toUpperCase() + ")" : "Gán vai trò " + role.toUpperCase(), email);
      return reply(context, 200, { ok: true, uid, created, role, tempPassword });
    }

    if (b.op === "addAsm") {
      const email = org.lc(b.email);
      if (!org.validEmail(email) || !emailAllowed(email)) return reply(context, 400, { ok: false, error: "Email không hợp lệ hoặc chưa được phép dùng ứng dụng." });
      const cl = PROV.canonList(b.provinces); if (cl.bad.length) return reply(context, 400, { ok: false, error: "Tỉnh/thành không có trong danh sách: " + cl.bad.slice(0, 3).join(", ") + ". Hãy chọn từ danh sách." });
      const cur = org.findAsm(roster, email);
      const rec = org.asmRec(Object.assign({}, b, { provinces: cl.list }), cur, email);
      roster.asms = roster.asms.filter((a) => a.email !== email).concat([rec]).slice(0, 200);
      await org.putRoster(roster);
      await org.audit(u.email, "Lưu ASM", email);
      return reply(context, 200, { ok: true, asms: roster.asms });
    }

    if (b.op === "invite") { // tạo trước thành viên: khi họ đăng nhập app lần đầu sẽ tự có ngành + ASM + tỉnh
      const email = org.lc(b.email);
      if (!org.validEmail(email) || !emailAllowed(email)) return reply(context, 400, { ok: false, error: "Email không hợp lệ hoặc chưa được phép dùng ứng dụng." });
      const nganh = Number(b.nganh);
      if (nganh !== 1 && nganh !== 2) return reply(context, 400, { ok: false, error: "Hãy chọn ngành." });
      const asmEmail = org.lc(b.asmEmail);
      if (asmEmail && !org.findAsm(roster, asmEmail)) return reply(context, 400, { ok: false, error: "ASM chưa có trong danh sách." });
      let ipv = ""; if (String(b.province || "").trim()) { ipv = PROV.canonProvince(b.province); if (!ipv) return reply(context, 400, { ok: false, error: "Tỉnh/thành không có trong danh sách. Hãy chọn từ danh sách." }); }
      const rec = { email, name: org.str(b.name, 80), nganh, asmEmail, province: ipv, createdAt: Date.now() };
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
      await org.audit(u.email, "Nhập hàng loạt", res.asms + " ASM, " + (res.applied + res.invited) + " nhân sự");
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
      await org.audit(u.email, "Bỏ quyền ASM", email);
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
