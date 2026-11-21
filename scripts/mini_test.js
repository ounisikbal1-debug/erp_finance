const http = require('http');

function get(path, token) {
  return new Promise((resolve) => {
    http.get({
      hostname: '127.0.0.1',
      port: 3001,
      path,
      headers: { Authorization: `Bearer ${token}` }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, raw: data }); }
      });
    }).on('error', (err) => resolve({ error: err.message }));
  });
}
