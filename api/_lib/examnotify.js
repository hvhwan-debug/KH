// Tự động gửi email mời làm bài khi nhân viên được HỆ THỐNG GÁN vào một đề kiểm tra (theo "Đối tượng thi" +
// "Gán nhân viên làm đề này"), để họ biết mà vào kiểm tra — không cần quản trị viên tự soạn/gửi thủ công.
// - Chạy ngay sau khi tạo/sửa đề (api/kt-admin saveExam) để người mới được gán nhận thư sớm, và chạy định kì
//   trong cron (api/cron) để bắt những đợt sau (thêm mã NV, mở rộng đối tượng, nhân viên mới có email…).
// - Chỉ gửi cho người CHƯA từng được mời của ĐÚNG đề này: lưu danh sách mã NV đã mời vào exam.invitedCodes,
//   nên gọi lại nhiều lần (cron mỗi 30 phút) không gửi trùng; người gửi lỗi/kẹt giờ sẽ được thử lại lượt sau.
const quiz = require("./quiz");
const notify = require("./notify");
const { cfg } = require("./config");

const MAX_PER_RUN = 300; // mỗi đề mỗi lượt chạy, để không vượt ngân sách thời gian của sendEmails

async function run(opts) {
  opts = opts || {};
  const exams = await quiz.getExams();
  const cands = await quiz.getCandidates();
  const targets = exams.filter((e) => !opts.examId || e.id === opts.examId);
  let sent = 0, examsTouched = 0;
  for (const exam of targets) {
    if (exam.inviteOff || exam.practice) continue; // đề tắt mời tự động, hoặc đề thi thử: không gửi
    let settings; try { settings = await quiz.getExamSettings(exam.id); } catch (e) { continue; }
    const invited = new Set((exam.invitedCodes || []).map(quiz.normCode));
    const eligible = cands.filter((c) => c.email && quiz.inAudience(settings, c) && !invited.has(quiz.normCode(c.code)));
    if (!eligible.length) continue;
    const title = exam.examTitle || exam.title || exam.id;
    const link = cfg().appUrl + "/kiemtra/?exam=" + encodeURIComponent(exam.id);
    const text = "BẠN CÓ BÀI KIỂM TRA MỚI\nBạn vừa được gán làm bài kiểm tra \u201c" + title + "\u201d." + (exam.closeAt ? " Hạn hoàn thành: " + quiz.fmtVN(exam.closeAt) + "." : "");
    const items = eligible.slice(0, MAX_PER_RUN).map((c) => ({ code: c.code, text, cta: { label: "Vào làm bài", url: link } }));
    const r = await notify.sendEmails({ items, subject: "Bạn có bài kiểm tra mới: " + title, kind: "invite" });
    if (!r.body) continue;
    const skip = new Set([].concat(r.body.pending || [], (r.body.failed || []).map((f) => f.code)).map(quiz.normCode));
    const done = items.map((it) => quiz.normCode(it.code)).filter((code) => !skip.has(code));
    if (done.length) { exam.invitedCodes = Array.from(new Set([...(exam.invitedCodes || []), ...done])); examsTouched++; }
    sent += r.body.sent || 0;
  }
  if (examsTouched) await quiz.saveExams(exams);
  return { sent, exams: examsTouched };
}
module.exports = { run };
