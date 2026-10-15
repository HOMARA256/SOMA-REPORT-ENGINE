const base = process.env.HEALTH_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
try { const response = await fetch(`${base}/health/ready`, { signal: AbortSignal.timeout(7000) }); if (!response.ok) process.exit(1); console.log(await response.text()); }
catch (error) { console.error(`Health check failed: ${error.message}`); process.exit(1); }
