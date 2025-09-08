interface LinkData {
  url: string;
  clicks: number;
  createdAt: string;
  name?: string;
}

export default async function handler(req: any, res: any) {
  try {
    const { method } = req;
    const pathname = req.url;

    // Serve admin dashboard
    if (method === 'GET' && pathname === '/admin') {
      return serveAdminDashboard(req, res);
    }

    // Admin stats page
    if (method === 'GET' && pathname.startsWith('/api/stats')) {
      return handleStats(req, res);
    }

    // Create short link
    if (method === 'POST' && pathname === '/api/create') {
      return handleCreate(req, res);
    }

    // Reset link clicks
    if (method === 'POST' && pathname === '/api/reset') {
      return handleReset(req, res);
    }

    // Edit link name
    if (method === 'POST' && pathname === '/api/edit') {
      return handleEdit(req, res);
    }

    // Handle redirects (any other GET request)
    if (method === 'GET' && pathname !== '/api/create' && pathname !== '/api/stats' && pathname !== '/admin') {
      return handleRedirect(req, res);
    }

    res.status(404).json({ error: 'Not found' });
  } catch (error) {
    console.error('Handler error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

async function handleCreate(req: any, res: any) {
  const { kv } = await import('@vercel/kv');
  const { url, slug, token, name } = req.body;

  // Temporarily disabled for testing - REMOVE IN PRODUCTION
  // if (token !== process.env.ADMIN_TOKEN) {
  //   return res.status(401).json({ error: 'Unauthorized' });
  // }

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  let finalSlug = slug;
  if (!finalSlug) {
    // Generate random 6-character slug
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    finalSlug = '';
    for (let i = 0; i < 6; i++) {
      finalSlug += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }

  const existing = await kv.get(`link:${finalSlug}`);
  if (existing) {
    return res.status(409).json({ error: 'Slug already exists' });
  }

  const linkData: LinkData = {
    url,
    clicks: 0,
    createdAt: new Date().toISOString(),
    name: name || undefined
  };

  await kv.set(`link:${finalSlug}`, linkData);

  res.status(201).json({
    slug: finalSlug,
    url,
    shortUrl: `https://${req.headers.host}/${finalSlug}`
  });
}

async function handleStats(req: any, res: any) {
  const { kv } = await import('@vercel/kv');
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const token = urlObj.searchParams.get('token');

  // Temporarily disabled for testing - REMOVE IN PRODUCTION
  // if (token !== process.env.ADMIN_TOKEN) {
  //   return res.status(401).json({ error: 'Unauthorized' });
  // }

  const keys = await kv.keys('link:*');
  const links = [];

  for (const key of keys) {
    const linkData = await kv.get(key) as LinkData;
    const slug = key.replace('link:', '');
    
    links.push({
      slug,
      url: linkData.url,
      clicks: linkData.clicks,
      createdAt: linkData.createdAt,
      name: linkData.name,
      shortUrl: `https://${req.headers.host}/${slug}`
    });
  }

  links.sort((a, b) => b.clicks - a.clicks);

  res.status(200).json({
    totalLinks: links.length,
    totalClicks: links.reduce((sum, link) => sum + link.clicks, 0),
    links
  });
}

async function handleRedirect(req: any, res: any) {
  const { kv } = await import('@vercel/kv');
  const pathname = req.url;
  const slug = pathname.startsWith('/') ? pathname.slice(1) : pathname;
  
  if (!slug) {
    return res.status(404).json({ error: 'Slug not found' });
  }

  const linkData = await kv.get(`link:${slug}`) as LinkData;
  
  if (!linkData) {
    return res.status(404).json({ error: 'Link not found' });
  }

  // Increment click count
  linkData.clicks += 1;
  await kv.set(`link:${slug}`, linkData);

  res.redirect(302, linkData.url);
}

async function serveAdminDashboard(req: any, res: any) {
  const fs = await import('fs');
  const path = await import('path');
  
  try {
    const htmlPath = path.join(process.cwd(), 'api', 'admin.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(htmlContent);
  } catch (error) {
    res.status(500).json({ error: 'Could not load admin dashboard' });
  }
}

async function handleReset(req: any, res: any) {
  const { kv } = await import('@vercel/kv');
  const { slug } = req.body;

  if (!slug) {
    return res.status(400).json({ error: 'Slug is required' });
  }

  const linkData = await kv.get(`link:${slug}`) as LinkData;
  
  if (!linkData) {
    return res.status(404).json({ error: 'Link not found' });
  }

  linkData.clicks = 0;
  await kv.set(`link:${slug}`, linkData);

  res.status(200).json({ success: true, message: 'Click count reset' });
}

async function handleEdit(req: any, res: any) {
  const { kv } = await import('@vercel/kv');
  const { slug, name } = req.body;

  if (!slug) {
    return res.status(400).json({ error: 'Slug is required' });
  }

  const linkData = await kv.get(`link:${slug}`) as LinkData;
  
  if (!linkData) {
    return res.status(404).json({ error: 'Link not found' });
  }

  linkData.name = name || undefined;
  await kv.set(`link:${slug}`, linkData);

  res.status(200).json({ success: true, message: 'Link name updated' });
}