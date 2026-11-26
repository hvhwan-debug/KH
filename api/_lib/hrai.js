// KHUYẾN NGHỊ BẰNG AI (Workforce Intelligence, giai đoạn 4): nhận BẢN TÓM TẮT SỐ LIỆU TỔNG HỢP ẨN DANH (hranalytics.aiSummary) và nhờ mô hình ngôn ngữ
// viết nhận định, khoảng cách năng lực, kế hoạch đào tạo, khuyến nghị quản trị. Không gửi tên, mã, email, độ tuổi hay dữ liệu từng người.
// Luật cứng nằm trong lời nhắc: chỉ dựa trên số liệu được cung cấp, không kết luận nhân quả, tôn trọng ngưỡng cỡ mẫu, không gắn nhãn cá nhân.
const llm = require("./llm");
const CTX = require("./hrcontext");

const SYSTEM = [
  "Bạn là chuyên gia phân tích nhân lực (HR Analytics) và phát triển năng lực (L&D) cho đội ngũ kinh doanh kênh GT ngành máy lọc nước và gia dụng. Viết tiếng Việt chuyên nghiệp, ngắn gọn, dùng ngôi trung tính (không xưng \"bạn\", không xưng \"tôi\").",
  "CHỈ dùng số liệu trong dữ liệu JSON được cung cấp. Tuyệt đối không bịa số liệu, không suy đoán thông tin cá nhân, không nhắc tới tên hay mã nhân viên. Thiếu dữ liệu thì nói rõ là thiếu.",
  "Phân biệt rõ: dữ kiện (có trong số liệu), suy luận (của bạn) và dữ liệu còn thiếu. Mỗi nhận định phải kèm bằng chứng định lượng (số người, điểm, tỉ lệ) lấy từ dữ liệu.",
  "KHÔNG kết luận quan hệ nhân quả từ tương quan. Với quan hệ có muc_mau là \"chỉ mô tả\" hoặc \"chưa đủ\" thì không được rút kết luận, chỉ nói cần thêm dữ liệu.",
  "Nhóm có tin_cay \"thấp\" hoặc n dưới 10 chỉ nêu như tín hiệu tham khảo. Không gắn nhãn \"yếu kém\" hoặc \"tiềm năng cao\" cho cá nhân; chỉ nói về nhóm.",
  "Không đề xuất quyết định bất lợi về nhân sự (loại, hạ bậc, sa thải). Rời màn hình khi làm bài chỉ là tín hiệu để quản lí trao đổi, không phải bằng chứng gian lận.",
  "Không mặc định mọi vấn đề hiệu suất giải quyết được bằng đào tạo: với mỗi khoảng cách, phân loại: thiếu kiến thức / thiếu kỹ năng / thiếu kinh nghiệm thực hành / chưa ứng dụng được / nguyên nhân ngoài năng lực (hệ thống, chính sách, công cụ) / chưa đủ dữ liệu để xác định.",
  "Chỉ trả về MỘT đối tượng JSON hợp lệ, không kèm chữ nào khác, đúng cấu trúc: {\"tom_tat\":string,\"phat_hien\":[{\"noi_dung\":string,\"bang_chung\":string,\"do_tin_cay\":\"cao|vừa|thấp\"}],\"khoang_cach_nang_luc\":[{\"doi_tuong\":string,\"khoang_cach\":string,\"loai\":string,\"bang_chung\":string}],\"ke_hoach_dao_tao\":[{\"doi_tuong\":string,\"nhu_cau\":string,\"noi_dung\":string,\"phuong_phap\":string,\"thoi_luong\":string,\"hinh_thuc\":string,\"kpi\":string}],\"khuyen_nghi_quan_tri\":[string],\"du_lieu_can_bo_sung\":[string],\"han_che\":[string]}. Tối đa 6 mục mỗi danh sách."
].join(" ");
const SYSTEM_FULL = SYSTEM + " " + CTX.CONTEXT + " Có so sánh theo đối tượng đào tạo (theo_doi_tuong) thì so sánh SR GT1 với SR GT2 và giữa các chức danh, kèm cỡ mẫu.";

