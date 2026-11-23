// Tra cứu LỊCH SỬ các bài kiểm tra đã làm của một nhân viên - chỉ sau khi quét khuôn mặt khớp.
// Khác api/kt-mypaper (xem lại MỘT bài qua link/QR), trang này cho nhân viên tự tra toàn bộ bài của mình.
// Các lớp bảo vệ (cùng chuẩn với kt-mypaper):
//   (1) đúng mã nhân viên + email của một bài đã nộp;
//   (2) ảnh chụp trực tiếp qua camera, không phải chụp lại từ màn hình / ảnh in (facecheck);
//   (3) đối chiếu khuôn mặt PHÍA MÁY CHỦ với ảnh đã lưu của chính nhân viên (facematch) - không chắc chắn thì KHÔNG cho xem;
//   (4) giới hạn số lần thử theo IP, khoá tra cứu của nhân viên đó sau nhiều lần đáng ngờ, báo quản trị viên;
//   (5) mọi lần tra cứu (kể cả bị từ chối) đều ghi nhật ký. Không lưu ảnh vừa chụp, không trả email / ảnh / đáp án ra ngoài.
const _http = require("../_lib/http");
const { guardConfigured, requireAjax } = _http;
const __reply = (ctx, status, body) => _http.reply(ctx, status, require("../_lib/profile").stripProfile(body));
const quiz = require("../_lib/quiz");
const auditlog = require("../_lib/auditlog");
const device = require("../_lib/device");
const facecheck = require("../_lib/facecheck");
const facematch = require("../_lib/facematch");
const secalert = require("../_lib/securityalert");

const MAX_ROWS = 50;      // số bài tối đa trả về (mới nhất trước)
const MAX_REFS = 3;       // số ảnh gốc dùng để đối chiếu
const NOT_FOUND = "Mã nhân viên hoặc email không đúng, hoặc bạn chưa có bài kiểm tra nào đã nộp.";
const lockKey = (code) => "hist:" + code; // khoá riêng cho tra cứu lịch sử của từng nhân viên (không lẫn với khoá xem lại từng bài)

async function logView(req, who, result, why, detail) {
  try {
    await auditlog.write({ area: "verify", role: "candidate", by: who.code, name: who.name || "", op: "viewHistory", label: "Thí sinh tra cứu lịch sử bài kiểm tra (đối chiếu khuôn mặt)",
      kind: result === "ok" ? "read" : "denied", status: result === "ok" ? 200 : 403, ok: result === "ok", details: { result: why, note: detail || "" }, ip: device.ipOf(req) });
    if (who.row) await require("../_lib/accesslog").write(req, { kind: "score", role: "candidate", attempt: who.row, by: who.code, byName: who.name, ok: result === "ok", via: "Tra cứu lịch sử (quét khuôn mặt)", note: result === "ok" ? "" : why });
  } catch (e) { /* không chặn luồng chính */ }
}

