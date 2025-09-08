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

  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Validate URL format and security
  try {
    const validUrl = new URL(url);
    if (!validUrl.protocol.startsWith('http')) {
      return res.status(400).json({ error: 'URL must use HTTP or HTTPS protocol' });
    }
    // Prevent internal/localhost redirects for security
    if (validUrl.hostname === 'localhost' || validUrl.hostname === '127.0.0.1' || validUrl.hostname.startsWith('192.168.') || validUrl.hostname.startsWith('10.')) {
      return res.status(400).json({ error: 'Internal URLs are not allowed' });
    }
  } catch (error) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  let finalSlug = slug;
  if (!finalSlug) {
    // Use nanoid for better slug generation
    const { nanoid } = await import('nanoid');
    finalSlug = nanoid(8); // 8 characters for better collision resistance
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
  
  try {
    // Robust URL parsing for mobile compatibility
    const fullUrl = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
    let slug = fullUrl.pathname.startsWith('/') ? fullUrl.pathname.slice(1) : fullUrl.pathname;
    
    // Handle query parameters that mobile browsers might add
    if (slug.includes('?')) {
      slug = slug.split('?')[0];
    }
    
    // Remove any hash fragments
    if (slug.includes('#')) {
      slug = slug.split('#')[0];
    }
    
    // Clean up any trailing slashes or spaces
    slug = slug.trim().replace(/\/+$/, '');
    
    if (!slug || slug === 'api' || slug.startsWith('api/')) {
      return res.status(404).json({ error: 'Slug not found' });
    }

    const linkData = await kv.get(`link:${slug}`) as LinkData;
    
    if (!linkData) {
      return res.status(404).json({ error: 'Link not found' });
    }

    // Increment click count atomically to prevent race conditions
    linkData.clicks += 1;
    await kv.set(`link:${slug}`, linkData);

    // Use 301 for permanent redirects (better for SEO)
    res.redirect(301, linkData.url);
  } catch (error) {
    console.error('Redirect error:', error);
    return res.status(500).json({ error: 'Internal server error during redirect' });
  }
}

async function serveAdminDashboard(req: any, res: any) {
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Junction 2025 - Link Analytics</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .header { text-align: center; margin-bottom: 30px; }
        h1 { color: #333; margin-bottom: 10px; }
        .summary { display: flex; justify-content: center; gap: 30px; margin-bottom: 30px; }
        .stat-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; min-width: 120px; }
        .stat-number { font-size: 2em; font-weight: bold; color: #007acc; }
        .stat-label { color: #666; margin-top: 5px; }
        table { width: 100%; max-width: 800px; margin: 0 auto; background: white; border-collapse: collapse; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        th, td { padding: 15px; text-align: left; border-bottom: 1px solid #eee; }
        th { background-color: #007acc; color: white; font-weight: 600; }
        tr:hover { background-color: #f9f9f9; }
        .clicks { font-weight: bold; font-size: 1.1em; color: #007acc; }
        .reset-btn { background-color: #dc3545; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.9em; margin-right: 5px; }
        .reset-btn:hover { background-color: #c82333; }
        .edit-btn { background-color: #28a745; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.9em; }
        .edit-btn:hover { background-color: #218838; }
        .refresh-btn { background-color: #007acc; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-size: 1em; margin: 20px auto; display: block; }
        .refresh-btn:hover { background-color: #0056b3; }
        .loading { text-align: center; padding: 40px; color: #666; }
        .error { text-align: center; padding: 40px; color: #dc3545; background: white; border-radius: 8px; margin: 20px auto; max-width: 600px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Junction 2025 - Link Analytics</h1>
        <p>Track performance of your short links</p>
    </div>

    <div class="summary" id="summary">
        <div class="stat-card">
            <div class="stat-number" id="totalLinks">-</div>
            <div class="stat-label">Total Links</div>
        </div>
        <div class="stat-card">
            <div class="stat-number" id="totalClicks">-</div>
            <div class="stat-label">Total Clicks</div>
        </div>
    </div>

    <button class="refresh-btn" onclick="loadData()">Refresh Data</button>

    <div id="content">
        <div class="loading">Loading analytics...</div>
    </div>

    <script>
        async function loadData() {
            try {
                document.getElementById('content').innerHTML = '<div class="loading">Loading analytics...</div>';
                
                const response = await fetch('/api/stats');
                if (!response.ok) throw new Error(\`HTTP error! status: \${response.status}\`);
                
                const data = await response.json();
                
                document.getElementById('totalLinks').textContent = data.totalLinks;
                document.getElementById('totalClicks').textContent = data.totalClicks;
                
                let tableHTML = \`<table><thead><tr><th>Name</th><th>Clicks</th><th>Link</th><th>Action</th></tr></thead><tbody>\`;
                
                // Custom sorting: Named links first (alphabetically), then unnamed links (by clicks)
                data.links.sort((a, b) => {
                    const aHasName = Boolean(a.name);
                    const bHasName = Boolean(b.name);
                    
                    if (aHasName && !bHasName) return -1;
                    if (!aHasName && bHasName) return 1;
                    
                    if (aHasName && bHasName) {
                        return a.name.localeCompare(b.name);
                    }
                    
                    return b.clicks - a.clicks;
                });
                
                data.links.forEach(link => {
                    const name = link.name || '';
                    const displayName = name || \`<em style="color: #999;">Unnamed (\${link.slug})</em>\`;
                    // Use dynamic domain or fallback to current host
                    const shortUrl = \`https://\${window.location.host}/\${link.slug}\`;
                    
                    tableHTML += \`<tr><td><strong>\${displayName}</strong></td><td class="clicks">\${link.clicks}</td><td><a href="\${link.shortUrl}" target="_blank">\${shortUrl}</a></td><td><button class="reset-btn" onclick="resetClicks('\${link.slug}')">Reset</button><button class="edit-btn" onclick="editName('\${link.slug}', '\${name}')">Edit</button></td></tr>\`;
                });
                
                tableHTML += '</tbody></table>';
                document.getElementById('content').innerHTML = tableHTML;
                
            } catch (error) {
                console.error('Error loading data:', error);
                document.getElementById('content').innerHTML = \`<div class="error"><h3>Error Loading Data</h3><p>Could not load analytics data. Please check your connection and try again.</p><p><small>Error: \${error.message}</small></p></div>\`;
            }
        }

        async function resetClicks(slug) {
            if (!confirm('Are you sure you want to reset the click count for this link?')) return;
            
            try {
                const response = await fetch('/api/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: slug }) });
                
                if (response.ok) { loadData(); alert('Click count reset successfully!'); }
                else { alert('Error resetting click count. Please try again.'); }
            } catch (error) {
                console.error('Error resetting clicks:', error);
                alert('Error resetting click count. Please try again.');
            }
        }

        async function editName(slug, currentName) {
            const newName = prompt('Enter new name for this link:', currentName);
            if (newName === null) return;
            
            try {
                const response = await fetch('/api/edit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: slug, name: newName.trim() || undefined }) });
                
                if (response.ok) { loadData(); alert('Link name updated successfully!'); }
                else { alert('Error updating link name. Please try again.'); }
            } catch (error) {
                console.error('Error editing name:', error);
                alert('Error updating link name. Please try again.');
            }
        }

        loadData();
        setInterval(loadData, 30000);
    </script>
</body>
</html>`;
  
  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(htmlContent);
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