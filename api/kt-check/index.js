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
function hintMissCount(req) { const now = Date.now(); return (_hint.get(hintKey(req)) || []).filter((t) => now - t < 10 * 60 * 1000).length; }
function hintClear(req) { _hint.delete(hintKey(req)); }
// Nhập sai mã NV/email từ 2 lần (hoặc hỏi gợi ý bằng mã không tồn tại từ 5 lần) trong 10 phút -> lần sau phải xác thực khuôn mặt
const needFaceFor = (req) => quiz.failCount(req, 10 * 60 * 1000) >= 2 || hintMissCount(req) >= 5;
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
      if (needFaceFor(req)) return reply(context, 200, { ok: false, needFace: true }); // đang bị yêu cầu xác thực khuôn mặt: không gợi ý nữa
      if (!code || code.length < 4) return reply(context, 400, { ok: false });
      await quiz.runMigrations(context.log);
      const c = (await quiz.findTestByCode(code)) || (await quiz.getCandidates()).find((x) => quiz.normCode(x.code) === code);
      if (!c || !c.email || c.left) { hintMiss(req); return reply(context, 404, { ok: false }); }
      return reply(context, 200, { ok: true, hint: maskEmail(c.email) });
    }
    const email = quiz.normEmail(b.email);
    if (!code || !email) return reply(context, 400, { ok: false, error: "Nhập đầy đủ mã nhân viên và email." });

    await quiz.runMigrations(context.log);
    // Chống dò: đã nhập sai từ 2 lần thì lần thứ 3 trở đi phải kèm ảnh khuôn mặt chụp trực tiếp.
    // Ảnh phải có đúng một khuôn mặt người thật; nếu mã NV đã có ảnh các lần kiểm tra trước thì khuôn mặt phải khớp.
    const needFace = !b.saveRegion && needFaceFor(req);
    const selfie = needFace && typeof b.selfie === "string" ? b.selfie : "";
    if (needFace) {
      if (!selfie) return reply(context, 428, { ok: false, needFace: true, error: "Bạn đã nhập sai nhiều lần. Để tiếp tục, hãy xác thực khuôn mặt." });
      if (!/^data:image\/jpe?g;base64,/i.test(selfie) || selfie.length > 350000) return reply(context, 400, { ok: false, needFace: true, error: "Ảnh khuôn mặt không hợp lệ. Hãy chụp lại." });
      const live = await require("../_lib/facecheck").verify(selfie, null, code, "xac-thuc-dang-nhap");
      if (!live.allow) { quiz.noteFail(req); return reply(context, 403, { ok: false, needFace: true, error: live.message }); }
    }
    const candidates = await quiz.getCandidates();
    const found = (await quiz.findTestAccount(code, email)) || candidates.find((c) => quiz.normCode(c.code) === code && quiz.normEmail(c.email) === email);
    // Kết quả xác thực khuôn mặt (trả về cho thí sinh để biết rõ bước nào đạt, bước nào chưa)
    let face = null;
    if (needFace) {
      const fm = require("../_lib/facematch");
      let me = null;
      try { me = await fm.describe(selfie); } catch (e) { me = null; } // máy chủ không đối chiếu được: dựa vào bước kiểm tra ảnh ở trên
      if (me && me.n !== 1) { quiz.noteFail(req); return reply(context, 403, { ok: false, needFace: true, error: me.n ? "Ảnh có nhiều hơn một người. Chỉ người làm bài được có mặt trong ảnh, hãy chụp lại." : "Không thấy rõ khuôn mặt. Hãy nhìn thẳng camera, đủ sáng rồi chụp lại." }); }
      face = { ok: true, live: true, matched: null };
      if (found && me && me.desc) {
        // Mã NV đã có ảnh các lần kiểm tra trước: khuôn mặt phải khớp
        const rows = (await quiz.getIndex()).filter((r) => quiz.normCode(r.code) === code && !(r.faceId && r.faceId.s === "mismatch")).sort((a, c) => (c.startedAt || 0) - (a.startedAt || 0)).slice(0, 5);
        let best = Infinity, used = 0;
        for (const r of rows) {
          if (used >= 3) break;
          const a = await quiz.getAttempt(r.id); if (!a || !a.photo) continue;
          let d = Array.isArray(a.faceDesc) && a.faceDesc.length === 128 ? a.faceDesc : null;
          if (!d) { try { const x = await fm.describe(a.photo); d = x.n >= 1 ? x.desc : null; if (d) { a.faceDesc = d; await quiz.putAttempt(a); } } catch (e) { d = null; } }
          if (!d) continue;
          used++; best = Math.min(best, fm.dist(me.desc, d));
        }
        if (used) {
          if (best > fm.MATCH_MAX) { quiz.noteFail(req); return reply(context, 403, { ok: false, needFace: true, error: "Khuôn mặt không khớp với ảnh các lần kiểm tra trước của mã nhân viên này." }); }
          face.matched = true;
        }
      }
      if (found) { quiz.clearFails(req); hintClear(req); } // đã xác thực được: xoá số lần sai
    }
    if (!found) {
      quiz.noteFail(req);
      // Tài khoản thử nghiệm (quản trị viên tự tạo): nói rõ phần nào bị lệch để người kiểm thử sửa nhanh
      // CHỈ báo chi tiết khi trình duyệt đang đăng nhập quản trị viên (người kiểm thử). Người lạ chỉ nhận thông báo chung,
      // không bao giờ lộ email/mã đã đăng ký.
      let adminHere = false;
      try { const u = require("../_lib/session").userFromReq(req); adminHere = !!(u && u.email && require("../_lib/config").isAdmin(u.email)); } catch (e) { adminHere = false; }
      const near = adminHere ? await quiz.testNearMiss(code, email) : null;
      if (near) return reply(context, 404, { ok: false, faceNext: needFaceFor(req), error: near.by === "code"
        ? "[Chỉ quản trị viên thấy] Mã này thuộc một tài khoản thử nghiệm nhưng email chưa khớp. Xem lại ở Cài đặt → Tài khoản thử nghiệm."
        : "[Chỉ quản trị viên thấy] Email này thuộc một tài khoản thử nghiệm nhưng mã chưa khớp. Xem lại ở Cài đặt → Tài khoản thử nghiệm." });
      return reply(context, 404, { ok: false, face, faceNext: needFaceFor(req), error: "Không tìm thấy thông tin khớp với mã nhân viên và email đã nhập. Kiểm tra lại hoặc liên hệ quản trị viên." + (needFaceFor(req) && !needFace ? " Lần thử tiếp theo cần xác thực khuôn mặt." : "") });
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
