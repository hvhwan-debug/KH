// Trợ lý AI cho ASM: tóm tắt ưu tiên trong ngày, soạn nội dung giao việc, soạn trọng tâm cả nhóm, nhận định từng SR.
// Chỉ ASM/quản trị viên dùng được. Prompt dựng ở máy chủ (khách chỉ gửi số liệu), nên không dùng được như chatbot tự do.
const { reply, guardConfigured, requireAjax, requireUserActive } = require("../_lib/http");
const org = require("../_lib/org");
const { chat } = require("../_lib/llm");

const hits = new Map(); // giới hạn tần suất theo người dùng, theo từng phiên bản chạy (đủ để chặn lạm dụng cơ bản)
function limited(uid) {
  const now = Date.now(), a = (hits.get(uid) || []).filter((t) => now - t < 300000);
  if (a.length >= 20) { hits.set(uid, a); return true; }
  a.push(now); hits.set(uid, a); return false;
}

const SYS = "Bạn là trợ lý của ASM (quản lý bán hàng khu vực) kênh GT, bán qua đại lý, thuộc hai ngành: Ngành 1 là máy lọc nước Karofi và Livotec, Ngành 2 là gia dụng Livotec (bình nước nóng, gia dụng, không gồm máy lọc nước). " +
  "Viết tiếng Việt ngắn gọn, thực tế, giọng đồng hành, không đổ lỗi cho nhân viên. CHỈ dùng số liệu có trong dữ liệu được cung cấp; KHÔNG bịa tên khách hàng, đại lý, giá, khuyến mại, model sản phẩm. Thiếu dữ liệu thì ghi 'cần kiểm tra'. " +
  "Doanh số tính bằng triệu đồng (tr). HTPP là một chỉ số số đếm chưa rõ định nghĩa: chỉ nhắc tên, không suy diễn ý nghĩa. SO là số sản phẩm bán ra tại điểm bán. Không nêu thông tin cá nhân.";

