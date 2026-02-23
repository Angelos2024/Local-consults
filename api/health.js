export default function handler(req, res) {
  const ok = Boolean(process.env.OPENAI_API_KEY);
  res.statusCode = ok ? 200 : 500;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok }));
}
