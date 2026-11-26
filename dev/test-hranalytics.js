// Phân tích nhân lực (giai đoạn 3) + khuyến nghị AI (giai đoạn 4): số liệu tổng hợp đúng, ngưỡng mẫu, ẩn danh, không đưa tuổi cho AI.  node dev/test-hranalytics.js
process.env.STORAGE_MODE = "memory"; process.env.SESSION_SECRET = "dev-session-secret-dev-session-secret-1234";
const quiz = require("../api/_lib/quiz");
const H = require("../api/_lib/hranalytics");
const AI = require("../api/_lib/hrai");
const llm = require("../api/_lib/llm");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
(async () => {
  // --- Spearman
  const xs = Array.from({ length: 40 }, (_, i) => i + 1);
  const up = H.spearman(xs, xs.map((x) => x * 2)), down = H.spearman(xs, xs.map((x) => -x)), few = H.spearman([1, 2, 3, 4, 5], [2, 1, 4, 3, 5]);
  ok(up.rho === 1 && up.p !== null && up.p < 0.001 && down.rho === -1, "Spearman: tăng đơn điệu = 1, giảm = -1, n >= 30 có p-value");
  ok(few.n === 5 && few.p === null, "Spearman: n < 30 không đưa p-value (không kết luận)");
  ok(H.rank([10, 20, 20, 30]).join() === "1,2.5,2.5,4", "xếp hạng xử lý đồng hạng bằng hạng trung bình");
  // --- dữ liệu mẫu: 60 người, điểm tăng theo thâm niên; SR yếu mảng B
  const now = Date.parse("2026-11-26T00:00:00Z"), cands = [];
  await quiz.saveSettings({ examTitle: "Kiểm tra định kì", passEnabled: true, passScore: 60 });
  for (let i = 1; i <= 60; i++) {
    const m = i * 2, y = new Date(now); y.setUTCMonth(y.getUTCMonth() - m);
    const title = i <= 36 ? "PC" : "SR", pct = Math.min(100, 30 + i);   // thâm niên và điểm cùng tăng theo i
    cands.push({ code: "NV" + i, name: "Tên Bí Mật " + i, email: "bi.mat" + i + "@x.vn", title, segment: "both", region: i % 2 ? "bac" : "nam", profile: { vaoCongTy: y.toISOString().slice(0, 10), namSinh: 1970 + (i % 25), trinhDo: i % 3 ? "Đại học" : "Cao đẳng" } });
    const okB = title === "SR" ? 0 : 1, paper = [{ category: "A", ok: 1 }, { category: "A", ok: 1 }, { category: "B", ok: okB }, { category: "B", ok: okB }];
    await quiz.putAttempt({ id: "a" + i, code: "NV" + i, status: "submitted", period: "k1", paper });
    await quiz.upsertIndex({ id: "a" + i, code: "NV" + i, name: "Tên Bí Mật " + i, status: "submitted", pct, score: pct / 10, total: 10, submittedAt: now, period: "k1", flags: { blur: i % 7 === 0 ? 5 : 0 } });
  }
  await quiz.saveCandidates(cands);
  const g = await H.gather({ now, period: "k1" }), a = H.analyze(g);
  ok(a.overview.n === 60 && a.meta.coverageCats === 60 && !g.truncated, "đọc đủ 60 bài, có điểm theo mảng của cả 60 người");
  ok(a.byTitle.find((t) => t.name === "PC").n === 36 && a.byTitle.find((t) => t.name === "SR").n === 24, "số người theo chức danh: PC 36, SR 24");
  ok(a.overview.belowPass === scoresBelow(60), "số người dưới mức đạt khớp (điểm < 60)");
  function scoresBelow(p) { let n = 0; for (let i = 1; i <= 60; i++) if (Math.min(100, 30 + i) < p) n++; return n; }
  const sr = a.gapMap.cells.find((c) => c.title === "SR"), iB = a.gapMap.categories.indexOf("B");
  ok(sr.values[iB].pct === 0 && sr.values[iB].gap < -30 && a.gapMap.overall.B > 0, "bản đồ năng lực: SR yếu mảng B (0%), thấp hơn mức chung rất xa");
  ok(a.priorities.find((p) => p.title === "SR").items[0].category === "B", "ưu tiên đào tạo: SR mảng B đứng đầu");
  const rt = a.relations.find((r) => r.name.indexOf("Thâm niên") === 0);
  ok(rt.n === 60 && rt.status === "ok" && rt.rho > 0.95 && rt.significant === true && rt.strength === "mạnh", "quan hệ thâm niên × điểm: n = 60, rho > 0.95, có ý nghĩa thống kê");
  ok(a.relations.find((r) => r.name.indexOf("Độ tuổi") === 0).sensitive === true, "quan hệ theo độ tuổi được đánh dấu nhạy cảm");
  ok(a.segments.reduce((s, x) => s + x.n, 0) === 60, "phân nhóm: mỗi người thuộc đúng một nhóm (tổng = 60)");
  ok(a.segments.find((x) => x.id === "S5").n >= 1 && a.segments.find((x) => x.id === "S3").n === 19, "nhóm 'điểm tốt, nên trao đổi' có người rời >= 4 lần; nhóm điểm dưới 50 có 19 người (điểm 31 đến 49)");
  ok(a.matrix.length > 0 && a.matrix.every((m) => m.method && m.kpi), "ma trận đào tạo có đủ cột đối tượng → nhu cầu → nội dung → phương pháp → thời lượng → hình thức → KPI");
  // --- ẩn danh và không đưa tuổi cho AI
  const sum = H.aiSummary(a), txt = JSON.stringify(sum);
  ok(!/Bí Mật|bi\.mat|NV\d|@x\.vn/.test(txt) && !/tuổi/i.test(txt) && !/"age"/.test(txt), "bản tóm tắt đưa cho AI: không có tên, mã, email, độ tuổi");
  ok(!JSON.stringify(a).match(/Bí Mật|bi\.mat|"NV\d/), "kết quả phân tích trả cho trang quản trị cũng không chứa tên / mã / email");
  const dirty = Object.assign({}, sum, { ho_ten: "Nguyễn Văn A", ma: "NV1", quan_he: sum.quan_he.concat([{ ten: "Độ tuổi × điểm", n: 60, muc_mau: "đủ để kết luận", rho: 0.5 }]) });
  const cl = AI.cleanSummary(dirty);
  ok(!("ho_ten" in cl) && !("ma" in cl) && !cl.quan_he.some((r) => /tuổi/i.test(r.ten)), "máy chủ lọc lại bản tóm tắt: bỏ khoá lạ và quan hệ về tuổi dù trình duyệt gửi thêm");
  // --- AI (giả lập)
  let seen = null;
  llm.chat = async (msgs) => { seen = msgs; return "```json\n" + JSON.stringify({ tom_tat: "Tóm tắt <b>thử</b>", phat_hien: [{ noi_dung: "SR yếu mảng B", bang_chung: "0%, 24 người", do_tin_cay: "cao" }], ke_hoach_dao_tao: [{ doi_tuong: "SR", nhu_cau: "Mảng B", noi_dung: "B", phuong_phap: "Coaching", thoi_luong: "4 giờ", hinh_thuc: "Trực tiếp", kpi: "Điểm >= 60" }], khuyen_nghi_quan_tri: ["Rà soát công cụ"], extra: "bỏ" }) + "\n```"; };
  const r = await AI.report(dirty);
  ok(r.ok && r.report.phat_hien.length === 1 && r.report.tom_tat.indexOf("<") < 0 && !("extra" in r.report), "AI: đọc được JSON bọc ```, bỏ thẻ HTML và khoá lạ");
  ok(seen && seen[0].content.indexOf("KHÔNG kết luận quan hệ nhân quả") > 0 && seen[1].content.indexOf("Nguyễn Văn A") < 0, "lời nhắc có luật cứng; dữ liệu gửi AI không chứa thông tin đã bị lọc");
  llm.chat = async () => { throw new Error("down"); };
  const bad = await AI.report(sum);
  ok(bad.ok === false && /không khả dụng/.test(bad.error), "AI lỗi: báo rõ, không làm hỏng phần phân tích số liệu");
  llm.chat = async () => "không phải json";
  ok((await AI.report(sum)).ok === false, "AI trả rác: không hiển thị");
  // --- ít mẫu
  await quiz.saveCandidates(cands.slice(0, 8)); const small = H.analyze(await H.gather({ now, period: "k1" }));
  ok(small.overview.n === 8 && small.relations.every((x) => x.status !== "ok") && small.notes.some((n) => /chưa kết luận/.test(n)), "8 người: mọi quan hệ chỉ mô tả, có ghi chú chưa kết luận");
  ok(small.byTitle.every((t) => t.n >= 5) && small.gapMap.cells.every((c) => c.values.every((v) => v === null || v.emp >= 5)), "nhóm dưới 5 người bị ẩn khỏi bảng và bản đồ");
  console.log("\n" + pass + " pass, " + fail + " fail"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
