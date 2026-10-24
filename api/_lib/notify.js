// Gửi thông báo cho thí sinh qua email (Zalo và SMS được mở sẵn ở trình duyệt, người gửi bấm gửi).
// Email chỉ gửi tới ĐỊA CHỈ ĐÃ LƯU trong hồ sơ thí sinh (tra theo mã nhân viên), không nhận địa chỉ tuỳ ý từ trình duyệt.
const mail = require("./mail");
const quiz = require("./quiz");

const MAX_ITEMS = 300, MAX_TEXT = 1500;
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, n);

const tpl = require("./mailtpl"); // khung email HTML dùng chung với phần xem trước ở trình duyệt

// Gửi email hàng loạt. Azure ngắt mỗi yêu cầu sau ~45 giây, nên:
//  - gửi song song tối đa CONC thư một lúc (dùng chung kết nối SMTP),
//  - chỉ chạy trong TIME_BUDGET; người chưa kịp gửi trả về "pending" để trình duyệt gửi tiếp ở đợt sau,
//  - nhớ những thư ĐÃ gửi (cùng người + cùng tiêu đề + cùng nội dung) trong DEDUP_MS: bấm gửi lại không ai nhận trùng.
const crypto = require("crypto");
const store = require("./store");
const SENT_KEY = "kt/notify-sent-log.json", DEDUP_MS = 6 * 3600 * 1000, TIME_BUDGET = 25000, CONC = 4;
const sig = (code, subj, text) => crypto.createHash("sha1").update(quiz.normCode(code) + "\n" + subj + "\n" + text).digest("base64url").slice(0, 20);
async function sendEmails({ items, subject, kind, allowed }) {
  const t0 = Date.now();
  const subj = clean(subject, 150).trim();
  if (!subj) return { status: 400, body: { ok: false, error: "Nhập tiêu đề email." } };
  const list = Array.isArray(items) ? items.slice(0, MAX_ITEMS) : [];
  if (!list.length) return { status: 400, body: { ok: false, error: "Chưa chọn người nhận." } };
  const cands = await quiz.getCandidates();
  const byCode = {}; cands.forEach((c) => { byCode[quiz.normCode(c.code)] = c; });
  const res = { ok: true, sent: 0, failed: [], skipped: [], pending: [], dup: [] }, k = tpl.toneOf(String(kind || ""));
  let log = {}; try { log = (await store.get(SENT_KEY)) || {}; } catch (e) { log = {}; }
  Object.keys(log).forEach((x) => { if (t0 - log[x] > DEDUP_MS) delete log[x]; });
  const jobs = [];
  for (const it of list) {
    const code = String((it && it.code) || ""), c = byCode[quiz.normCode(code)];
    const text = clean(it && it.text, MAX_TEXT).trim();
    if (!c || !text || (allowed && !allowed(c))) { res.skipped.push({ code, reason: "không hợp lệ" }); continue; }
    if (!c.email) { res.skipped.push({ code, reason: "chưa có email" }); continue; }
    const key = sig(code, subj, text);
    if (log[key]) { res.dup.push(code); continue; } // đã gửi đúng thư này trước đó: không gửi lại
    jobs.push({ it, code, c, text, key });
  }
  let stop = false, idx = 0, dirty = false;
  async function worker() {
    while (!stop && idx < jobs.length) {
      const jb = jobs[idx++];
      if (Date.now() - t0 > TIME_BUDGET) { res.pending.push(jb.code); continue; } // hết thời gian: để đợt sau
      try {
        const it = jb.it;
        const cta = it && it.cta && /^https?:\/\//i.test(String(it.cta.url || "")) ? { label: clean(it.cta.label, 40) || "Mở liên kết", url: String(it.cta.url).slice(0, 500) } : null;
        const sent = await mail.send({ to: jb.c.email, subject: subj, html: tpl.build({ text: jb.text, tone: k, cta }), text: cta ? jb.text + "\n" + cta.url : jb.text });
        if (sent === false) { stop = true; res.ok = false; res.error = "Chưa cấu hình SMTP trên máy chủ, email chưa được gửi."; res.failed.push({ code: jb.code, error: "chưa cấu hình SMTP" }); continue; }
        res.sent++; log[jb.key] = Date.now(); dirty = true;
      } catch (e) { res.failed.push({ code: jb.code, error: String((e && e.message) || "lỗi gửi").slice(0, 120) }); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONC, jobs.length) }, worker));
  if (stop) jobs.slice(idx).forEach((jb) => res.pending.push(jb.code));
  if (dirty) { try { await store.put(SENT_KEY, log); } catch (e) { /* chỉ là sổ chống gửi trùng */ } }
  return { status: 200, body: res };
}
module.exports = { sendEmails };
