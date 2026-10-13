// Proxy goi Groq truc tiep. Khong bao gio tra ve cho trinh duyet: ten mo hinh, nha cung cap, hay noi dung
// loi goc tu nha cung cap - chi tra ve phan noi dung tra loi (choices) va thong bao loi an toan.
module.exports = async function (context, req) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    context.res = { status: 500, headers: { "Content-Type": "application/json" }, body: { error: "Trợ lý AI chưa được cấu hình trên server." } };
    return;
  }

  const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  const body = req.body || {};
  if (!Array.isArray(body.messages) || !body.messages.length) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Thiếu messages trong yêu cầu." } };
    return;
  }

  const totalChars = body.messages.reduce((a, m) => a + String((m && m.content) || "").length, 0);
  if (body.messages.length > 12 || totalChars > 24000) {
    context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "Yêu cầu quá dài." } };
    return;
  }

  const sanitize = (data) => ({ choices: Array.isArray(data && data.choices) ? data.choices.map((c) => ({ message: { role: "assistant", content: c && c.message && c.message.content } })) : [] });

  try {
    const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
      body: JSON.stringify({
        model: MODEL,
        messages: body.messages,
        temperature: typeof body.temperature === "number" ? body.temperature : 0.4,
        max_tokens: typeof body.max_tokens === "number" ? Math.min(body.max_tokens, 2000) : 1200,
        reasoning_effort: "low"
      })
    });

    if (!upstream.ok) {
      context.log("Groq trả lỗi HTTP " + upstream.status);
      context.res = {
        status: upstream.status,
        headers: { "Content-Type": "application/json" },
        body: { error: upstream.status === 429 ? "Đang có nhiều người hỏi cùng lúc, thử lại sau ít phút." : "Trợ lý đang bận, thử lại sau." }
      };
      return;
    }
    const data = await upstream.json();
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: sanitize(data) };
  } catch (e) {
    context.log("Groq lỗi kết nối: " + (e && e.message));
    context.res = { status: 502, headers: { "Content-Type": "application/json" }, body: { error: "Trợ lý đang bận, thử lại sau." } };
  }
};
