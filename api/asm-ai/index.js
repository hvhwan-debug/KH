// Trợ lý AI cho ASM: tóm tắt ưu tiên trong ngày, soạn nội dung giao việc, soạn trọng tâm cả nhóm, nhận định từng SR.
// Chỉ ASM/quản trị viên dùng được. Prompt dựng ở máy chủ (khách chỉ gửi số liệu), nên không dùng được như chatbot tự do.
const { reply, guardConfigured, requireAjax, requireUser } = require("../_lib/http");
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
    const u = requireUser(context, req); if (!u) return;
    if (!requireAjax(context, req)) return;
    const roles = await org.rolesOf(u.email);
    if (!roles.manager) return reply(context, 403, { ok: false, error: "Chỉ ASM hoặc quản trị viên dùng được trợ lý." });
    if (limited(u.uid)) return reply(context, 429, { ok: false, error: "Bạn gọi trợ lý hơi nhiều, thử lại sau vài phút." });
    const b = req.body || {}, data = b.data;
    if (!data || typeof data !== "object" || J(data).length > 16000) return reply(context, 400, { ok: false, error: "Dữ liệu không hợp lệ hoặc quá lớn." });

    let user, opt = { task: b.task, max_tokens: 700 };
    if (b.task === "brief") {
      user = "Dữ liệu ngày " + org.str(data.ngay, 12) + ":\n" + J(data) + "\n\nViết mục 'Ưu tiên hôm nay' cho ASM: tối đa 5 gạch đầu dòng (mỗi dòng bắt đầu bằng '- '), mỗi dòng không quá 28 từ, nêu tên người hoặc nhóm và việc ASM nên làm (gọi điện, giao việc, đi cùng, nhắc báo cáo). Dòng cuối bắt đầu bằng 'Nhận định chung:' không quá 25 từ.";
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