const s = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const arr = (v, max, fn) => (Array.isArray(v) ? v.slice(0, max).map(fn).filter(Boolean) : []);
function parse(text) {
  let t = String(text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}"); if (a < 0 || b < a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; }
}
// Làm sạch kết quả của AI: chỉ giữ các trường đã định, cắt độ dài, bỏ thẻ HTML
function clean(o) {
  if (!o || typeof o !== "object") return null;
  const out = {
    tom_tat: s(o.tom_tat, 900),
    phat_hien: arr(o.phat_hien, 6, (x) => x && s(x.noi_dung, 400) ? { noi_dung: s(x.noi_dung, 400), bang_chung: s(x.bang_chung, 400), do_tin_cay: ["cao", "vừa", "thấp"].indexOf(s(x.do_tin_cay, 10)) >= 0 ? s(x.do_tin_cay, 10) : "thấp" } : null),
    khoang_cach_nang_luc: arr(o.khoang_cach_nang_luc, 6, (x) => x && s(x.khoang_cach, 400) ? { doi_tuong: s(x.doi_tuong, 160), khoang_cach: s(x.khoang_cach, 400), loai: s(x.loai, 120), bang_chung: s(x.bang_chung, 400) } : null),
    ke_hoach_dao_tao: arr(o.ke_hoach_dao_tao, 6, (x) => x && s(x.doi_tuong, 200) ? { doi_tuong: s(x.doi_tuong, 200), nhu_cau: s(x.nhu_cau, 300), noi_dung: s(x.noi_dung, 300), phuong_phap: s(x.phuong_phap, 300), thoi_luong: s(x.thoi_luong, 120), hinh_thuc: s(x.hinh_thuc, 160), kpi: s(x.kpi, 300) } : null),
    khuyen_nghi_quan_tri: arr(o.khuyen_nghi_quan_tri, 6, (x) => s(x, 400) || null),
    du_lieu_can_bo_sung: arr(o.du_lieu_can_bo_sung, 6, (x) => s(x, 300) || null),
    han_che: arr(o.han_che, 6, (x) => s(x, 300) || null)
  };
  return out.tom_tat || out.phat_hien.length || out.ke_hoach_dao_tao.length ? out : null;
}
// Chỉ nhận cấu trúc của hranalytics.aiSummary: loại mọi khoá lạ (kể cả khi trình duyệt gửi thêm tên / mã / tuổi), giới hạn kích thước
const num = (v) => (v == null || !isFinite(Number(v)) ? null : Math.round(Number(v) * 100) / 100);
function cleanSummary(x) {
  if (!x || typeof x !== "object") return null;
  const L = (a, max, fn) => (Array.isArray(a) ? a.slice(0, max).map(fn) : []);
  const out = {
    ky: s(x.ky, 120), so_nhan_su_co_diem: num(x.so_nhan_su_co_diem),
    tong_quan: { diem_tb: num(x.tong_quan && x.tong_quan.diem_tb), trung_vi: num(x.tong_quan && x.tong_quan.trung_vi), muc_dat: num(x.tong_quan && x.tong_quan.muc_dat), ty_le_duoi_muc_dat: num(x.tong_quan && x.tong_quan.ty_le_duoi_muc_dat) },
    theo_chuc_danh: L(x.theo_chuc_danh, 12, (t) => ({ chuc_danh: s(t && t.chuc_danh, 40), n: num(t && t.n), diem_tb: num(t && t.diem_tb), ty_le_duoi_muc_dat: num(t && t.ty_le_duoi_muc_dat) })),
    theo_doi_tuong: L(x.theo_doi_tuong, 10, (t) => ({ doi_tuong: s(t && t.doi_tuong, 60), n: num(t && t.n), diem_tb: num(t && t.diem_tb), ty_le_duoi_muc_dat: num(t && t.ty_le_duoi_muc_dat), mang_yeu: L(t && t.mang_yeu, 3, (m) => s(m, 100)) })),
    theo_khu_vuc: L(x.theo_khu_vuc, 8, (t) => ({ khu_vuc: s(t && t.khu_vuc, 40), n: num(t && t.n), diem_tb: num(t && t.diem_tb), ty_le_duoi_muc_dat: num(t && t.ty_le_duoi_muc_dat) })),
    uu_tien_dao_tao: L(x.uu_tien_dao_tao, 12, (p) => ({ chuc_danh: s(p && p.chuc_danh, 40), n: num(p && p.n), mang_yeu: L(p && p.mang_yeu, 3, (m) => ({ mang: s(m && m.mang, 80), diem: num(m && m.diem), chenh_lech_so_voi_chung: num(m && m.chenh_lech_so_voi_chung), so_nguoi: num(m && m.so_nguoi), tin_cay: s(m && m.tin_cay, 10) })) })),
    quan_he: L(x.quan_he, 8, (r) => ({ ten: s(r && r.ten, 120), n: num(r && r.n), muc_mau: s(r && r.muc_mau, 30), rho: num(r && r.rho), y_nghia_thong_ke: r && typeof r.y_nghia_thong_ke === "boolean" ? r.y_nghia_thong_ke : null })),
    theo_tham_nien: L(x.theo_tham_nien, 8, (b) => ({ nhom: s(b && b.nhom, 40), n: num(b && b.n), trung_vi: num(b && b.trung_vi), ty_le_duoi_muc_dat: num(b && b.ty_le_duoi_muc_dat) })),
    nhom_nhan_su: L(x.nhom_nhan_su, 10, (g) => ({ nhom: s(g && g.nhom, 100), tieu_chi: s(g && g.tieu_chi, 140), n: num(g && g.n), ty_trong: num(g && g.ty_trong), mang_yeu: L(g && g.mang_yeu, 3, (m) => s(m, 100)) }))
  };
  // quan hệ có từ khoá nhạy cảm (tuổi) bị bỏ, kể cả khi trình duyệt tự thêm vào
  out.quan_he = out.quan_he.filter((r) => !/tuổi|tuoi|age/i.test(r.ten));
  return out;
}
async function report(summaryIn) {
  const summary = cleanSummary(summaryIn);
  if (!summary || !summary.so_nhan_su_co_diem) return { ok: false, error: "Chưa có số liệu để phân tích." };
  const user = "Dữ liệu tổng hợp ẩn danh (JSON):\n" + JSON.stringify(summary) + "\n\nHãy lập: tóm tắt điều hành, các phát hiện chính (kèm bằng chứng và độ tin cậy), khoảng cách năng lực theo nhóm (kèm phân loại nguyên nhân), kế hoạch đào tạo (đối tượng, nhu cầu, nội dung, phương pháp, thời lượng, hình thức, KPI đánh giá), khuyến nghị quản trị, dữ liệu cần bổ sung và hạn chế.";
  let text; try { text = await llm.chat([{ role: "system", content: SYSTEM_FULL }, { role: "user", content: user }], { temperature: 0.3, max_tokens: 2200, task: "hr-analytics", json: true, timeoutMs: 26000 }); } catch (e) { return { ok: false, error: "AI tạm thời không khả dụng, vui lòng thử lại sau." }; }
  const out = clean(parse(text));
  if (!out) return { ok: false, error: "AI trả về kết quả không đọc được, vui lòng thử lại." };
  return { ok: true, report: out };
}
module.exports = { report, cleanSummary, clean, parse, SYSTEM };
