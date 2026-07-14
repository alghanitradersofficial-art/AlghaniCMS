const base = "http://localhost:3001/api";
const loginBody = { email: "admin@alghani.com", password: "admin123" };

async function request(path, opts = {}) {
  const url = `${base}${path}`;
  const res = await fetch(url, opts);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { path, status: res.status, body, headers: Object.fromEntries(res.headers.entries()) };
}

async function main() {
  const loginRes = await request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(loginBody),
  });
  console.log("login", loginRes.status, loginRes.body);
  if (loginRes.status !== 200 || !loginRes.body?.token) {
    process.exit(1);
  }
  const token = loginRes.body.token;
  const headers = { Authorization: `Bearer ${token}`, "content-type": "application/json" };
  const endpoints = [
    { path: "/_routes", opts: { method: "GET", headers } },
    { path: "/_debug/build-wb", opts: { method: "GET", headers } },
    { path: "/export/report/excel", opts: { method: "GET", headers } },
    { path: "/email/preview-report", opts: { method: "POST", headers, body: JSON.stringify({ reportType: "daily-summary" }) } },
    { path: "/email/send-report", opts: { method: "POST", headers, body: JSON.stringify({ reportType: "daily-summary", recipients: ["test@example.com"], attachFull: false }) } },
    { path: "/telegram/status", opts: { method: "GET", headers } },
    { path: "/telegram/test", opts: { method: "POST", headers, body: JSON.stringify({}) } },
  ];
  for (const ep of endpoints) {
    const res = await request(ep.path, ep.opts);
    console.log(res.path, res.status, res.body);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
