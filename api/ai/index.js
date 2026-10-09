module.exports = async function (context, req) {
  const body = req.body || {};
  if (!Array.isArray(body.messages) || !body.messages.length) {
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: { error: "Thiếu messages trong yêu cầu." }
    };
    return;
  }

  // Chặn lạm dụng: giới hạn số tin nhắn và tổng độ dài (áp dụng chung cho cả 2 nguồn)
  const totalChars = body.messages.reduce((a, m) => a + String((m && m.content) || "").length, 0);
  if (body.messages.length > 12 || totalChars > 24000) {
    context.res = {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: { error: "Yêu cầu quá dài." }
    };
    return;
  }

  const temperature = typeof body.temperature === "number" ? body.temperature : 0.4;
  const max_tokens = typeof body.max_tokens === "number" ? Math.min(body.max_tokens, 2000) : 1200;

  const azureEndpoint = (process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/+$/, "");
  const azureKey = process.env.AZURE_OPENAI_KEY;
  const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT;

  // ---- 1) Thử Azure OpenAI trước (nguồn chính) ----
  if (azureEndpoint && azureKey && azureDeployment) {
    try {
      const url = azureEndpoint + "/chat/completions";
      const upstream = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": azureKey,
          "Authorization": "Bearer " + azureKey
        },
        body: JSON.stringify({
          model: azureDeployment,
          messages: body.messages,
          temperature,
          max_tokens
        })
      });
      if (upstream.ok) {
        const data = await upstream.json();
        context.res = {
          status: 200,
          headers: { "Content-Type": "application/json", "X-AI-Source": "azure" },
          body: data
        };
        return;
      }
      context.log("Azure OpenAI trả lỗi HTTP " + upstream.status + ", chuyển sang Groq dự phòng.");
    } catch (e) {
      context.log("Azure OpenAI lỗi kết nối: " + (e && e.message) + ", chuyển sang Groq dự phòng.");
    }
  }

  // ---- 2) Dự phòng: Groq ----
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Azure OpenAI không phản hồi và chưa cấu hình Groq dự phòng (GROQ_API_KEY)." }
    };
    return;
  }
  const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  try {
    const upstream2 = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + groqKey
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: body.messages,
        temperature,
        max_tokens,
        reasoning_effort: "low"
      })
    });
    const data2 = await upstream2.json();
    context.res = {
      status: upstream2.status,
      headers: { "Content-Type": "application/json", "X-AI-Source": "groq" },
      body: data2
    };
  } catch (e2) {
    context.res = {
      status: 502,
      headers: { "Content-Type": "application/json" },
      body: { error: "Không gọi được AI (cả Azure và Groq đều lỗi): " + (e2 && e2.message ? e2.message : String(e2)) }
    };
  }
};
