// Việc ASM giao cho SR trong ngày ("chỉ đạo ngày"). SR đọc và bấm "Đã làm"; ASM thấy trạng thái.
const { reply, guardConfigured, requireAjax, requireUser } = require("../_lib/http");
const store = require("../_lib/store");
const org = require("../_lib/org");

const MAX_ITEMS = 120;
const KINDS = ["focus", "note", "praise"];

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    const u = requireUser(context, req);
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
      return reply(context, 200, { ok: true, sent: targets.length });
    }
    return reply(context, 400, { ok: false, error: "Yêu cầu không hợp lệ." });
  } catch (e) {
    context.log.error("directive", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra. Thử lại sau." });
  }
};
