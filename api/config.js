// Returns CloudBase env ID from server-side environment variables
export default function handler(req, res) {
  const envId = process.env.TCB_ENV_ID;

  if (!envId) {
    return res.status(500).json({ error: 'TCB_ENV_ID env var not set' });
  }

  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json({ cloudbase: { envId } });
}
