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
module.exports = { run };