module.exports = async function (context, req) {
  const reply = require("../_lib/entrylog").wrap(req, "paper", __reply);
  try {
    if (guardConfigured(context)) return;
    if (req.method !== "POST") return reply(context, 405, { ok: false, error: "Phương thức không hợp lệ." });
    if (!requireAjax(context, req)) return;
    if (quiz.tooManyFails(req, 8, 10 * 60 * 1000)) return reply(context, 429, { ok: false, error: "Bạn đã thử quá nhiều lần. Vui lòng đợi vài phút rồi thử lại." });

    const b = req.body || {};
    // Tra cứu lịch sử CHỈ bằng khuôn mặt: không nhận mã NV + email (bỏ đường nhập tay dự phòng)
    if (!b.photo) return reply(context, 400, { ok: false, error: "Vui lòng quét khuôn mặt để tra cứu." });
    // Thử thách sống (nhìn thẳng + quay trái + quay phải theo thứ tự ngẫu nhiên): chặn giơ ảnh / màn hình người khác.
    // Máy chủ tự đo lại góc quay trên từng ảnh và kiểm tra cùng một người. FACE_LIVENESS=soft: không chặn; off: tắt.
    const FL = require("../_lib/facelive");
    if (FL.mode() === "on") {
      const lv = await FL.verify(b.live, b.photo);
      if (!lv.ok) {
        if (!lv.unavailable) quiz.noteFail(req);
        try { await auditlog.write({ area: "verify", role: "candidate", by: "", op: "viewHistory", label: "Thí sinh tra cứu lịch sử bài kiểm tra (thử thách quay mặt)", kind: "denied", status: 403, ok: false, details: { result: "liveness:" + lv.code, note: lv.message }, ip: device.ipOf(req) }); } catch (e) { /* bỏ qua */ }
        return reply(context, lv.unavailable ? 503 : 403, { ok: false, liveFailed: true, error: lv.message });
      }
    }
    let code = "", email = "", byFace = null;
    {
      // Chỉ quét khuôn mặt (không nhập mã NV + email): nhận diện 1-N trong thư viện, rồi vẫn đối chiếu 1-1 với ảnh đã lưu bên dưới
      const fi = await require("../_lib/faceident").identify(b.photo, "tra-cuu-lich-su");
      if (!fi.ok) {
        if (fi.fail) quiz.noteFail(req);
        try { await auditlog.write({ area: "verify", role: "candidate", by: "", op: "viewHistory", label: "Thí sinh tra cứu lịch sử bài kiểm tra (nhận diện khuôn mặt)", kind: "denied", status: fi.status, ok: false, details: { result: fi.why, note: fi.detail || "" }, ip: device.ipOf(req) }); } catch (e) { /* bỏ qua */ }
        const body = Object.assign({}, fi.body); delete body.needCode; // trang này không có đường nhập mã NV + email
        if (body.off) body.error = "Tra cứu bằng khuôn mặt đang tạm tắt. Vui lòng liên hệ quản trị viên hoặc bộ phận hỗ trợ.";
        return reply(context, fi.status, body);
      }
      code = quiz.normCode(fi.code); byFace = fi;
    }

    // Các bài ĐÃ NỘP của đúng mã nhân viên này (bài tài khoản thử nghiệm không nằm trong chỉ mục)
    const rows = (await quiz.getIndexAll()).filter((r) => r.status === "submitted" && quiz.normCode(r.code) === code)
      .sort((a, c) => (c.submittedAt || 0) - (a.submittedAt || 0));
    if (byFace && !rows.length) return reply(context, 404, { ok: false, error: "Đã nhận diện được bạn nhưng bạn chưa có bài kiểm tra nào đã nộp." });
    if (!rows.length || (!byFace && !rows.some((r) => quiz.normEmail(r.email) === email))) {
      quiz.noteFail(req);
      return reply(context, 403, { ok: false, error: NOT_FOUND }); // cùng một thông báo cho mọi trường hợp sai: không để dò mã nhân viên
    }
    const who = { code, name: rows[0].name || "", row: rows[0] };
    const pseudo = Object.assign({}, rows[0], { id: lockKey(code) }); // "bài giả" mang khoá tra cứu, dùng cho cảnh báo / khoá

    const lk = await secalert.lockState(lockKey(code));
    if (lk.locked) {
      await logView(req, who, "denied", "locked", "khoá đến " + quiz.fmtVN(lk.until));
      return reply(context, 403, { ok: false, locked: true, error: "Việc tra cứu của mã nhân viên này đang bị tạm khoá vì có nhiều lần xác thực khuôn mặt không khớp. Quản trị viên đã được báo. Vui lòng liên hệ quản lý hoặc quản trị viên để được mở khoá." });
    }

    // Ảnh đã lưu của chủ hồ sơ: các bài mới nhất có ảnh, bỏ ảnh từng bị đánh dấu "khác người" (tránh người làm hộ thành chuẩn)
    const refs = [];
    for (const r of rows.slice(0, 8)) {
      if (refs.length >= MAX_REFS) break;
      if (r.faceId && r.faceId.s === "mismatch") continue;
      let a = null; try { a = await quiz.getAttempt(r.id); } catch (e) { a = null; }
      if (a && a.photo && !(a.faceId && a.faceId.s === "mismatch")) refs.push({ photo: a.photo, desc: a.faceDesc, save: async (d) => { a.faceDesc = d; await quiz.putAttempt(a); } });
    }
    if (!refs.length) {
      await logView(req, who, "denied", "face:noref");
      return reply(context, 403, { ok: false, error: "Hồ sơ chưa có ảnh khuôn mặt đã lưu để đối chiếu. Vui lòng liên hệ quản trị viên." });
    }
    if (b.step === "check") return reply(context, 200, { ok: true, name: who.name });

    const selfie = typeof b.photo === "string" ? b.photo : "";
    if (!selfie.startsWith("data:image/") || selfie.length > 350000) return reply(context, 400, { ok: false, error: "Cần quét khuôn mặt bằng máy ảnh để xác thực." });

    // 1) Chụp trực tiếp, không phải chụp lại từ màn hình / ảnh in (đã kiểm tra khi nhận diện chỉ bằng khuôn mặt)
    const live = byFace ? byFace.live : await facecheck.verify(selfie, null, code, "tra-cuu-lich-su");
    if (!live.allow) {
      quiz.noteFail(req);
      await logView(req, who, "denied", "live", live.message);
      if (live.record && live.record.status === "spoof") {
        const al = await secalert.alertPaperAccess(req, pseudo, "spoof", { selfie, refPhoto: refs[0].photo, reason: live.message });
        return reply(context, 403, { ok: false, locked: al.locked, error: live.message + " Sự việc đã được ghi nhận và báo cho quản trị viên." });
      }
      return reply(context, 403, { ok: false, error: live.message });
    }

    // 2) Đối chiếu khuôn mặt bằng mô hình nhận diện chạy trên máy chủ
    const cmp = await facematch.compare(selfie, refs);
    if (!cmp.ok) {
      if (cmp.code !== "unavailable") quiz.noteFail(req);
      await logView(req, who, "denied", "face:" + cmp.code, cmp.distance != null ? "khoảng cách " + cmp.distance.toFixed(3) + " (ngưỡng " + cmp.threshold + ")" : "");
      if (cmp.code === "mismatch") {
        const al = await secalert.alertPaperAccess(req, pseudo, "mismatch", { selfie, refPhoto: refs[0].photo, distance: cmp.distance, threshold: cmp.threshold });
        return reply(context, 403, { ok: false, locked: al.locked, mismatch: true, title: "CẢNH BÁO XÁC THỰC KHUÔN MẶT", error: "Kết quả xác thực cho thấy khuôn mặt hiện tại không trùng khớp với hình ảnh đã đăng ký của chủ tài khoản bài làm. Hệ thống đã ghi nhận sự việc và gửi thông báo đến quản trị viên để kiểm tra, xác minh." + (al.locked ? " Việc tra cứu đã bị tạm khoá." : "") });
      }
      return reply(context, cmp.code === "unavailable" ? 503 : 403, { ok: false, error: cmp.message });
    }
    await logView(req, who, "ok", byFace ? "face:ok (chỉ quét mặt)" : "face:ok", "khoảng cách " + cmp.distance.toFixed(3) + " (ngưỡng " + cmp.threshold + ")");

    await require("../_lib/loginlog").write(req, { code, name: who.name, manager: rows[0].manager, method: byFace ? "face" : "manual_face", page: "history", note: "độ lệch " + cmp.distance.toFixed(3) });
    // Khuôn mặt khớp: trả danh sách bài (không có email, ảnh, đáp án). Liên kết "t" mở trang kết quả chính thức của từng bài.
    const cache = {}; const best = {};
    const settingsOf = async (p) => { if (!(p in cache)) { try { cache[p] = await quiz.getExamSettings(p); } catch (e) { cache[p] = {}; } } return cache[p]; };
    rows.forEach((r) => { const p = r.period || ""; if (!r.practice && !r.test && quiz.betterResult(r, best[p])) best[p] = r; });
    const list = [];
    for (const r of rows.slice(0, MAX_ROWS)) {
      const st = await settingsOf(r.period || "");
      list.push({
        id: r.id, exam: r.period || "", title: st.examTitle || r.examTitle || "Bài kiểm tra", practice: !!r.practice, test: !!r.test,
        score: r.score, total: r.total, pct: r.pct, wrong: r.wrong, blank: r.blank,
        passed: quiz.passState(r.pct, st), passScore: quiz.passScoreOf(st),
        submittedAt: r.submittedAt, durationSec: r.durationSec != null ? r.durationSec : null,
        official: !r.practice && !r.test && best[r.period || ""] === r, proof: r.proof || quiz.proofCode(r.id),
        paperOpen: !!st.closeAt && Date.now() > st.closeAt, t: quiz.verifyToken(r.id)
      });
    }
    return reply(context, 200, { ok: true, name: who.name, code: rows[0].code || "", manager: rows[0].manager || "", total: rows.length, list, serverNow: Date.now() });
  } catch (e) {
    context.log.error("kt-history", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra, thử lại sau." });
  }
};
