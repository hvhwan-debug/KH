// LUỒNG ĐÀO TẠO: từ bảng kế hoạch đào tạo tháng, tự tạo mọi thứ cần có cho từng chương trình:
//   chương trình học (đăng ký bằng 1 nút trong email) · bài kiểm tra sau đào tạo (đề riêng, câu hỏi ở dạng NHÁP) · khảo sát sau buổi học (nháp)
//   và bảng theo dõi luồng (người nhận, đã mời, đã đăng ký, câu hỏi, thư làm bài).
// NGUYÊN TẮC AN TOÀN (rút ra từ sự cố 11/2026: gửi nhầm email mời cho toàn bộ nhân viên):
//  - Tạo luồng KHÔNG gửi email nào. Mọi thư chỉ gửi qua các bước riêng: xem trước (đúng số người) → xác nhận (gửi kèm đúng số đã xem) → gửi theo đợt.
//  - Chỉ gửi khi kế hoạch ở trạng thái "Đã duyệt" và nội dung KHÔNG đổi kể từ lúc duyệt (so mã băm).
//  - Người nhận chỉ gồm nhân sự đúng vị trí của chương trình, có email, chưa nghỉ việc; danh sách trùng gần như toàn bộ nhân sự thì từ chối.
//  - Đề kiểm tra tạo ra: chỉ những mã NV đó được thi (asgMode "pick"), tắt tự mời (inviteOff), mở sau buổi học.
//  - Câu hỏi AI chỉ soạn DỰA TRÊN tài liệu có trong Kho tri thức nhắc đúng sản phẩm/chủ đề; không có tài liệu thì KHÔNG soạn (không bịa); câu soạn vào ở dạng nháp (inactive).
const store = require("./store");
const quiz = require("./quiz");
const P = require("./programs");
const CTX = require("./hrcontext");
const TP = require("./trainplan");
const mail = require("./mail");
const ks = require("./survey");
const { cfg, mailConfigured } = require("./config");

const KEY = "kt/trainflow/", MONTH = /^\d{4}-(0[1-9]|1[0-2])$/, BATCH = 25, MAX_SHARE = 0.9;
const s = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n || 200);
const pad = (n) => (n < 10 ? "0" + n : "" + n);
const fkey = (m) => KEY + m + ".json";
const err = (error, code) => ({ ok: false, error, code });

// ---------- thời gian (giờ Việt Nam UTC+7) ----------
function startMs(row) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.thoiGian || "")) return 0;
  const g = /^(\d{2}):(\d{2})$/.exec(row.gio || "") || ["", "08", "00"], p = row.thoiGian.split("-").map(Number);
  return Date.UTC(p[0], p[1] - 1, p[2], +g[1] - 7, +g[2]);
}
const hhmm = (ms) => { const d = new Date(ms + 7 * 3600e3); return pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()); };
const dmy = (iso) => iso.slice(8) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4);

// ---------- người nhận: đúng vị trí, có email, chưa nghỉ việc; chặn danh sách quá rộng ----------
function audKey(label) { const k = CTX.audienceKey(s(label, 40), ""); return k && k !== "OTHER" ? k : ""; }
function recipientsFor(row, cands) {
  const active = cands.filter((c) => !quiz.isLeft(c)), key = audKey(row.doiTuong);
  if (!key) return { ok: false, code: "no_audience", error: "Không xác định được vị trí của chương trình “" + row.tenChuongTrinh + "” (đối tượng: " + (row.doiTuong || "trống") + ")." };
  const hit = active.filter((c) => CTX.audienceKey(c.title, quiz.normSegment(c.segment)) === key);
  if (active.length >= 10 && hit.length > MAX_SHARE * active.length) return { ok: false, code: "too_broad", error: "Đối tượng “" + row.doiTuong + "” trùng " + hit.length + "/" + active.length + " nhân sự (gần như toàn công ty): dừng để tránh gửi nhầm. Hãy kiểm tra chức danh trong hồ sơ nhân sự." };
  // Mã dùng cho chương trình phải đúng dạng P.up (chữ HOA) như nơi lưu "đã mời" — lệch dạng (normCode là chữ thường) sẽ khiến gửi trùng thư.
  const list = hit.map((c) => ({ code: P.up(c.code), name: c.name || "", email: c.email || "" }));
  return { ok: true, key, list, codes: hit.map((c) => quiz.normCode(c.code)), withEmail: list.filter((x) => x.email).length, noEmail: list.filter((x) => !x.email).length };
}

