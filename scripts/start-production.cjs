process.env.NODE_ENV = 'production';
process.env.SAFE_ERP_PRODUCTION_START = '1';
require('../server-dist/application/server.js');
