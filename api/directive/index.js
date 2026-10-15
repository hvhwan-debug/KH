// Việc ASM giao cho SR trong ngày ("chỉ đạo ngày"). SR đọc và bấm "Đã làm"; ASM thấy trạng thái.
const { reply, guardConfigured, requireAjax, requireUserActive } = require("../_lib/http");
const store = require("../_lib/store");
const org = require("../_lib/org");
const mail = require("../_lib/mail");
const { cfg } = require("../_lib/config");
const { layout } = require("../_lib/emails");

const MAX_ITEMS = 120;
const KINDS = ["focus", "note", "praise"];
const KIND_LABEL = { focus: "Trọng tâm", note: "Nhắc nhở", praise: "Khen ngợi" };
const MAX_MAIL_DAY = 60; // mỗi ASM tối đa 60 email/ngày để tránh gửi tràn lan

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    const u = await requireUserActive(context, req);
    if (!u) return;

    if (req.method === "GET") {
      const d = (await store.get("directive/" + u.uid + ".json")) || { items: [] };
      const since = org.addDays(org.vnToday(), -14);
      return reply(context, 200, { ok: true, items: (d.items || []).filter((x) => x.date >= since).slice(-40) });
    }

    if (!requireAjax(context, req)) return;
    const b = req.body || {};

    if (b.op === "ack") { // SR đánh dấu đã làm / bỏ đánh dấu
      const key = "directive/" + u.uid + ".json";
      const d = (await store.get(key)) || { items: [] };
      const it = (d.items || []).find((x) => x.id === String(b.id));
      if (!it) return reply(context, 404, { ok: false, error: "Không tìm thấy việc này." });
      it.done = !!b.done; it.doneAt = it.done ? Date.now() : 0;
      await store.put(key, d);
      return reply(context, 200, { ok: true });
    }

    if (b.op === "send") { // ASM giao việc cho 1 người, nhiều người hoặc cả nhóm
      const roster = await org.getRoster();
      const roles = await org.rolesOf(u.email, roster);
      if (!roles.manager) return reply(context, 403, { ok: false, error: "Chỉ ASM mới giao việc được." });
      const text = org.str(b.text, 500);
      if (text.length < 2) return reply(context, 400, { ok: false, error: "Hãy nhập nội dung việc cần giao." });
      const date = org.validDate(b.date) ? b.date : org.vnToday();
      const kind = KINDS.indexOf(b.kind) >= 0 ? b.kind : "focus";
      const mine = (await org.listProfiles()).filter((p) => roles.admin || org.lc(p.asmEmail) === u.email);
      let targets = Array.isArray(b.to) ? mine.filter((p) => b.to.indexOf(p.uid) >= 0) : [];
      if (b.to === "all") targets = mine;
      if (b.nganh === 1 || b.nganh === 2) targets = (b.to === "all" ? mine : targets).filter((p) => p.nganh === b.nganh);
      if (!targets.length) return reply(context, 400, { ok: false, error: "Không có nhân sự nào thuộc quyền của bạn trong danh sách đã chọn." });
      const ud = (await store.get("user/" + u.uid + ".json")) || {};
      const asm = org.findAsm(roster, u.email);
      const from = (asm && asm.name) || ud.name || u.email, now = Date.now();
      for (const p of targets) {
        const key = "directive/" + p.uid + ".json";
        const d = (await store.get(key)) || { items: [] };
        d.items = (d.items || []).concat([{ id: now.toString(36) + Math.random().toString(36).slice(2, 7), date, text, kind, from, fromEmail: u.email, ts: now, done: false, doneAt: 0 }]).slice(-MAX_ITEMS);
        await store.put(key, d);
      }
      // Gửi kèm email (tuỳ chọn): chỉ tới nhân sự thuộc quyền của ASM, có hạn mức mỗi ngày
      let emailRes = null;
      if (b.email === true) {
        const c = cfg(), ready = c.mailMode === "memory" || !!(c.smtp && c.smtp.host);
        if (!ready) emailRes = { configured: false, sent: 0, failed: 0, skipped: targets.length };
        else {
          const qk = "mailq/" + u.uid + ".json", day = org.vnToday();
          let q = (await store.get(qk)) || { d: day, n: 0 };
          if (q.d !== day) q = { d: day, n: 0 };
          let ok = 0, failed = 0, skipped = 0;
          for (const p of targets) {
            if (q.n >= MAX_MAIL_DAY) { skipped++; continue; }
            let ud = null; try { ud = await store.get("user/" + p.uid + ".json"); } catch (e) {}
            if (!ud || !ud.email || ud.disabled) { skipped++; continue; }
            try {
              const label = (KIND_LABEL[kind] || "Nhắc nhở") + " · " + date.slice(8) + "/" + date.slice(5, 7);
              const m = layout({ tone: kind === "praise" ? "info" : "remind", title: "ASM " + from + " gửi bạn lời nhắn", sections: [{ h: label, lines: [text] }], cta: "Mở ứng dụng", ctaUrl: cfg().appUrl, footer: "Email do ASM gửi trực tiếp qua hệ thống. Hãy phản hồi ASM của bạn qua Zalo hoặc điện thoại." });
              await mail.send({ to: ud.email, subject: "[" + (KIND_LABEL[kind] || "Nhắc nhở") + "] " + from + ": " + text.slice(0, 60), html: m.html, text: m.text, headers: { "Reply-To": u.email } });
              q.n++; ok++;
            } catch (e) { failed++; context.log.error("directive mail", e && e.message); }
          }
          try { await store.put(qk, q); } catch (e) {}
          emailRes = { configured: true, sent: ok, failed, skipped, limit: MAX_MAIL_DAY, left: Math.max(0, MAX_MAIL_DAY - q.n) };
        }
      }
      return reply(context, 200, { ok: true, sent: targets.length, email: emailRes });
    }
    return reply(context, 400, { ok: false, error: "Yêu cầu không hợp lệ." });
  } catch (e) {
    context.log.error("directive", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra. Thử lại sau." });
  }
};
