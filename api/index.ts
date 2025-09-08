export default async function handler(req: any, res: any) {
  try {
    // Basic test - no imports, no complex logic
    return res.status(200).json({ 
      message: 'Basic function is working!',
      method: req.method,
      url: req.url,
      timestamp: new Date().toISOString(),
      env: {
        hasAdminToken: !!process.env.ADMIN_TOKEN,
        hasKvUrl: !!process.env.KV_REST_API_URL,
        hasKvToken: !!process.env.KV_REST_API_TOKEN,
        nodeVersion: process.version
      }
    });
  } catch (error) {
    console.error('Handler error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}