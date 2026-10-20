const { reply, requireAjax } = require("../_lib/http");
const { clearCookie } = require("../_lib/session");

const handler = async function (context, req) {
  if (!requireAjax(context, req)) return;
  return reply(context, 200, { ok: true }, { "Set-Cookie": clearCookie() });
};

module.exports = async function (context, req) {
  let email = "";
  try { const u = require("../_lib/session").userFromReq(req); email = (u && u.email) || ""; } catch (e) {}
  await handler(context, req);
  try { if (email && context.res && context.res.status === 200) await require("../_lib/auditlog").auth(req, email, "logout", true); } catch (e) {}
};
