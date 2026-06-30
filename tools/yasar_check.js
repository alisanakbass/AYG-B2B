const https = require('https');
const querystring = require('querystring');

function tryLogin(kullaniciAdi, kullaniciKodu) {
  return new Promise((resolve) => {
    const postData = querystring.stringify({
      'KullaniciAdi': kullaniciAdi,
      'KullaniciAdiForm': kullaniciAdi,
      'KullaniciKodu': kullaniciKodu,
      'Sifre': 'AYGUNLER'
    });

    const options = {
      hostname: 'bayi.yasarteknik.com.tr',
      port: 443,
      path: '/ajax/Login.asp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'X-Requested-With': 'XMLHttpRequest'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          kullaniciAdi,
          kullaniciKodu,
          statusCode: res.statusCode,
          response: data.trim(),
          cookies: res.headers['set-cookie']
        });
      });
    });

    req.on('error', (e) => {
      resolve({ kullaniciAdi, kullaniciKodu, error: e.message });
    });

    req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log("TEST 1: KullaniciAdi = 'AYGUNLER', KullaniciKodu = '1'");
  const res1 = await tryLogin('AYGUNLER', '1');
  console.log("Result:", JSON.stringify(res1, null, 2));

  console.log("\nTEST 2: KullaniciAdi = '1', KullaniciKodu = '1'");
  const res2 = await tryLogin('1', '1');
  console.log("Result:", JSON.stringify(res2, null, 2));
}

runTests();







