// HỒ SƠ ĐỐI TƯỢNG ĐÀO TẠO KINH DOANH KAROFI – LIVOTEC (kênh GT): ngữ cảnh dùng chung cho mọi phân tích / lời nhắc AI về nhân lực.
//  - audienceOf(c): xếp nhân sự vào đối tượng đào tạo (SR GT1, SR GT2, PC, PG, ASM, RSM, Khác) từ chức danh + ngành hàng trong hồ sơ.
//    Không đoán: chức danh SR mà chưa rõ ngành thì ghi "SR (chưa rõ ngành)".
//  - NEEDS: nhu cầu đào tạo theo đối tượng (dùng cho đề xuất theo luật).
//  - CONTEXT: đoạn ngữ cảnh đưa vào lời nhắc hệ thống của AI.
const fold = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/\s+/g, " ").trim();

const AUD = {
  GT1: "SR GT1 · Ngành 1 máy lọc nước",
  GT2: "SR GT2 · Ngành 2 điện gia dụng",
  SR: "SR (chưa rõ ngành)",
  PC: "PC · Tư vấn tại điểm bán",
  PG: "PG · Giới thiệu sản phẩm",
  ASM: "ASM · Quản lý khu vực",
  RSM: "RSM · Quản lý vùng",
  OTHER: "Chức danh khác"
};

function audienceKey(title, segment) {
  const t = fold(title), seg = String(segment || "");
  if (/\brsm\b|quan ly vung|giam doc vung/.test(t)) return "RSM";
  if (/\basm\b|quan ly khu vuc|giam sat/.test(t)) return "ASM";
  if (/\bpg\b|\bpb\b|promotion/.test(t)) return "PG";
  if (/\bpc\b|product consultant|tu van/.test(t)) return "PC";
  if (/gt ?1|sr ?1|nganh ?1/.test(t)) return "GT1";
  if (/gt ?2|sr ?2|nganh ?2/.test(t)) return "GT2";
  if (/\bsr\b|sales|kinh doanh|nhan vien ban hang/.test(t)) return seg === "may_loc" ? "GT1" : seg === "gia_dung" ? "GT2" : "SR";
  return t ? "OTHER" : "PC"; // hồ sơ cũ chưa có chức danh: hệ thống mặc định là PC
}
const audienceOf = (c) => AUD[audienceKey(c && c.title, c && c.segment)];

// Nhu cầu đào tạo theo đối tượng (từ hồ sơ đối tượng đào tạo); dùng để gợi ý hướng đào tạo, không thay cho đánh giá của quản lí
const NEEDS = {
  GT1: ["kiến thức công nghệ lọc nước và thông số máy lọc Karofi, Livotec", "tư vấn, thuyết phục đại lý", "phát triển điểm bán", "xử lý từ chối và cạnh tranh"],
  GT2: ["kiến thức kỹ thuật, tính năng điều hòa, bếp từ, bình nước nóng Livotec", "tư vấn lợi ích sản phẩm và thuyết phục đại lý", "phát triển điểm bán", "xử lý từ chối và cạnh tranh"],
  SR: ["kiến thức sản phẩm theo ngành hàng được phân công", "tư vấn, thuyết phục đại lý", "phát triển điểm bán"],
  PC: ["kiến thức sản phẩm", "khai thác nhu cầu khách hàng", "tư vấn và xử lý phản đối", "chuyển đổi khách hàng"],
  PG: ["kiến thức sản phẩm cơ bản", "giới thiệu sản phẩm", "giao tiếp, tạo trải nghiệm cho khách"],
  ASM: ["quản trị doanh số", "coaching và phát triển SR", "phân tích thị trường, lập kế hoạch", "quản trị hiệu suất"],
  RSM: ["hoạch định chiến lược vùng", "quản trị hệ thống phân phối", "phát triển đội ngũ quản lý", "phân tích dữ liệu và dự báo"],
  OTHER: ["kiến thức sản phẩm theo phạm vi công việc"]
};
const needsOf = (c) => NEEDS[audienceKey(c && c.title, c && c.segment)];

const CONTEXT = [
  "Bối cảnh: hệ thống kinh doanh kênh GT của Karofi và Livotec. Các đối tượng đào tạo:",
  "SR GT1 (Sales ngành 1): máy lọc nước Karofi và Livotec; phát triển thị trường và đại lý, chăm sóc đại lý, tư vấn sản phẩm và chính sách; cần công nghệ lọc nước, thông số, lợi ích sản phẩm, thuyết phục đại lý, phát triển điểm bán, xử lý từ chối và cạnh tranh.",
  "SR GT2 (Sales ngành 2): điện gia dụng Livotec (điều hòa, bếp từ, bình nước nóng và sản phẩm khác được công ty xác nhận); cần kiến thức kỹ thuật, tính năng, tư vấn lợi ích, thuyết phục đại lý, phát triển điểm bán, xử lý từ chối và cạnh tranh.",
  "PC: tư vấn tại điểm bán (khai thác nhu cầu, tư vấn, xử lý phản đối, chuyển đổi khách hàng). PG: giới thiệu, quảng bá, hỗ trợ trải nghiệm. ASM: quản lý khu vực (doanh số, đội SR, coaching, hiệu suất). RSM: quản lý vùng (chiến lược, phân phối, phát triển quản lý, dự báo).",
  "PC, PG, ASM, RSM có thể theo ngành hàng hoặc phạm vi được phân công; không mặc định mọi vị trí cùng phạm vi sản phẩm.",
  "Khi nhận định: phân biệt kiến thức chung, kiến thức đặc thù ngành hàng và kiến thức theo chức danh; đề xuất đào tạo phải đúng ngành hàng và đúng chức danh (không đề xuất nội dung máy lọc nước chuyên sâu cho ngành 2 hay điện gia dụng chuyên sâu cho ngành 1 nếu không có mục tiêu liên ngành).",
  "Không tự tạo thông số kỹ thuật, chính sách hay đặc điểm nhân sự khi không có trong dữ liệu."
].join(" ");

module.exports = { audienceKey, audienceOf, needsOf, AUD, NEEDS, CONTEXT, fold };
