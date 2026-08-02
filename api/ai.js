// Vercel Serverless Function — proxies SiliconFlow API calls
// Keeps SILICONFLOW_API_KEY out of client-side JS

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.SILICONFLOW_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const { endpoint = 'chat/completions', ...body } = req.body;

  try {
    const upstream = await fetch(`https://api.siliconflow.cn/v1/${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
