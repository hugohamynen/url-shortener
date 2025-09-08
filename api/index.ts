import { VercelRequest, VercelResponse } from '@vercel/node';
import { kv } from '@vercel/kv';
import { nanoid } from 'nanoid';

interface LinkData {
  url: string;
  clicks: number;
  createdAt: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { method } = req;
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (method === 'POST' && pathname === '/api/create') {
    return handleCreate(req, res);
  }
  
  if (method === 'GET' && pathname === '/api/stats') {
    return handleStats(req, res);
  }
  
  if (method === 'GET' && pathname !== '/api/create' && pathname !== '/api/stats') {
    return handleRedirect(req, res, pathname);
  }

  res.status(404).json({ error: 'Not found' });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const { url, slug, token } = req.body;

  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  let finalSlug = slug;
  if (!finalSlug) {
    finalSlug = nanoid(8);
  }

  const existing = await kv.get(`link:${finalSlug}`);
  if (existing) {
    return res.status(409).json({ error: 'Slug already exists' });
  }

  const linkData: LinkData = {
    url,
    clicks: 0,
    createdAt: new Date().toISOString()
  };

  await kv.set(`link:${finalSlug}`, linkData);

  res.status(201).json({
    slug: finalSlug,
    url,
    shortUrl: `https://${req.headers.host}/${finalSlug}`
  });
}

async function handleStats(req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');

  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const keys = await kv.keys('link:*');
  const links = [];

  for (const key of keys) {
    const linkData = await kv.get(key) as LinkData;
    const slug = key.replace('link:', '');
    
    links.push({
      slug,
      url: linkData.url,
      clicks: linkData.clicks
    });
  }

  links.sort((a, b) => b.clicks - a.clicks);

  res.status(200).json(links);
}

async function handleRedirect(req: VercelRequest, res: VercelResponse, pathname: string) {
  const slug = pathname.startsWith('/') ? pathname.slice(1) : pathname;
  
  if (!slug) {
    return res.status(404).json({ error: 'Slug not found' });
  }

  const linkData = await kv.get(`link:${slug}`) as LinkData;
  
  if (!linkData) {
    return res.status(404).json({ error: 'Link not found' });
  }

  linkData.clicks += 1;
  await kv.set(`link:${slug}`, linkData);

  res.redirect(302, linkData.url);
}