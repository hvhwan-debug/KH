const { reply, requireAjax } = require("../_lib/http");
const { clearCookie } = require("../_lib/session");

module.exports = async function (context, req) {
  if (!requireAjax(context, req)) return;
  return reply(context, 200, { ok: true }, { "Set-Cookie": clearCookie() });
};
