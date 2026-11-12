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
// examId / batchId / by: để ghi LỊCH SỬ NHẮC + BÁO CÁO ĐỢT GỬI và áp GIỚI HẠN TẦN SUẤT (xem notifylog.js). Không có examId thì gửi như cũ, không ghi sổ.
async function sendEmails({ items, subject, kind, allowed, examId, examTitle, batchId, by, byName }) {
  const t0 = Date.now();
  const subj = clean(subject, 150).trim();
  if (!subj) return { status: 400, body: { ok: false, error: "Nhập tiêu đề email." } };
  const list = Array.isArray(items) ? items.slice(0, MAX_ITEMS) : [];
  if (!list.length) return { status: 400, body: { ok: false, error: "Chưa chọn người nhận." } };
  const cands = await quiz.getCandidates();
  const byCode = {}; cands.forEach((c) => { byCode[quiz.normCode(c.code)] = c; });
  const res = { ok: true, sent: 0, failed: [], skipped: [], pending: [], dup: [], capped: [] }, k = tpl.toneOf(String(kind || ""));
  const nlog = require("./notifylog"), eid = String(examId || "").trim().slice(0, 80);
  const hist = eid ? await nlog.getHist(eid) : null; // lịch sử nhắc của đề này (để áp giới hạn tần suất)
  const rec = []; // báo cáo đợt: { code, name, status, reason }
  let log = {}; try { log = (await store.get(SENT_KEY)) || {}; } catch (e) { log = {}; }
  Object.keys(log).forEach((x) => { if (t0 - log[x] > DEDUP_MS) delete log[x]; });
  const jobs = [];
  for (const it of list) {
    const code = String((it && it.code) || ""), c = byCode[quiz.normCode(code)];
    const text = clean(it && it.text, MAX_TEXT).trim();
    if (!c || !text || (allowed && !allowed(c))) { res.skipped.push({ code, reason: "không hợp lệ" }); rec.push({ code, name: c && c.name, status: "skipped", reason: "không hợp lệ" }); continue; }
    if (quiz.isLeft(c)) { res.skipped.push({ code, reason: "đã nghỉ việc" }); rec.push({ code, name: c.name, status: "skipped", reason: "đã nghỉ việc" }); continue; } // nghỉ việc: không gửi thông báo nào
    if (!c.email) { res.skipped.push({ code, reason: "chưa có email" }); rec.push({ code, name: c.name, status: "skipped", reason: "chưa có email" }); continue; }
    const key = sig(code, subj, text);
    if (log[key]) { res.dup.push(code); rec.push({ code, name: c.name, status: "dup", reason: "đã nhận đúng thư này" }); continue; } // đã gửi đúng thư này trước đó: không gửi lại
    const why = hist ? nlog.capReason(hist, code, k) : ""; // giới hạn tần suất: tránh nhắc dồn một người
    if (why) { res.capped.push({ code, reason: why }); rec.push({ code, name: c.name, status: "capped", reason: why }); continue; }
    jobs.push({ it, code, c, text, key });
  }
  let stop = false, idx = 0, dirty = false; const sentCodes = [];
  async function worker() {
    while (!stop && idx < jobs.length) {
      const jb = jobs[idx++];
      if (Date.now() - t0 > TIME_BUDGET) { res.pending.push(jb.code); continue; } // hết thời gian: để đợt sau
      try {
        const it = jb.it;
        const cta = it && it.cta && /^https?:\/\//i.test(String(it.cta.url || "")) ? { label: clean(it.cta.label, 40) || "Mở liên kết", url: String(it.cta.url).slice(0, 500) } : null;
        const sent = await mail.send({ fromName: mail.KT_NAME, to: jb.c.email, subject: subj, html: tpl.build({ text: jb.text, tone: k, cta }), text: cta ? jb.text + "\n" + cta.url : jb.text });
        if (sent === false) { stop = true; res.ok = false; res.error = "Chưa cấu hình SMTP trên máy chủ, email chưa được gửi."; res.failed.push({ code: jb.code, error: "chưa cấu hình SMTP" }); continue; }
        res.sent++; log[jb.key] = Date.now(); dirty = true; sentCodes.push(jb.code); rec.push({ code: jb.code, name: jb.c.name, status: "sent" });
      } catch (e) { const er = String((e && e.message) || "lỗi gửi").slice(0, 120); res.failed.push({ code: jb.code, error: er }); rec.push({ code: jb.code, name: jb.c.name, status: "failed", reason: er }); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONC, jobs.length) }, worker));
  if (stop) jobs.slice(idx).forEach((jb) => res.pending.push(jb.code));
  if (dirty) { try { await store.put(SENT_KEY, log); } catch (e) { /* chỉ là sổ chống gửi trùng */ } }
  if (eid) { // ghi lịch sử + báo cáo đợt; lỗi sổ ghi không được làm hỏng kết quả gửi
    try { if (sentCodes.length) await nlog.recordHist(eid, sentCodes, { kind: k, ch: "email", by }); } catch (e) { /* bỏ qua */ }
    try { if (rec.length) await nlog.recordBatch(eid, batchId, { by, byName, examTitle, kind: k, ch: "email", subject: subj }, rec); } catch (e) { /* bỏ qua */ }
  }
  return { status: 200, body: res };
}

// Gửi THỬ một thư (đúng khung email như thật) cho CHÍNH người đang đăng nhập, để xem trước khi gửi hàng loạt. Không ghi lịch sử nhắc.
async function sendTest({ to, subject, text, kind, cta }) {
  const subj = clean(subject, 150).trim(), body = clean(text, MAX_TEXT).trim();
  if (!to) return { status: 400, body: { ok: false, error: "Không xác định được email của bạn." } };
  if (!subj || !body) return { status: 400, body: { ok: false, error: "Cần có tiêu đề và nội dung để gửi thử." } };
  const k = tpl.toneOf(String(kind || ""));
  const c = cta && /^https?:\/\//i.test(String(cta.url || "")) ? { label: clean(cta.label, 40) || "Mở liên kết", url: String(cta.url).slice(0, 500) } : null;
  try {
    const sent = await mail.send({ fromName: mail.KT_NAME, to, subject: "[GỬI THỬ] " + subj, html: tpl.build({ text: body, tone: k, cta: c }), text: c ? body + "\n" + c.url : body });
    if (sent === false) return { status: 200, body: { ok: false, error: "Chưa cấu hình SMTP trên máy chủ, chưa gửi được." } };
    return { status: 200, body: { ok: true, to } };
  } catch (e) { return { status: 200, body: { ok: false, error: String((e && e.message) || "lỗi gửi").slice(0, 120) } }; }
}
module.exports = { sendEmails, sendTest };
