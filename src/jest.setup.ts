// Set required env vars before any module imports resolve config.
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'test-jwt-secret-for-unit-tests';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-for-unit-tests';
process.env.JWT_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.NODE_ENV = 'test';
