// Bật / tắt chế độ THỬ NGHIỆM cho một thí sinh (ô tích "Tài khoản thử nghiệm" ở trang quản trị).
// - Bật: thí sinh được chuyển sang danh sách tài khoản thử nghiệm (giữ nguyên mã, email, tên, quản lí, tỉnh, miền...; bản gốc lưu trong "orig"
//   để trả về không mất gì). Danh sách thí sinh chính thức KHÔNG còn người này nên không lọt vào thống kê, nhắc nhở, xuất dữ liệu nào.
// - Bài làm của tài khoản thử nghiệm được lưu đầy đủ (ẩn khỏi mọi thống kê bằng quiz.getIndex), nên đăng nhập bằng khuôn mặt, tra cứu lịch sử,
//   đối chiếu / cảnh báo khác người... chạy như với thí sinh thật. Các bài chính thức đã làm trước đó vẫn là bài chính thức.
// - Tắt: trả về danh sách thí sinh với thông tin hiện tại.
// Thứ tự ghi: thêm vào đích TRƯỚC rồi mới gỡ khỏi nguồn, để lỡ lỗi giữa chừng thì không ai bị mất khỏi hệ thống.
const quiz = require("./quiz");
const MAX = 20;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_NAME = "Tài khoản thử nghiệm";
const fail = (status, error) => ({ ok: false, status, error });

async function toTest(code) {
  const k = quiz.normCode(code);
  if (!k) return fail(400, "Thiếu mã nhân viên.");
  const cands = await quiz.getCandidates(), i = cands.findIndex((c) => quiz.normCode(c.code) === k);
  if (i < 0) return fail(404, "Không tìm thấy thí sinh này trong danh sách.");
  const c = cands[i], email = String(c.email || "").trim().toLowerCase();
  if (!EMAIL.test(email)) return fail(400, "Thí sinh này chưa có email hợp lệ. Hãy nhập email trước khi bật chế độ thử nghiệm.");
  const dupe = cands.find((x, j) => j !== i && quiz.normEmail(x.email) === email);
  if (dupe) return fail(400, "Email này đang trùng với thí sinh khác (mã " + dupe.code + "). Hãy đổi email trước.");
  const accounts = await quiz.getTestAccounts(), prev = accounts.find((t) => quiz.normCode(t.code) === k);
  if (!prev && accounts.length >= MAX) return fail(400, "Tối đa " + MAX + " tài khoản thử nghiệm. Hãy trả bớt về thí sinh thường.");
  const rec = Object.assign({}, prev || {}, { code: c.code, email, name: c.name || DEFAULT_NAME, manager: c.manager || "", title: quiz.normTitle(c.title) || "", phone: c.phone || "",
    segment: quiz.normSegment(c.segment), region: quiz.normRegion(c.region) || "", province: c.province || "", orig: c });
  await quiz.saveTestAccounts(accounts.filter((t) => quiz.normCode(t.code) !== k).concat(rec));
  cands.splice(i, 1); await quiz.saveCandidates(cands);
  return { ok: true };
}

// Hồ sơ thí sinh dựng lại từ tài khoản thử nghiệm: bản gốc ("orig") + các chỉnh sửa trong lúc thử nghiệm
function backOf(t) {
  const o = t.orig && typeof t.orig === "object" ? t.orig : {}, pick = (a, b) => (a !== undefined && a !== null && String(a).trim() !== "" ? a : b);
  const back = Object.assign({}, o, { code: t.code, email: t.email, name: pick(t.name === DEFAULT_NAME ? "" : t.name, o.name || ""), manager: pick(t.manager, o.manager || ""), title: pick(t.title, o.title),
    phone: pick(t.phone, o.phone || ""), segment: pick(t.segment, o.segment), region: pick(t.region, o.region || ""), province: pick(t.province, o.province || "") });
  delete back.test;
  return back;
}

async function toCandidate(code) {
  const k = quiz.normCode(code);
  if (!k) return fail(400, "Thiếu mã nhân viên.");
  const accounts = await quiz.getTestAccounts(), t = accounts.find((x) => quiz.normCode(x.code) === k);
  if (!t) return fail(404, "Không tìm thấy tài khoản thử nghiệm này.");
  const cands = await quiz.getCandidates();
  if (cands.some((c) => quiz.normCode(c.code) === k)) return fail(409, "Đã có thí sinh cùng mã trong danh sách. Hãy xử lý trùng mã trước.");
  if (cands.some((c) => quiz.normEmail(c.email) === quiz.normEmail(t.email))) return fail(409, "Email này đang là của một thí sinh khác trong danh sách. Hãy đổi email trước.");
  cands.push(backOf(t)); await quiz.saveCandidates(cands);
  await quiz.saveTestAccounts(accounts.filter((x) => quiz.normCode(x.code) !== k));
  return { ok: true };
}

// Khi quản trị XOÁ dòng của tài khoản thử nghiệm vốn là thí sinh thật (có "orig"): trả họ về danh sách thí sinh thay vì làm mất người.
// Bỏ qua (không ghi đè) nếu mã hoặc email đã bị người khác dùng. Trả số người đã trả về.
async function restoreMany(list) {
  const todo = (list || []).filter((t) => t && t.orig && typeof t.orig === "object");
  if (!todo.length) return 0;
  const cands = await quiz.getCandidates(); let n = 0;
  todo.forEach((t) => {
    const k = quiz.normCode(t.code);
    if (cands.some((c) => quiz.normCode(c.code) === k || quiz.normEmail(c.email) === quiz.normEmail(t.email))) return;
    cands.push(backOf(t)); n++;
  });
  if (n) await quiz.saveCandidates(cands);
  return n;
}

module.exports = { toTest, toCandidate, restoreMany, MAX };
