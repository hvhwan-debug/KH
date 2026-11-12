// Các thao tác của màn Gửi thông báo, dùng chung cho trang quản trị (api/kt-admin) và trang quản lí (api/kt-viewer).
// who = { email, name, isAdmin, allowed(c) }  — allowed giới hạn nhân viên mà người này được thao tác (quản lí chỉ thấy phạm vi của mình).
// Trả về { status, body } nếu op thuộc nhóm này, null nếu không (để nơi gọi xử lý tiếp).
const quiz = require("./quiz");
const notify = require("./notify");
const nlog = require("./notifylog");

const OPS = ["notifyEmail", "notifyHistory", "notifyBatches", "notifyLog", "notifyTest", "notifyTplList", "notifyTplSave", "notifyTplDel"];
const MANUAL_CH = ["zalo", "sms", "png", "pdf"];
const bad = (status, error) => ({ status, body: { ok: false, error } });

async function knownExam(id) {
  id = String(id || "").trim();
  if (!id) return "";
  try { return (await quiz.examKnown(id, await quiz.getSettings())) ? id : ""; } catch (e) { return ""; }
}

async function handle(op, b, who) {
  if (OPS.indexOf(op) < 0) return null;
  b = b || {};

  if (op === "notifyEmail") {
    const examId = await knownExam(b.examId); // đề không tồn tại thì vẫn gửi được nhưng KHÔNG ghi sổ / áp giới hạn
    return notify.sendEmails({ items: b.items, subject: b.subject, kind: b.kind, allowed: who.allowed, examId, examTitle: b.examTitle, batchId: b.batchId, by: who.email, byName: who.name });
  }

  if (op === "notifyTest") { // gửi thử cho CHÍNH người đang đăng nhập
    return notify.sendTest({ to: who.email, subject: b.subject, text: b.text, kind: b.kind, cta: b.cta });
  }

  if (op === "notifyTplList") return { status: 200, body: { ok: true, templates: await nlog.listTemplates(), canEdit: !!who.isAdmin } };
  if (op === "notifyTplSave") {
    if (!who.isAdmin) return bad(403, "Chỉ quản trị viên được lưu mẫu dùng chung.");
    const r = await nlog.saveTemplate(b.template, who.email, who.name);
    return { status: r.ok ? 200 : 400, body: r };
  }
  if (op === "notifyTplDel") {
    if (!who.isAdmin) return bad(403, "Chỉ quản trị viên được xoá mẫu dùng chung.");
    return { status: 200, body: { ok: true, deleted: await nlog.deleteTemplate(String(b.id || "")) } };
  }

  // Các thao tác còn lại cần một đề thi có thật
  const examId = await knownExam(b.examId);
  if (!examId) return bad(404, "Không tìm thấy đề thi.");

  if (op === "notifyHistory") {
    const cands = await quiz.getCandidates(), okCode = {};
    cands.forEach((c) => { if (!who.allowed || who.allowed(c)) okCode[quiz.normCode(c.code)] = true; });
    const sum = nlog.summarize(await nlog.getHist(examId), Date.now()), out = {};
    Object.keys(sum).forEach((k) => { if (okCode[k]) out[k] = sum[k]; });
    return { status: 200, body: { ok: true, hist: out, cap: { perDay: nlog.CAP_PER_DAY, gapHours: nlog.CAP_GAP_MS / 3600000 }, serverNow: Date.now() } };
  }
  if (op === "notifyBatches") {
    return { status: 200, body: { ok: true, batches: await nlog.getBatches(examId, who.isAdmin ? "" : who.email) } };
  }
  if (op === "notifyLog") { // ghi nhận gửi thủ công qua Zalo / SMS / PNG / PDF để lịch sử nhắc đầy đủ mọi kênh
    const ch = String(b.ch || "");
    if (MANUAL_CH.indexOf(ch) < 0) return bad(400, "Kênh không hợp lệ.");
    const cands = await quiz.getCandidates(), byCode = {};
    cands.forEach((c) => { byCode[quiz.normCode(c.code)] = c; });
    const rows = (Array.isArray(b.codes) ? b.codes : []).slice(0, 300).map((x) => byCode[quiz.normCode(x)]).filter((c) => c && (!who.allowed || who.allowed(c)));
    if (!rows.length) return { status: 200, body: { ok: true, logged: 0 } };
    const kind = require("./mailtpl").toneOf(String(b.kind || ""));
    await nlog.recordHist(examId, rows.map((c) => c.code), { kind, ch, by: who.email });
    await nlog.recordBatch(examId, b.batchId, { by: who.email, byName: who.name, examTitle: b.examTitle, kind, ch, subject: String(b.subject || "").slice(0, 150) }, rows.map((c) => ({ code: c.code, name: c.name, status: "sent" })));
    return { status: 200, body: { ok: true, logged: rows.length } };
  }
  return null;
}
module.exports = { handle, OPS };