// ---------- điều kiện gửi thư: kế hoạch đã duyệt và nội dung không đổi kể từ lúc duyệt ----------
function gate(plan) {
  if (!plan) return err("Chưa có kế hoạch đã lưu cho tháng này.", "no_plan");
  const a = plan.approval || {};
  if (a.status !== "approved") return err("Chỉ gửi thư khi kế hoạch ở trạng thái “Đã duyệt”. Hiện là: " + ({ draft: "Nháp", pending: "Chờ duyệt", rejected: "Không duyệt" }[a.status] || "Nháp") + ".", "not_approved");
  if (!a.hash || a.hash !== TP.rowsHash(plan.rows)) return err("Nội dung kế hoạch đã thay đổi sau khi duyệt: cần duyệt lại trước khi gửi thư.", "changed_after_approval");
  return null;
}

// ---------- dựng chương trình / đề / khảo sát từ một dòng kế hoạch ----------
function programFrom(row, old) {
  const st = startMs(row), end = st ? st + TP.durMin(row.thoiLuong) * 60000 : 0;
  return { id: old && old.programId, title: row.tenChuongTrinh, desc: [row.mucTieu].concat((row.noiDung || []).map((x) => "- " + x)).filter(Boolean).join("\n"),
    when: st ? hhmm(st) + "–" + hhmm(end) + " ngày " + dmy(row.thoiGian) : "", where: row.phuongPhap || "Trực tuyến", speaker: row.phuTrach, contact: row.phuTrach, audience: row.doiTuong, deadline: st, status: "open" };
}
const SURVEY_Q = [
  { id: "q1", type: "rating", text: "Nội dung buổi học hữu ích với công việc bán hàng của bạn ở mức nào?", required: true, max: 5, low: "Chưa hữu ích", high: "Rất hữu ích" },
  { id: "q2", type: "rating", text: "Bạn tự tin áp dụng nội dung này vào thực tế bán hàng ở mức nào?", required: true, max: 5, low: "Chưa tự tin", high: "Rất tự tin" },
  { id: "q3", type: "text", text: "Phần nào còn chưa rõ hoặc bạn muốn được học sâu hơn?", required: false },
  { id: "q4", type: "text", text: "Tình huống thực tế nào tại điểm bán bạn muốn được giải đáp ở buổi sau?", required: false }];
async function ensureSurvey(code, title, by) {
  if (!ks.validCode(code)) return null;
  const old = await ks.getSurvey(code).catch(() => null); if (old) return code; // không ghi đè khảo sát đã có (giữ nội dung và kết quả)
  await store.put(ks.surveyKey(code), { code, title: s("Khảo sát sau đào tạo: " + title, 200), questions: ks.cleanQuestions(SURVEY_Q), description: "Cảm ơn bạn đã tham gia. Ý kiến của bạn giúp chúng tôi cải thiện chương trình đào tạo.", thanks: "Cảm ơn bạn đã góp ý!",
    identity: "emp", audience: null, showProgress: true, flow: "auto", open: false, openAt: 0, closeAt: 0, maxResponses: 0, createdAt: Date.now(), updatedAt: Date.now(), updatedBy: by });
  return code;
}

