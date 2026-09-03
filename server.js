import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Security & Caching Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Serve static assets from project root
app.use(express.static(__dirname, {
  maxAge: '1h',
  etag: true
}));

// Cached GitHub API proxy
let githubCache = {
  data: null,
  timestamp: 0,
  username: ''
};
const GITHUB_CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

app.get('/api/github', async (req, res) => {
  const username = (req.query.username || 'evsanjeevan').toString().trim();
  const now = Date.now();

  if (githubCache.data && (now - githubCache.timestamp < GITHUB_CACHE_TTL) && githubCache.username.toLowerCase() === username.toLowerCase()) {
    return res.json({ ...githubCache.data, cached: true, cacheAgeMs: now - githubCache.timestamp });
  }

  try {
    const headers = {
      'User-Agent': 'EV-Sanjeevan-Portfolio-App/1.0',
      'Accept': 'application/vnd.github.v3+json'
    };
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
    }

    const [userRes, reposRes, eventsRes] = await Promise.all([
      fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, { headers }),
      fetch(`https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=30`, { headers }),
      fetch(`https://api.github.com/users/${encodeURIComponent(username)}/events/public?per_page=30`, { headers })
    ]);

    if (!userRes.ok && userRes.status === 404) {
      return res.status(404).json({ error: `GitHub user '${username}' not found` });
    }

    const userData = userRes.ok ? await userRes.json() : null;
    const reposData = reposRes.ok ? await reposRes.json() : [];
    const eventsData = eventsRes.ok ? await eventsRes.json() : [];

    const result = {
      user: userData,
      repos: Array.isArray(reposData) ? reposData : [],
      events: Array.isArray(eventsData) ? eventsData : [],
      fetchedAt: new Date().toISOString()
    };

    if (userData) {
      githubCache = {
        data: result,
        timestamp: now,
        username
      };
    }

    res.json({ ...result, cached: false });
  } catch (err) {
    console.error('Error fetching GitHub API:', err);
    if (githubCache.data) {
      return res.json({ ...githubCache.data, cached: true, stale: true, error: err.message });
    }
    res.status(500).json({ error: 'Failed to fetch GitHub API data', details: err.message });
  }
});

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});

