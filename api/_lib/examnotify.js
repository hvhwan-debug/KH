// Tự động gửi email mời làm bài khi nhân viên được HỆ THỐNG GÁN vào một đề kiểm tra (theo "Đối tượng thi" +
// "Gán nhân viên làm đề này"), để họ biết mà vào kiểm tra — không cần quản trị viên tự soạn/gửi thủ công.
// - Chạy ngay sau khi tạo/sửa đề (api/kt-admin saveExam) để người mới được gán nhận thư sớm, và chạy định kì
//   trong cron (api/cron) để bắt những đợt sau (thêm mã NV, mở rộng đối tượng, nhân viên mới có email…).
// - Chỉ gửi cho người CHƯA từng được mời của ĐÚNG đề này: lưu danh sách mã NV đã mời vào exam.invitedCodes,
//   nên gọi lại nhiều lần (cron mỗi 30 phút) không gửi trùng; người gửi lỗi/kẹt giờ sẽ được thử lại lượt sau.
const quiz = require("./quiz");
const mail = require("./mail");
const assignmail = require("./assignmail");
const { cfg } = require("./config");

const MAX_PER_RUN = 300; // mỗi đề mỗi lượt chạy, để không vượt ngân sách thời gian
const TIME_BUDGET = 25000, CONC = 4; // gửi song song tối đa 4 thư một lúc, trong vòng 25 giây mỗi lượt chạy

async function run(opts) {
  opts = opts || {};
  const t0 = Date.now();
  const exams = await quiz.getExams();
  const cands = await quiz.getCandidates();
  const targets = exams.filter((e) => !opts.examId || e.id === opts.examId);
  let sent = 0, examsTouched = 0;
  for (const exam of targets) {
    if (Date.now() - t0 > TIME_BUDGET) break; // hết giờ: các đề còn lại sẽ được xử lý ở lượt chạy sau (cron)
    if (exam.inviteOff || exam.practice) continue; // đề tắt mời tự động, hoặc đề thi thử: không gửi
    let settings; try { settings = await quiz.getExamSettings(exam.id); } catch (e) { continue; }
    const invited = new Set((exam.invitedCodes || []).map(quiz.normCode));
    const eligible = cands.filter((c) => c.email && quiz.inAudience(settings, c) && !invited.has(quiz.normCode(c.code)));
    if (!eligible.length) continue;
    const title = exam.examTitle || exam.title || exam.id;
    const link = cfg().appUrl + "/kiemtra/?exam=" + encodeURIComponent(exam.id);
    const list = eligible.slice(0, MAX_PER_RUN);
    const done = [];
    let idx = 0, stopped = false;
    async function worker() {
      while (idx < list.length && !stopped) {
        if (Date.now() - t0 > TIME_BUDGET) return;
        const c = list[idx++];
        try {
          const msg = assignmail.build({ name: c.name, title, audience: exam.description || "", deadlineMs: exam.closeAt || 0, ctaUrl: link, manager: c.manager || "" });
          const ok = await mail.send({ fromName: mail.KT_NAME, to: c.email, subject: msg.subject, html: msg.html, text: msg.text });
          if (ok === false) { stopped = true; return; } // chưa cấu hình SMTP: dừng hẳn, không thử tiếp người khác
          done.push(quiz.normCode(c.code)); sent++;
        } catch (e) { /* lỗi gửi riêng người này: bỏ qua, thử lại ở lượt sau */ }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONC, list.length) }, worker));
    if (done.length) { exam.invitedCodes = Array.from(new Set([...(exam.invitedCodes || []), ...done])); examsTouched++; }
  }
  if (examsTouched) await quiz.saveExams(exams);
  return { sent, exams: examsTouched };
}

// Gửi LẠI thư mời (thủ công, do quản trị viên bấm): chỉ người thuộc đối tượng, có email và CHƯA nộp bài của đề này.
// Thư có dòng "thay thế thông báo trước, bỏ qua email cũ". Mã NV đã được gửi lại lưu ở exam.resentCodes nên bấm lại không gửi trùng;
// fresh = true để bắt đầu đợt gửi lại mới. dry = true chỉ đếm, không gửi.
async function resend(examId, opts) {
  opts = opts || {};
  const t0 = Date.now();
  const exams = await quiz.getExams();
  const exam = exams.find((e) => e.id === examId);
  if (!exam) return { ok: false, error: "Không tìm thấy đề thi." };
  const settings = await quiz.getExamSettings(exam.id);
  const cands = await quiz.getCandidates();
  const doneSet = new Set((await quiz.getIndex()).filter((a) => a.status === "submitted" && (a.period || "") === settings.examPeriod).map((a) => quiz.normCode(a.code)));
  const resent = new Set(opts.fresh ? [] : (exam.resentCodes || []).map(quiz.normCode));
  const inAud = cands.filter((c) => quiz.inAudience(settings, c));
  const notDone = inAud.filter((c) => !doneSet.has(quiz.normCode(c.code)));
  const pending = notDone.filter((c) => c.email && !resent.has(quiz.normCode(c.code)));
  const stats = {
    audience: inAud.length, done: inAud.length - notDone.length,
    noEmail: notDone.filter((c) => !c.email).length,
    alreadyResent: notDone.filter((c) => c.email && resent.has(quiz.normCode(c.code))).length,
    pending: pending.length
  };
  const title = exam.examTitle || exam.title || exam.id;
  if (opts.dry) return { ok: true, dry: true, stats, title };
  if (!opts.confirm) return { ok: false, error: "Cần xác nhận trước khi gửi." };
  if (!pending.length) return { ok: true, sent: 0, remaining: 0, stats, title };
  const link = cfg().appUrl + "/kiemtra/?exam=" + encodeURIComponent(exam.id);
  const list = pending.slice(0, MAX_PER_RUN);
  const done = [];
  let idx = 0, stopped = false, noSmtp = false;
  async function worker() {
    while (idx < list.length && !stopped) {
      if (Date.now() - t0 > TIME_BUDGET) return;
      const c = list[idx++];
      try {
        const msg = assignmail.build({ name: c.name, title, audience: exam.description || "", deadlineMs: exam.closeAt || 0, ctaUrl: link, manager: c.manager || "", replaces: true });
        const ok = await mail.send({ fromName: mail.KT_NAME, to: c.email, subject: msg.subject, html: msg.html, text: msg.text });
        if (ok === false) { stopped = true; noSmtp = true; return; }
        done.push(quiz.normCode(c.code));
      } catch (e) { /* lỗi riêng người này: bấm gửi tiếp sẽ thử lại */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONC, list.length) }, worker));
  if (noSmtp && !done.length) return { ok: false, error: "Chưa cấu hình gửi email (SMTP), chưa gửi được thư nào." };
  exam.resentCodes = Array.from(new Set([...(opts.fresh ? [] : (exam.resentCodes || [])), ...done]));
  exam.resentAt = Date.now();
  await quiz.saveExams(exams);
  return { ok: true, sent: done.length, remaining: pending.length - done.length, stats, title };
}
module.exports = { run, resend };