// ---------- tạo luồng: chương trình + đề + khảo sát cho từng dòng kế hoạch (không gửi email) ----------
async function load(month) { return (await store.get(fkey(month)).catch(() => null)) || null; }
async function createFlow(month, by) {
  month = s(month, 7); if (!MONTH.test(month)) return err("Tháng không hợp lệ.");
  const plan = await TP.get(month); if (!plan) return err("Hãy lưu kế hoạch đào tạo của tháng này trước khi tạo luồng.", "no_plan");
  const cands = await quiz.getCandidates(), old = (await load(month)) || { items: [] }, items = [], problems = [];
  for (let i = 0; i < plan.rows.length; i++) {
    const row = plan.rows[i], prev = old.items[i] || {}, rc = recipientsFor(row, cands);
    if (!rc.ok) { problems.push({ index: i, title: row.tenChuongTrinh, error: rc.error, code: rc.code }); items.push(Object.assign({}, prev, { index: i, title: row.tenChuongTrinh, error: rc.error })); continue; }
    let pr = await P.save(programFrom(row, prev), by);
    if (pr.error && prev.programId) pr = await P.save(programFrom(row, null), by); // chương trình cũ đã bị xoá: tạo lại
    if (pr.error) { problems.push({ index: i, title: row.tenChuongTrinh, error: pr.error }); items.push({ index: i, title: row.tenChuongTrinh, error: pr.error }); continue; }
    const code = "dt-" + month + "-" + (i + 1), st = startMs(row), end = st ? st + TP.durMin(row.thoiLuong) * 60000 : 0;
    await ensureSurvey(code, row.tenChuongTrinh, by);
    const surveyUrl = cfg().appUrl + "/kiemtra/ks.html?ks=" + code;
    const ex = await quiz.upsertExam({ id: code, title: s("Kiểm tra: " + row.tenChuongTrinh, 150), description: s(row.mucTieu, 500), asgMode: "pick", codes: rc.codes, inviteOff: true, sharedUniform: true, practice: false,
      openAt: end || 0, closeAt: end ? end + 7 * 864e5 : 0, surveyUrl });
    if (!ex.ok) { problems.push({ index: i, title: row.tenChuongTrinh, error: ex.error }); items.push({ index: i, title: row.tenChuongTrinh, programId: pr.program.id, error: ex.error }); continue; }
    items.push({ index: i, title: row.tenChuongTrinh, audience: row.doiTuong, programId: pr.program.id, examId: code, surveyCode: code, surveyUrl, createdAt: prev.createdAt || Date.now() });
  }
  const doc = { v: 1, month, items, createdAt: old.createdAt || Date.now(), updatedAt: Date.now(), by: String(by || "").toLowerCase() };
  await store.put(fkey(month), doc);
  return { ok: true, problems, status: await status(month) };
}

