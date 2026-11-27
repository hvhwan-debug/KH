// Luồng đào tạo: tạo chương trình / đề / khảo sát từ kế hoạch, chốt chặn gửi thư, câu hỏi có nguồn.  node dev/test-trainflow.js
process.env.STORAGE_MODE = "memory"; process.env.MAIL_MODE = "memory"; process.env.ADMIN_EMAILS = "admin@x.vn";
process.env.SESSION_SECRET = "dev-session-secret-dev-session-secret-1234"; process.env.ALLOWED_EMAIL_DOMAINS = "x.vn"; process.env.APP_URL = "https://kh.test";
const store = require("../api/_lib/store"), quiz = require("../api/_lib/quiz"), llm = require("../api/_lib/llm"), TP = require("../api/_lib/trainplan"), TF = require("../api/_lib/trainflow"), P = require("../api/_lib/programs"), KB = require("../api/_lib/kai-kb");
const session = require("../api/_lib/session"), admin = require("../api/kt-admin");
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
async function call(method, query, body) {
  const ctx = { log: Object.assign(() => {}, { error: console.error, warn: () => {} }), res: null };
  await admin(ctx, { method, headers: { "x-requested-with": "livotec", "x-sr-token": session.sessionValue("admin@x.vn") }, query: query || {}, body }); return { s: ctx.res.status, j: ctx.res.body };
}
const mails = () => (global.__mailbox || []).length;
(async () => {
  const d0 = new Date(), nm = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 1)), month = nm.getUTCFullYear() + "-" + String(nm.getUTCMonth() + 1).padStart(2, "0"), W = TP.workdays(month);
  const cands = [], mk = (code, title, email, extra) => cands.push(Object.assign({ code, name: "Người " + code, email, phone: "0912345678", manager: "QL", segment: "both", title, province: "Hà Nội", region: "bac", profile: { namSinh: 1990 } }, extra || {}));
  for (let i = 1; i <= 6; i++) mk("A" + i, "SR 1", i === 6 ? "" : "a" + i + "@x.vn");              // SR 1: 6 người, 1 chưa có email
  mk("A7", "SR 1", "a7@x.vn", { left: true });                                                       // đã nghỉ việc: không được nhận
  for (let i = 1; i <= 6; i++) mk("B" + i, "SR 2", "b" + i + "@x.vn");
  for (let i = 1; i <= 30; i++) mk("C" + i, "PC", "c" + i + "@x.vn");
  for (let i = 1; i <= 38; i++) mk("M" + i, "ASM", "m" + i + "@x.vn");
  await quiz.saveCandidates(cands);
  const rows = [
    { doiTuong: "SR 1", tenChuongTrinh: "Sản phẩm trọng tâm tháng: M25, kiềm · SR 1", noiDung: ["Lợi ích M25", "Thực hành tình huống"], mucTieu: "SR 1 bán tốt M25", phuongPhap: "Đào tạo trực tuyến", thoiLuong: "90 phút", phuTrach: "ĐTKDGT", thoiGian: W[3], gio: "08:00" },
    { doiTuong: "SR 2", tenChuongTrinh: "Kỹ năng tư vấn & xử lý từ chối · SR 2", noiDung: ["Củng cố chủ đề yếu: Xử lý từ chối (TB 40%)", "Thực hành"], mucTieu: "Nâng điểm kỹ năng", phuongPhap: "Đào tạo trực tuyến", thoiLuong: "120 phút", phuTrach: "ĐTKDGT", thoiGian: W[5], gio: "17:15" },
    { doiTuong: "PC", tenChuongTrinh: "Sản phẩm trọng tâm tháng: M25, BNN · PC", noiDung: ["Lợi ích M25 và BNN"], mucTieu: "PC bán tốt M25, BNN", phuongPhap: "Đào tạo trực tuyến", thoiLuong: "90 phút", phuTrach: "ĐTKDGT", thoiGian: W[7], gio: "08:00" }];
  const savePlan = (st, rws) => call("POST", {}, { op: "trainPlanSave", month, status: "final", rows: rws || rows, approval: { status: st, approver: "Phạm Đức" }, sendBefore: 3 });

  // 1) chưa có kế hoạch / chưa duyệt
  let r = await call("POST", {}, { op: "trainFlowCreate", month }); ok(r.s === 400 && r.j.code === "no_plan", "chưa lưu kế hoạch: không tạo luồng");
  r = await savePlan("pending"); ok(r.j.plan.approval.status === "pending" && r.j.plan.approval.hash === null, "kế hoạch chờ duyệt: chưa có mã băm duyệt");
  r = await call("POST", {}, { op: "trainFlowCreate", month });
  ok(r.s === 200 && r.j.ok && r.j.status.items.length === 3 && r.j.problems.length === 0, "tạo luồng khi mới chờ duyệt: tạo được 3 chương trình (tạo không cần duyệt)");
  ok(mails() === 0, "TẠO LUỒNG KHÔNG GỬI EMAIL NÀO");
  const st = r.j.status, it0 = st.items[0];
  ok(it0.program && it0.exam && it0.survey && it0.exam.audience === 6 && it0.recipients.total === 6 && it0.recipients.noEmail === 1, "SR 1: người nhận = 6 (không tính người nghỉ việc), 1 chưa có email; đề thi gồm đúng 6 mã còn làm việc");
  ok(st.gate && st.gate.code === "not_approved", "bảng theo dõi báo chưa được gửi thư vì chưa duyệt");
  const pr = await P.get(it0.program.id), ex0 = (await quiz.getExams()).find((e) => e.id === "dt-" + month + "-1");
  ok(pr && /^Sản phẩm trọng tâm tháng: M25, kiềm/.test(pr.title) && /08:00–09:30 ngày \d\d\/\d\d\/\d{4}/.test(pr.when) && /\n- Lợi ích M25/.test(pr.desc) && pr.deadline === TF.startMs(rows[0]) && pr.status === "open", "chương trình: tên, giờ 08:00–09:30, các ý nội dung dạng gạch đầu dòng, hạn đăng ký = giờ bắt đầu");
  ok(ex0 && ex0.asgMode === "pick" && ex0.inviteOff === true && ex0.codes.slice().sort().join() === "a1,a2,a3,a4,a5,a6" && ex0.openAt === TF.startMs(rows[0]) + 90 * 60000 && ex0.closeAt === ex0.openAt + 7 * 864e5 && /ks\.html\?ks=dt-/.test(ex0.surveyUrl), "đề kiểm tra: chỉ đúng người SR 1, tắt tự mời, mở sau buổi học 7 ngày, gắn link khảo sát");
  const sv = await require("../api/_lib/survey").getSurvey("dt-" + month + "-1"); ok(sv && sv.open === false && sv.questions.length === 4 && sv.identity === "emp", "khảo sát sau đào tạo: tạo ở dạng nháp (chưa mở), 4 câu");
  const progs0 = (await P.list()).length, exams0 = (await quiz.getExams()).length;
  r = await call("POST", {}, { op: "trainFlowCreate", month }); ok(r.j.ok && (await P.list()).length === progs0 && (await quiz.getExams()).length === exams0, "tạo luồng lần nữa: cập nhật, không tạo trùng chương trình / đề");

  // 2) chốt chặn gửi thư
  r = await call("POST", {}, { op: "trainFlowInvite", month, index: 0, mode: "dry" }); ok(r.s === 400 && r.j.code === "not_approved", "chưa duyệt: không cho xem trước / gửi thư mời");
  r = await savePlan("approved"); ok(r.j.plan.approval.status === "approved" && /^[0-9a-f]{16}$/.test(r.j.plan.approval.hash), "duyệt kế hoạch: lưu mã băm nội dung");
  r = await call("POST", {}, { op: "trainFlowInvite", month, index: 0, mode: "dry" });
  ok(r.s === 200 && r.j.dry && r.j.stats.audience === 6 && r.j.stats.withEmail === 5 && r.j.stats.pending === 5 && r.j.stats.alreadyInvited === 0 && r.j.sample.length === 5 && mails() === 0, "xem trước: 6 người, 5 có email, 5 chờ gửi; chưa gửi email nào");
  r = await call("POST", {}, { op: "trainFlowInvite", month, index: 0, mode: "send" }); ok(r.s === 400 && r.j.code === "stale_preview" && mails() === 0, "gửi mà không xác nhận số đã xem: bị từ chối");
  r = await call("POST", {}, { op: "trainFlowInvite", month, index: 0, mode: "send", expect: 99 }); ok(r.s === 400 && r.j.code === "stale_preview" && mails() === 0, "gửi với số người khác số đã xem: bị từ chối");
  r = await call("POST", {}, { op: "trainFlowInvite", month, index: 0, mode: "send", expect: 5 });
  const box = global.__mailbox || [];
  ok(r.s === 200 && r.j.sent === 5 && r.j.remaining === 0 && box.length === 5 && box.every((m) => /^a[1-5]@x\.vn$/.test(m.to)), "gửi mời SR 1: đúng 5 người SR 1 có email, không ai khác");
  ok(box[0].subject && /dangky\.html\?t=/.test(box[0].html), "thư mời có link đăng ký ký số");
  r = await call("POST", {}, { op: "trainFlowInvite", month, index: 0, mode: "dry" }); ok(r.j.stats.alreadyInvited === 5 && r.j.stats.pending === 0, "sau khi gửi: 5 người đã mời, không còn ai chờ gửi");
  r = await call("POST", {}, { op: "trainFlowInvite", month, index: 0, mode: "send", expect: 5 }); ok(r.j.sent === 0 && mails() === 5, "bấm gửi lại: không gửi trùng");
  r = await call("POST", {}, { op: "trainFlowInvite", month, index: 2, mode: "dry" }); ok(r.j.stats.pending === 30, "PC: 30 người chờ gửi");
  r = await call("POST", {}, { op: "trainFlowInvite", month, index: 2, mode: "send", expect: 30 }); ok(r.j.sent === 25 && r.j.remaining === 5 && mails() === 30, "gửi theo đợt tối đa 25 người, còn 5");
  r = await call("POST", {}, { op: "trainFlowInvite", month, index: 2, mode: "send", expect: 30 }); ok(r.j.sent === 5 && r.j.remaining === 0 && mails() === 35, "đợt sau gửi nốt 5 người còn lại");

  // 3) sửa nội dung sau khi duyệt → phải duyệt lại
  const edited = rows.map((x, i) => i === 0 ? Object.assign({}, x, { mucTieu: "Mục tiêu đã sửa sau khi duyệt" }) : x);
  r = await savePlan("approved", edited); ok(r.j.plan.approval.status === "pending" && r.j.plan.approval.hash === null, "sửa nội dung sau khi duyệt mà vẫn gửi 'Đã duyệt': tự chuyển về Chờ duyệt");
  r = await call("POST", {}, { op: "trainFlowInvite", month, index: 1, mode: "dry" }); ok(r.s === 400 && r.j.code === "not_approved", "đang chờ duyệt lại: không gửi được thư");
  r = await savePlan("approved", edited); ok(r.j.plan.approval.status === "approved", "duyệt lại một cách rõ ràng: được duyệt");
  r = await call("GET", { op: "trainFlowStatus", month }); ok(r.j.gate === null && r.j.items[0].program.invited === 5 && r.j.items[0].program.regs === 0 && r.j.items[2].program.invited === 30, "bảng theo dõi: đã mời 5 / 30, chưa ai đăng ký, hết khoá gửi");

  // 4) câu hỏi bài kiểm tra: chỉ khi có tài liệu nguồn; vào ở dạng nháp
  let aiCalls = 0, aiPrompt = ""; llm.chat = async (msgs) => { aiCalls++; aiPrompt = msgs.map((m) => m.content).join("\n"); return JSON.stringify({ questions: [
    { text: "Máy M25 phù hợp nhất với nhu cầu nào của khách?", options: ["Nước uống trực tiếp", "Làm mát", "Rửa chén", "Sưởi"], correctIndex: 0, explain: "Theo tài liệu M25" },
    { text: "Khi khách hỏi về lõi lọc M25, nhân viên nên làm gì trước?", options: ["Hỏi nhu cầu", "Báo giá ngay", "Từ chối", "Chuyển máy khác"], correctIndex: 0, explain: "Theo tài liệu M25" },
    { text: "Điểm khác biệt chính của dòng kiềm là gì?", options: ["Nước có tính kiềm", "Tiết kiệm điện", "Nhỏ gọn", "Màu sắc"], correctIndex: 0, explain: "Theo tài liệu kiềm" }] }); };
  r = await call("POST", {}, { op: "trainFlowQuestions", month, index: 0 });
  ok(r.s === 200 && r.j.generated === 0 && r.j.reason === "no_source" && aiCalls === 0 && /Kho tri thức/.test(r.j.note), "chưa có tài liệu nhắc tới M25 / kiềm: KHÔNG gọi AI, không soạn câu hỏi, nói rõ cần tải tài liệu");
  r = await call("POST", {}, { op: "trainFlowQuestions", month, index: 1 }); ok(r.j.reason === "no_source" && aiCalls === 0, "chủ đề 'Xử lý từ chối' cũng chưa có tài liệu: không soạn");
  await KB.saveDocs([{ id: "d1", title: "Tài liệu sản phẩm M25 và máy lọc kiềm", enabled: true, text: ("Máy lọc nước M25 là dòng máy lọc nước nóng lạnh dành cho gia đình. Dòng kiềm cho nước có tính kiềm nhẹ, phù hợp khách quan tâm sức khoẻ. Khi tư vấn cần hỏi nhu cầu trước. ").repeat(6) }]);
  r = await call("POST", {}, { op: "trainFlowQuestions", month, index: 0 });
  ok(r.s === 200 && r.j.generated === 3 && aiCalls >= 1 && /CHỈ DỰA TRÊN NỘI DUNG TÀI LIỆU/.test(aiPrompt) && /M25/.test(aiPrompt), "có tài liệu M25: soạn 3 câu, lời nhắc yêu cầu CHỈ dựa trên tài liệu");
  const bank = (await quiz.getQuestions()).filter((q) => q.period === "dt-" + month + "-1");
  ok(bank.length === 3 && bank.every((q) => q.active === false), "3 câu vào ngân hàng của đề riêng ở dạng NHÁP (chưa bật)");
  r = await call("POST", {}, { op: "trainFlowQuestions", month, index: 0 }); ok(r.s === 200 && r.j.generated === 0 && r.j.dup === true && (await quiz.getQuestions()).filter((q) => q.period === "dt-" + month + "-1").length === 3, "soạn lại: không nhân đôi câu đã có (vẫn 3 câu)");
  r = await call("GET", { op: "trainFlowStatus", month }); ok(r.j.items[0].exam.drafts === 3 && r.j.items[0].exam.active === 0, "bảng theo dõi: 3 câu nháp, 0 câu đã duyệt");

  // 5) thư làm bài kiểm tra: cần câu hỏi đã duyệt; dùng luồng gửi có sẵn; chỉ đúng người của đề
  const before = mails();
  r = await call("POST", {}, { op: "trainFlowExam", month, index: 0, kind: "invite", mode: "dry" }); ok(r.s === 400 && r.j.code === "no_questions", "đề chỉ có câu nháp: không cho gửi thư làm bài");
  const all = await quiz.getQuestions(); all.forEach((q) => { if (q.period === "dt-" + month + "-1") q.active = true; }); await quiz.saveQuestions(all);
  r = await call("POST", {}, { op: "trainFlowExam", month, index: 0, kind: "invite", mode: "dry" }); ok(r.s === 200 && r.j.dry && r.j.stats.audience === 6 && r.j.stats.pending === 5 && r.j.stats.noEmail === 1 && mails() === before, "xem trước thư làm bài: đề có 6 người, 5 người có email chờ gửi, 1 chưa có email");
  r = await call("POST", {}, { op: "trainFlowExam", month, index: 0, kind: "invite", mode: "send", expect: 1 }); ok(r.s === 400 && r.j.code === "stale_preview" && mails() === before, "gửi thư làm bài với số sai: bị từ chối");
  r = await call("POST", {}, { op: "trainFlowExam", month, index: 0, kind: "invite", mode: "send", expect: 6 }); const nb = (global.__mailbox || []).slice(before);
  ok(r.s === 200 && nb.length === 5 && nb.every((m) => /^a[1-5]@x\.vn$/.test(m.to)), "gửi thư làm bài: đúng 5 người SR 1 có email, không ai khác");
  r = await call("POST", {}, { op: "trainFlowExam", month, index: 0, kind: "remind", mode: "dry" }); ok(r.s === 200 && r.j.dry && r.j.stats.audience === 6, "xem trước nhắc làm bài: đúng 6 người trong đề");

  // 6) đối tượng quá rộng / không xác định: dừng, không tạo gì cho dòng đó
  const bad = rows.concat([{ doiTuong: "Khác", tenChuongTrinh: "Chương trình không rõ vị trí", noiDung: ["x"], thoiGian: W[9], gio: "08:00", thoiLuong: "90 phút" }]);
  await savePlan("pending", bad); r = await call("POST", {}, { op: "trainFlowCreate", month });
  ok(r.j.problems.length === 1 && r.j.problems[0].code === "no_audience" && !r.j.status.items[3].program, "vị trí không xác định: báo lỗi, không tạo chương trình cho dòng đó");
  await quiz.saveCandidates(Array.from({ length: 12 }, (_, i) => Object.assign({ code: "Z" + i, name: "Z" + i, email: "z" + i + "@x.vn", segment: "both", title: "PC" })));
  r = await call("POST", {}, { op: "trainFlowCreate", month });
  ok(r.j.problems.some((x) => x.code === "too_broad"), "vị trí trùng gần như toàn bộ nhân sự (12/12): dừng để tránh gửi nhầm");
  console.log("\n" + pass + " pass, " + fail + " fail"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