const J = (x) => JSON.stringify(x);

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    const u = await requireUserActive(context, req); if (!u) return;
    if (!requireAjax(context, req)) return;
    const roles = await org.rolesOf(u.email);
    if (!roles.manager) return reply(context, 403, { ok: false, error: "Chỉ ASM hoặc quản trị viên dùng được trợ lý." });
    if (limited(u.uid)) return reply(context, 429, { ok: false, error: "Bạn gọi trợ lý hơi nhiều, thử lại sau vài phút." });
    const b = req.body || {}, data = b.data;
    if (!data || typeof data !== "object" || J(data).length > 16000) return reply(context, 400, { ok: false, error: "Dữ liệu không hợp lệ hoặc quá lớn." });

    let user, opt = { task: b.task, max_tokens: 700 };
    if (b.task === "brief") {
      user = "Dữ liệu ngày " + org.str(data.ngay, 12) + ":\n" + J(data) + "\n\nViết mục 'Ưu tiên hôm nay' cho ASM: tối đa 5 gạch đầu dòng (mỗi dòng bắt đầu bằng '- '), mỗi dòng không quá 28 từ, nêu tên người hoặc nhóm và việc ASM nên làm (gọi điện, giao việc, đi cùng, nhắc báo cáo). Dòng cuối bắt đầu bằng 'Nhận định chung:' không quá 25 từ.";
    } else if (b.task === "analyze") {
      const list = Array.isArray(data.nhan_su) ? data.nhan_su.slice(0, 45) : [];
      if (!list.length) return reply(context, 400, { ok: false, error: "Không có nhân sự nào." });
      opt.ids = list.map((x) => String(x.id)); opt.max_tokens = 1500; opt.temperature = 0.2;
      opt.names = {}; list.forEach((x) => { opt.names[String(x.id)] = String(x.ten || ""); });
      user = "Bạn đang tự động phân tích số liệu để CẢNH BÁO cho ASM. Dữ liệu:\n" + J(data) + "\n\n" +
        "Hãy tìm vấn đề thật sự có căn cứ trong số liệu, kể cả những điều hệ thống quy tắc đơn giản dễ bỏ sót: xu hướng giảm/tăng (trường xu_huong_pct: so 3 ngày gần nhất với các ngày trước đó), doanh số tốt nhưng độ phủ thấp (rủi ro phụ thuộc ít đại lý), SO thấp so với doanh số nhập (hàng có thể tồn ở đại lý, trường so_tren_ty_si), báo cáo đứt quãng, người cần hỗ trợ, dự báo hụt chỉ tiêu, ngày doanh số cao bất thường. Cũng ghi nhận người đang làm tốt để ASM khen. " +
        "Trả về DUY NHẤT một đối tượng JSON, không văn bản khác: {\"canh_bao\":[{\"id\":\"s1 hoặc team\",\"muc\":\"khan|chu_y|thong_tin\",\"tieu_de\":\"tối đa 12 từ\",\"ly_do\":\"tối đa 40 từ, dẫn đúng số liệu\",\"hanh_dong\":\"tối đa 30 từ, việc ASM nên làm\"}],\"uu_tien\":[\"tối đa 4 dòng, mỗi dòng tối đa 25 từ\"],\"nhan_dinh\":\"một câu tối đa 30 từ\"}. " +
        "QUY TẮC BẮT BUỘC: (1) Tối đa 5 cảnh báo, xếp mức khẩn trước; gộp vấn đề giống nhau của nhiều người thành MỘT cảnh báo với id \"team\". (2) Mỗi cảnh báo phải dựa trên số liệu thật ở trên; nếu không có vấn đề thật thì trả canh_bao rỗng. (3) Trạng thái 'chưa tới giờ chốt' và 'nghỉ' là BÌNH THƯỜNG, không phải vấn đề; không cảnh báo chuyện chưa báo cáo khi chưa quá giờ. (4) Nếu cả nhóm chưa có số liệu nào hoặc chưa có kế hoạch tháng thì trả canh_bao rỗng và nhan_dinh nói chưa đủ số liệu. (5) Không tạo cảnh báo chung chung (số ngày làm việc còn lại, nhắc việc thường lệ). (6) TUYỆT ĐỐI không dùng tên trường dữ liệu (như bc_hom_nay, doanh_so_ngay) hay mã s1, s2 trong nội dung; gọi người bằng tên, nói bằng tiếng Việt tự nhiên. id trong JSON phải là một id trong dữ liệu hoặc \"team\".";
    } else if (b.task === "task") {
      const kind = { focus: "trọng tâm công việc", note: "nhắc nhở", praise: "lời khen" }[data.loai] || "trọng tâm công việc";
      user = "ASM muốn giao " + kind + " cho " + org.str(data.ten, 80) + ". Ý ban đầu của ASM: \"" + org.str(data.y, 400) + "\".\nDữ liệu: " + J(data.facts || {}) + "\n\nViết nội dung giao việc 1 đến 3 câu, tối đa 350 ký tự, có hành động cụ thể và dùng con số mục tiêu từ dữ liệu nếu phù hợp. Nếu là lời khen thì khen đúng điều số liệu cho thấy. Chỉ trả về nội dung, không giải thích, không đặt trong ngoặc kép.";
      opt.max_tokens = 300;
    } else if (b.task === "coach") {
      user = "Dữ liệu một nhân viên bán hàng:\n" + J(data) + "\n\nViết đúng 3 gạch đầu dòng (mỗi dòng bắt đầu bằng '- '): điểm tốt, rủi ro chính, hành động ASM nên làm trong 2 ngày tới. Mỗi dòng không quá 25 từ.";
    } else if (b.task === "plan") {
      const list = Array.isArray(data.nhan_su) ? data.nhan_su.slice(0, 60) : [];
      if (!list.length) return reply(context, 400, { ok: false, error: "Không có nhân sự nào." });
      opt.ids = list.map((x) => String(x.id)); opt.max_tokens = 1500;
      user = "Soạn trọng tâm làm việc cho ngày làm việc tiếp theo của từng nhân viên. Dữ liệu:\n" + J(list) + "\n\nTrả về DUY NHẤT một mảng JSON dạng [{\"id\":\"...\",\"text\":\"...\"}] đủ mọi id, mỗi text không quá 260 ký tự, cụ thể, dùng số liệu có sẵn, không đổ lỗi.";
    } else return reply(context, 400, { ok: false, error: "Tác vụ không hợp lệ." });

    let out;
    try { out = await chat([{ role: "system", content: SYS }, { role: "user", content: user }], opt); }
    catch (e) { return reply(context, e.status === 503 ? 503 : 502, { ok: false, error: e.status === 503 ? "Trợ lý AI chưa được cấu hình trên máy chủ." : "Trợ lý đang bận, thử lại sau." }); }

    if (b.task === "analyze") {
      let obj = null; const m = out.match(/\{[\s\S]*\}/);
      try { obj = JSON.parse(m ? m[0] : out); } catch (e) {}
      if (!obj || typeof obj !== "object") return reply(context, 502, { ok: false, error: "Trợ lý trả lời chưa đúng định dạng, hãy thử lại." });
      const okId = new Set(opt.ids.concat(["team"])), lv = { khan: 1, chu_y: 1, thong_tin: 1 };
      const names = opt.names || {};
      const FIELD = { bc_hom_nay: "báo cáo hôm nay", doanh_so_ngay: "doanh số ngày", ke_hoach_ngay: "kế hoạch ngày", luy_ke_thang: "lũy kế tháng", chi_tieu_thang: "chỉ tiêu tháng", dat_moc_pct: "% so với mốc", dat_chi_tieu_pct: "% chỉ tiêu", du_bao_pct: "dự báo cuối tháng", do_phu_pct: "độ phủ", xu_huong_pct: "xu hướng", so_tren_ty_si: "SO trên doanh số", ngay_chua_bc_lien_tiep: "ngày chưa báo cáo liên tiếp", chua_gui_tr: "số chưa gửi", ngay_lam_viec_con_lai: "ngày làm việc còn lại", can_moi_ngay: "cần mỗi ngày", dang_lam_moi_ngay: "đang làm mỗi ngày", so_thang: "SO tháng", htpp_thang: "HTPP tháng" };
      const clean = (t) => String(t || "").replace(/\bs(\d{1,2})\b/g, (m, n) => names["s" + n] || m).replace(/\b[a-z]+(?:_[a-z]+)+\b/g, (m) => FIELD[m] || m);
      const leaked = (t) => /\b[a-z]+_[a-z_]+\b/.test(t);
      const cb = (Array.isArray(obj.canh_bao) ? obj.canh_bao : []).filter((x) => x && okId.has(String(x.id)) && typeof x.tieu_de === "string")
        .map((x) => ({ id: String(x.id), muc: lv[x.muc] ? x.muc : "chu_y", tieu_de: org.str(clean(x.tieu_de), 120), ly_do: org.str(clean(x.ly_do), 360), hanh_dong: org.str(clean(x.hanh_dong), 260) }))
        .filter((x) => !leaked(x.tieu_de + " " + x.ly_do + " " + x.hanh_dong))
        .sort((a, b) => ["khan", "chu_y", "thong_tin"].indexOf(a.muc) - ["khan", "chu_y", "thong_tin"].indexOf(b.muc)).slice(0, 5);
      const up = (Array.isArray(obj.uu_tien) ? obj.uu_tien : []).filter((x) => typeof x === "string").map((x) => org.str(clean(x), 220)).filter((x) => !leaked(x)).slice(0, 4);
      return reply(context, 200, { ok: true, result: { canh_bao: cb, uu_tien: up, nhan_dinh: leaked(clean(obj.nhan_dinh)) ? "" : org.str(clean(obj.nhan_dinh), 260) } });
    }
    if (b.task === "plan") {
      let arr = null; const m = out.match(/\[[\s\S]*\]/);
      try { arr = JSON.parse(m ? m[0] : out); } catch (e) {}
      const ok = new Set(opt.ids), items = (Array.isArray(arr) ? arr : []).filter((x) => x && ok.has(String(x.id)) && typeof x.text === "string").map((x) => ({ id: String(x.id), text: org.str(x.text, 400) }));
      if (!items.length) return reply(context, 502, { ok: false, error: "Trợ lý trả lời chưa đúng định dạng, hãy thử lại." });
      return reply(context, 200, { ok: true, items });
    }
    return reply(context, 200, { ok: true, text: org.str(out.replace(/^["“]|["”]$/g, ""), 1500) });
  } catch (e) {
    context.log.error("asm-ai", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra. Thử lại sau." });
  }
};
