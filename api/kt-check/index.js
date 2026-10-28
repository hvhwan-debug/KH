// Công khai, không cần đăng nhập: thí sinh nhập mã nhân viên + email để vào bài kiểm tra.
// Trả về: thông tin thí sinh, thể lệ bài thi, và trạng thái (chưa làm / đang làm dở / đã hoàn thành).
const _http = require("../_lib/http");
const { guardConfigured, requireAjax } = _http;
const reply = (ctx, status, body) => _http.reply(ctx, status, require("../_lib/profile").stripProfile(body)); // không bao giờ trả hồ sơ nhân sự ra ngoài kt-admin
const quiz = require("../_lib/quiz");
const advicelib = require("../_lib/advice");

// "hoan@wvn.vn" -> "h•••@wvn.vn": luôn 3 dấu chấm, không lộ độ dài phần trước @
function maskEmail(e) {
  const s = String(e || "").trim().toLowerCase(), at = s.lastIndexOf("@");
  if (at < 1) return "";
  return s.charAt(0) + "\u2022\u2022\u2022" + s.slice(at);
}
const _hint = new Map();
function hintKey(req) { const h = (req && req.headers) || {}; return String(h["x-forwarded-for"] || h["x-azure-clientip"] || "").split(",")[0].trim().split(":")[0] || "unknown"; }
function hintBlocked(req) {
  const k = hintKey(req), now = Date.now(), list = (_hint.get(k) || []).filter((t) => now - t < 10 * 60 * 1000);
  _hint.set(k, list); if (_hint.size > 5000) _hint.clear();
  return list.length >= 15;
}
function hintMiss(req) { const k = hintKey(req), list = _hint.get(k) || []; list.push(Date.now()); _hint.set(k, list); }

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    if (req.method !== "POST") return reply(context, 405, { ok: false, error: "Phương thức không hợp lệ." });
    if (!requireAjax(context, req)) return;
    if (quiz.tooManyFails(req, 8, 10 * 60 * 1000)) {
      return reply(context, 429, { ok: false, error: "Bạn đã thử quá nhiều lần. Vui lòng đợi vài phút rồi thử lại." });
    }
    const b = req.body || {};
    const code = quiz.normCode(b.code);
    // Gợi ý email: nhập đúng mã NV thì trả về email đã che (chỉ lộ 1 ký tự đầu + tên miền), giúp thí sinh nhớ dùng email nào.
    // Giới hạn riêng số lần hỏi mã không tồn tại theo IP để không dò được danh sách mã nhân viên.
    if (b.hint) {
      if (hintBlocked(req)) return reply(context, 429, { ok: false });
      if (!code || code.length < 4) return reply(context, 400, { ok: false });
      await quiz.runMigrations(context.log);
      const c = (await quiz.findTestByCode(code)) || (await quiz.getCandidates()).find((x) => quiz.normCode(x.code) === code);
      if (!c || !c.email || c.left) { hintMiss(req); return reply(context, 404, { ok: false }); }
      return reply(context, 200, { ok: true, hint: maskEmail(c.email) });
    }
    const email = quiz.normEmail(b.email);
    if (!code || !email) return reply(context, 400, { ok: false, error: "Nhập đầy đủ mã nhân viên và email." });

    await quiz.runMigrations(context.log);
    const candidates = await quiz.getCandidates();
    const found = (await quiz.findTestAccount(code, email)) || candidates.find((c) => quiz.normCode(c.code) === code && quiz.normEmail(c.email) === email);
    if (!found) {
      quiz.noteFail(req);
      return reply(context, 404, { ok: false, error: "Không tìm thấy thông tin khớp với mã nhân viên và email đã nhập. Kiểm tra lại hoặc liên hệ quản trị viên." });
    }

    // Thí sinh vừa chọn tỉnh/thành + miền ở màn xác nhận: lưu NGAY vào hồ sơ (chỉ khi hồ sơ còn thiếu),
    // để lần sau vào không phải chọn lại kể cả khi chưa bắt đầu làm bài.
    if (b.saveRegion) {
      const PROV = require("../_lib/provinces");
      const pv = PROV.canonProvince(b.province), rg = quiz.normRegion(b.region);
      if (!pv || !rg) return reply(context, 400, { ok: false, error: !pv ? "Vui lòng chọn tỉnh/thành bạn đang làm việc." : "Vui lòng chọn miền bán hàng (Miền Bắc hoặc Miền Nam)." });
      if (!(PROV.canonProvince(found.province) && quiz.normRegion(found.region))) {
        found.province = pv; found.region = rg; found.regionSetAt = Date.now();
        if (found.test) await quiz.updateTestAccount(found.code, { province: pv, region: rg }); else await quiz.saveCandidates(candidates);
      }
      return reply(context, 200, { ok: true, province: found.province, region: quiz.normRegion(found.region) });
    }

    const defaultSettings = await quiz.getSettings();
    const examId = String(b.examId || (req.query && req.query.exam) || "").trim();
    if (!examId) return reply(context, 400, { ok: false, needExam: true, error: "Vui lòng nhập mã đề thi hoặc mở đường link của đề.", serverNow: Date.now() });
    if (!(await quiz.examKnown(examId, defaultSettings))) {
      quiz.noteFail(req);
      return reply(context, 404, { ok: false, error: "Không tìm thấy đề thi này. Hãy kiểm tra lại đường link hoặc liên hệ quản trị viên." });
    }
    const settings = await quiz.getExamSettings(examId);
    const candidate = { code: found.code, name: found.name, email: found.email, manager: found.manager || "", phone: require("../_lib/phone").normPhone(found.phone), segment: quiz.normSegment(found.segment), title: quiz.titleOf(found),
      province: require("../_lib/provinces").canonProvince(found.province) || "", region: quiz.normRegion(found.region) };
    // PC chưa có tỉnh/miền: phải chọn ở màn xác nhận trước khi làm bài (miền quyết định bộ đề sản phẩm)
    candidate.needRegion = quiz.needsRegion(found) && !(candidate.province && candidate.region);
    candidate.test = !!found.test;
    const pendingRequest = (await require("../_lib/changereq").getAll()).some((r) => r.status === "pending" && quiz.normCode(r.code) === code);
    // Khung thời gian mở/đóng + đối tượng được thi (chỉ áp dụng cho đề thi có cấu hình các mục này)
    const denied = found.test ? null : quiz.examAccessError(settings, found, Date.now());
    if (denied) return reply(context, 403, { ok: false, error: denied });
    const exam = {
      id: examId,
      title: settings.examTitle,
      shareTitle: String(settings.shareTitle || "").trim() || settings.examTitle,
      questionCount: quiz.countFor(settings, found.segment, found.region),
      secondsPerQuestion: Math.max(10, settings.secondsPerQuestion || 60),
      passScore: quiz.passScoreOf(settings),
      practice: !!settings.practice,
      maxAttempts: found.test || quiz.attemptLimit(settings) === Infinity ? 0 : quiz.attemptLimit(settings) // 0 = không giới hạn
    };
    const idxAll = await quiz.getIndex();
    const subs = found.test ? [] : quiz.submittedOf(idxAll, code, settings.examPeriod); // tài khoản thử nghiệm: không có lịch sử, không giới hạn lượt
    const limit = found.test ? Infinity : quiz.attemptLimit(settings);

    const active0 = await quiz.activeForPeriod(found.code, settings.examPeriod);
    if (subs.length >= limit && !active0) {
      const idx = idxAll;
      let prior = null; subs.forEach((a) => { if (quiz.betterResult(a, prior)) prior = a; }); // hết lượt: hiện kết quả CAO NHẤT
      if (prior) {
        let adv = null;
        try { const pa = await quiz.getAttempt(prior.id); if (pa) { const pv = quiz.previousResult(idx, pa.code, pa.period, pa.id); adv = advicelib.ensureAnalysis(pa.advice || advicelib.rulesAdvice(advicelib.facts(pa, settings, pv)), pa, settings, pv); } } catch (e) { adv = null; }
        return reply(context, 200, {
          ok: true, candidate, exam, pendingRequest, alreadyDone: true,
          result: {
            score: prior.score, total: prior.total, pct: prior.pct, passed: quiz.passState(prior.pct, settings),
            compliancePoints: prior.compliancePoints, submittedAt: prior.submittedAt,
            mailOk: prior.mailOk, passScore: exam.passScore, durationSec: prior.durationSec,
            startedAt: prior.startedAt, wrong: prior.wrong, blank: prior.blank, proof: quiz.proofCode(prior.id), verify: quiz.verifyToken(prior.id), advice: adv,
            attempts: quiz.attemptsSummary(idxAll, code, settings.examPeriod, settings, prior.id)
          },
          serverNow: Date.now()
        });
      }
    }

    // Bài làm đang dở: cho phép làm tiếp (thời gian vẫn tính theo máy chủ).
    let inProgress = null;
    const active = await quiz.activeForPeriod(found.code, settings.examPeriod);
    if (active) {
      quiz.syncAttempt(active, Date.now());
      inProgress = { answered: Math.min(active.cursor, active.questionIds.length), total: active.questionIds.length };
    }
    // Đã làm nhưng còn lượt: báo số lượt đã dùng + kết quả lần gần nhất
    let best = null; subs.forEach((a) => { if (quiz.betterResult(a, best)) best = a; });
    const attempts = subs.length ? { used: subs.length, max: exam.maxAttempts, best: best ? { score: best.score, total: best.total, pct: best.pct, submittedAt: best.submittedAt } : null } : null;
    return reply(context, 200, { ok: true, candidate, exam, pendingRequest, inProgress, attempts, examTitle: settings.examTitle, serverNow: Date.now() });
  } catch (e) {
    context.log.error("kt-check", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra, thử lại sau." });
  }
};
