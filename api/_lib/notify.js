// Gửi thông báo cho thí sinh qua email (Zalo và SMS được mở sẵn ở trình duyệt, người gửi bấm gửi).
// Email chỉ gửi tới ĐỊA CHỈ ĐÃ LƯU trong hồ sơ thí sinh (tra theo mã nhân viên), không nhận địa chỉ tuỳ ý từ trình duyệt.
const mail = require("./mail");
const quiz = require("./quiz");

const MAX_ITEMS = 300, MAX_TEXT = 1500;
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, n);

function html(text, kind, cta) {
  const lines = String(text).split("\n").map((l) => (/^\s*[-•]\s+/.test(l) ? "&bull;&nbsp;" + esc(l.replace(/^\s*[-•]\s+/, "")) : esc(l)));
  const body = lines.join("<br>").replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#0869df">$1</a>');
  const invite = kind === "invite";
  const head = invite ? '<div style="background:#0869df;background-image:linear-gradient(100deg,#0869df,#08b9d4);color:#fff;border-radius:16px 16px 0 0;padding:18px 24px;font-weight:800;font-size:17px;letter-spacing:.6px">THƯ MỜI</div>' : "";
  const button = cta && /^https?:\/\//i.test(cta.url || "") ? '<p style="margin:24px 0 4px"><a href="' + esc(cta.url) + '" style="display:inline-block;background:#0869df;background-image:linear-gradient(100deg,#0869df,#08b9d4);color:#fff;text-decoration:none;font-weight:700;padding:13px 28px;border-radius:12px">' + esc(cta.label) + "</a></p>" : "";
  const box = invite ? "border:1px solid #d6e6f9;border-top:0;border-radius:0 0 16px 16px;padding:22px 24px" : "padding:22px";
  return '<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.7;color:#102e5b;max-width:580px;margin:0 auto">' + head + '<div style="' + box + '">' + body + button +
    '<hr style="border:0;border-top:1px solid #e1ecf8;margin:22px 0 12px"><div style="font-size:12px;color:#7186a5">Hệ thống kiểm tra đánh giá trực tuyến</div></div></div>';
}

// candidates: toàn bộ hồ sơ; allowed: hàm (candidate) => có được gửi cho người này không (quản lí chỉ gửi cho nhân viên của mình)
async function sendEmails({ items, subject, kind, allowed }) {
  const subj = clean(subject, 150).trim();
  if (!subj) return { status: 400, body: { ok: false, error: "Nhập tiêu đề email." } };
  const list = Array.isArray(items) ? items.slice(0, MAX_ITEMS) : [];
  if (!list.length) return { status: 400, body: { ok: false, error: "Chưa chọn người nhận." } };
  const cands = await quiz.getCandidates();
  const byCode = {}; cands.forEach((c) => { byCode[quiz.normCode(c.code)] = c; });
  const res = { ok: true, sent: 0, failed: [], skipped: [] }, k = kind === "invite" ? "invite" : "";
  for (const it of list) {
    const code = String((it && it.code) || ""), c = byCode[quiz.normCode(code)];
    const text = clean(it && it.text, MAX_TEXT).trim();
    if (!c || !text || (allowed && !allowed(c))) { res.skipped.push({ code, reason: "không hợp lệ" }); continue; }
    if (!c.email) { res.skipped.push({ code, reason: "chưa có email" }); continue; }
    try {
      const cta = it && it.cta && /^https?:\/\//i.test(String(it.cta.url || "")) ? { label: clean(it.cta.label, 40) || "Mở liên kết", url: String(it.cta.url).slice(0, 500) } : null;
      const sent = await mail.send({ to: c.email, subject: subj, html: html(text, k, cta), text: cta ? text + "\n" + cta.url : text });
      if (sent === false) { res.ok = false; res.error = "Chưa cấu hình SMTP trên máy chủ, email chưa được gửi."; res.failed.push({ code, error: "chưa cấu hình SMTP" }); break; }
      res.sent++;
    } catch (e) { res.failed.push({ code, error: String((e && e.message) || "lỗi gửi").slice(0, 120) }); }
  }
  return { status: 200, body: res };
}
module.exports = { sendEmails };