// ---------- câu hỏi kiểm tra: chỉ dựa trên tài liệu có thật; vào đề ở dạng NHÁP ----------
function termsOf(row) {
  const t = []; const m = /Sản phẩm trọng tâm tháng: (.+?) · /.exec(row.tenChuongTrinh || "");
  if (m) m[1].split(",").forEach((x) => t.push(x.trim()));
  (row.noiDung || []).forEach((x) => { const w = /^Củng cố chủ đề yếu: (.+?) \(TB/.exec(x); if (w) t.push(w[1].trim()); });
  return t.filter((x) => x.length >= 2).slice(0, 8);
}
async function genQuestions(month, index, opt) {
  month = s(month, 7); const plan = await TP.get(month), flow = await load(month), it = flow && flow.items[index], row = plan && plan.rows[index];
  if (!plan || !flow || !it || !it.examId || !row) return err("Chưa tạo luồng cho chương trình này.", "no_flow");
  const terms = termsOf(row);
  if (!terms.length) return { ok: true, generated: 0, reason: "no_terms", note: "Chương trình này chưa nêu sản phẩm / chủ đề cụ thể nên không có căn cứ để soạn câu hỏi. Hãy gắn tài liệu nguồn ở màn Ngân hàng câu hỏi." };
  const secs = await require("./kai-kb").getSections(), low = terms.map((x) => x.toLowerCase());
  const hit = secs.filter((x) => low.some((t) => (x.title + " " + x.text).toLowerCase().indexOf(t) >= 0));
  const text = hit.map((x) => x.title + "\n" + x.text).join("\n\n").slice(0, 14000);
  if (text.length < 200) return { ok: true, generated: 0, reason: "no_source", terms, note: "Kho tri thức chưa có tài liệu nhắc tới: " + terms.join(", ") + ". Hãy tải tài liệu sản phẩm lên Kho tri thức rồi soạn lại (hệ thống không soạn câu hỏi khi không có tài liệu để tránh đáp án sai)." };
  const per = it.examId, existing = (await quiz.getQuestions()).filter((q) => (q.period || "") === per).map((q) => q.text);
  const r = await require("./examai").generateDraft(terms.join(", "), Math.min(10, Math.max(1, parseInt(opt && opt.count, 10) || 6)), "Đào tạo " + month, existing, { name: hit.map((x) => x.title).join("; ").slice(0, 200), text });
  if (!r.ok && /trùng/.test(String(r.error || ""))) return { ok: true, generated: 0, dup: true, terms, note: "Không có câu mới: AI chỉ soạn ra câu trùng với các câu đã có trong đề này." };
  if (!r.ok) return err(r.error || "AI chưa soạn được câu hỏi.", "ai");
  const list = await quiz.getQuestions(), seen = new Set(list.filter((q) => (q.period || "") === per).map((q) => quiz.normText(q.text)));
  let added = 0, dup = 0, bad = 0;
  (r.questions || []).forEach((q) => {
    const nq = quiz.normalizeQuestionInput(q); if (nq.error) { bad++; return; }
    const k = quiz.normText(nq.fields.text); if (seen.has(k)) { dup++; return; } seen.add(k);
    list.push(Object.assign({ id: quiz.genId(), category: "Đào tạo " + month, active: false, period: per }, nq.fields, quiz.cleanQuestionMeta(Object.assign({}, q, { bankId: undefined }))));
    list[list.length - 1].active = false; // NHÁP: người phụ trách xem lại rồi mới bật
    added++;
  });
  await quiz.saveQuestions(list);
  return { ok: true, generated: added, dup, bad, terms, sources: hit.map((x) => x.title).slice(0, 6) };
}

// ---------- bảng theo dõi luồng ----------
async function status(month) {
  month = s(month, 7); const flow = await load(month), plan = await TP.get(month);
  if (!flow) return { month, created: false, plan: plan ? { approval: plan.approval || null, rows: plan.rows.length } : null, items: [] };
  const exams = await quiz.getExams(), qs = await quiz.getQuestions(), cands = await quiz.getCandidates(), out = [];
  for (const it of flow.items) {
    const row = plan && plan.rows[it.index], o = { index: it.index, title: it.title, audience: it.audience || (row && row.doiTuong) || "", date: row ? row.thoiGian : "", gio: row ? row.gio : "", error: it.error || "" };
    if (it.programId) {
      const p = await P.get(it.programId), R = await P.regs(it.programId), rc = row ? recipientsFor(row, cands) : { ok: false };
      o.program = p ? { id: p.id, status: p.status, invited: Object.keys(R.invited).length, regs: Object.keys(R.regs).length, cancels: Object.keys(R.cancels).length } : null;
      o.recipients = rc.ok ? { total: rc.list.length, withEmail: rc.withEmail, noEmail: rc.noEmail } : { error: rc.error };
    }
    if (it.examId) {
      const ex = exams.find((e) => e.id === it.examId), mine = qs.filter((q) => (q.period || "") === it.examId);
      o.exam = ex ? { id: ex.id, drafts: mine.filter((q) => q.active === false).length, active: mine.filter((q) => q.active !== false).length, audience: (ex.codes || []).length, invited: (ex.resentCodes || []).length, reminded: (ex.remindedCodes || []).length, openAt: ex.openAt || 0, closeAt: ex.closeAt || 0 } : null;
    }
    if (it.surveyCode) { const sv = await ks.getSurvey(it.surveyCode).catch(() => null); o.survey = sv ? { code: it.surveyCode, open: !!sv.open, url: it.surveyUrl } : null; }
    out.push(o);
  }
  return { month, created: true, updatedAt: flow.updatedAt, plan: plan ? { approval: plan.approval || null, rows: plan.rows.length } : null, gate: gate(plan), items: out, mail: mailConfigured() };
}

// ---------- gửi thư mời đăng ký chương trình: xem trước → xác nhận (kèm đúng số đã xem) → gửi theo đợt ----------
async function inviteProgram(month, index, opt) {
  opt = opt || {}; month = s(month, 7); const plan = await TP.get(month), g = gate(plan); if (g) return g;
  const flow = await load(month), it = flow && flow.items[index], row = plan.rows[index]; if (!it || !it.programId || !row) return err("Chưa tạo luồng cho chương trình này.", "no_flow");
  const p = await P.get(it.programId); if (!p) return err("Chương trình không còn tồn tại.", "no_program");
  const rc = recipientsFor(row, await quiz.getCandidates()); if (!rc.ok) return rc;
  const R = await P.regs(p.id), invited = (c) => !!R.invited[P.up(c.code)], pending = rc.list.filter((c) => c.email && !invited(c));
  const stats = { audience: rc.list.length, withEmail: rc.withEmail, noEmail: rc.noEmail, alreadyInvited: rc.list.filter((c) => c.email && invited(c)).length, pending: pending.length };
  if (opt.mode !== "send") return { ok: true, dry: true, stats, title: p.title, when: p.when, sample: pending.slice(0, 8).map((c) => c.name) };
  if (p.status === "closed") return err("Chương trình đang đóng đăng ký.", "closed");
  if (!mailConfigured()) return err("Máy chủ chưa cấu hình gửi email (SMTP).", "no_smtp");
  if (Number(opt.expect) !== stats.withEmail) return err("Số người nhận đã thay đổi (" + stats.withEmail + " thay vì " + Number(opt.expect) + "). Hãy xem trước lại rồi xác nhận.", "stale_preview");
  const batch = pending.slice(0, BATCH), sent = [], failed = [], taken = Object.keys(R.regs).length;
  for (const c of batch) {
    try { const m = await P.inviteMail(p, { code: c.code, name: c.name }, { taken }); const ok = await mail.send({ fromName: mail.KT_NAME, to: c.email, subject: m.subject, html: m.html, text: m.text, attachments: m.attachments });
      if (ok) sent.push({ code: c.code, name: c.name, email: c.email }); else failed.push({ code: c.code, reason: "Máy chủ chưa gửi được email" }); }
    catch (e) { failed.push({ code: c.code, reason: "Gửi thất bại" }); }
  }
  if (sent.length) await P.markInvited(p.id, sent);
  return { ok: true, sent: sent.length, failed, remaining: Math.max(0, pending.length - sent.length), stats };
}

// ---------- thư làm bài kiểm tra / nhắc làm bài: dùng lại luồng có sẵn (đề chỉ gồm đúng người của chương trình) ----------
async function examMail(month, index, opt) {
  opt = opt || {}; month = s(month, 7); const plan = await TP.get(month), g = gate(plan); if (g) return g;
  const flow = await load(month), it = flow && flow.items[index]; if (!it || !it.examId) return err("Chưa tạo luồng cho chương trình này.", "no_flow");
  const en = require("./examnotify"), fn = opt.kind === "remind" ? en.remind : en.resend;
  if (opt.kind !== "remind") { const n = (await quiz.getQuestions()).filter((q) => (q.period || "") === it.examId && q.active !== false).length; if (!n) return err("Đề chưa có câu hỏi nào được duyệt (đang là nháp). Hãy xem lại và bật câu hỏi trước khi gửi thư làm bài.", "no_questions"); }
  const dry = await fn(it.examId, { dry: true });
  if (!dry.ok || opt.mode !== "send") return dry;
  if (!mailConfigured()) return err("Máy chủ chưa cấu hình gửi email (SMTP).", "no_smtp");
  if (Number(opt.expect) !== dry.stats.audience) return err("Số người trong đề đã thay đổi (" + dry.stats.audience + " thay vì " + Number(opt.expect) + "). Hãy xem trước lại rồi xác nhận.", "stale_preview");
  return fn(it.examId, { confirm: true });
}

module.exports = { createFlow, status, genQuestions, inviteProgram, examMail, gate, recipientsFor, startMs, termsOf, load };
