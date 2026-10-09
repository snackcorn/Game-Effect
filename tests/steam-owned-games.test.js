// 실행: node --test tests/steam-owned-games.test.js
// 실제 Steam 호출 없이 global fetch를 모킹해 서버리스 함수의 입력 검증과 오류 처리를 확인합니다.
const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/steam-owned-games.js');

const VALID_STEAM_ID = '76561190000000000';
const FAKE_KEY = 'test-key-not-real';

function createRes() {
    return {
        statusCode: 200,
        headers: {},
        body: '',
        setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
        end(body = '') { this.body = body; },
        json() { return JSON.parse(this.body); }
    };
}

async function call({ method = 'GET', query, url } = {}) {
    const res = createRes();
    await handler({ method, query, url }, res);
    return res;
}

const originalFetch = global.fetch;
let fetchCalls = [];

function mockFetch(impl) {
    fetchCalls = [];
    global.fetch = async (url) => { fetchCalls.push(url); return impl(url); };
}

test.beforeEach(() => {
    delete process.env.STEAM_API_KEY;
    delete process.env.ALLOWED_ORIGIN;
    mockFetch(() => { throw new Error('fetch should not be called'); });
});
test.after(() => { global.fetch = originalFetch; });

test('잘못된 steamid는 400', async () => {
    process.env.STEAM_API_KEY = FAKE_KEY;
    for (const steamid of [undefined, '', '123', '7656119000000000a', '765611900000000001', ' 76561190000000000x']) {
        const res = await call({ query: steamid === undefined ? {} : { steamid } });
        assert.equal(res.statusCode, 400, `steamid=${steamid}`);
        assert.match(res.json().error, /17자리/);
    }
    assert.equal(fetchCalls.length, 0);
});

test('req.query가 없으면 URL에서 steamid를 읽는다', async () => {
    const res = await call({ url: '/api/steam-owned-games?steamid=abc' });
    assert.equal(res.statusCode, 400);
});

test('STEAM_API_KEY가 없으면 500', async () => {
    const res = await call({ query: { steamid: VALID_STEAM_ID } });
    assert.equal(res.statusCode, 500);
    assert.match(res.json().error, /STEAM_API_KEY/);
    assert.equal(fetchCalls.length, 0);
});

test('성공 시 Steam JSON을 그대로 반환하고 키는 응답에 없다', async () => {
    process.env.STEAM_API_KEY = FAKE_KEY;
    const steamBody = { response: { game_count: 1, games: [{ appid: 10, name: 'Counter-Strike', playtime_forever: 120 }] } };
    mockFetch(() => new Response(JSON.stringify(steamBody), { status: 200 }));

    const res = await call({ query: { steamid: VALID_STEAM_ID } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), steamBody);
    assert.match(res.headers['cache-control'], /s-maxage=60/);
    assert.equal(res.headers['access-control-allow-origin'], undefined);
    assert.ok(!res.body.includes(FAKE_KEY));

    const requested = new URL(fetchCalls[0]);
    assert.equal(requested.origin + requested.pathname, 'https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/');
    assert.equal(requested.searchParams.get('key'), FAKE_KEY);
    assert.equal(requested.searchParams.get('steamid'), VALID_STEAM_ID);
    assert.equal(requested.searchParams.get('include_appinfo'), '1');
    assert.equal(requested.searchParams.get('format'), 'json');
});

test('Steam 403/429/500 응답은 502와 steamStatus, 의미 있는 메시지', async () => {
    process.env.STEAM_API_KEY = FAKE_KEY;
    const cases = [[403, /API Key/], [429, /너무 많/], [500, /일시적/], [404, /가져오지 못했/]];
    for (const [status, pattern] of cases) {
        mockFetch(() => new Response('<html>error</html>', { status }));
        const res = await call({ query: { steamid: VALID_STEAM_ID } });
        assert.equal(res.statusCode, 502, `steam ${status}`);
        const body = res.json();
        assert.equal(body.steamStatus, status);
        assert.match(body.error, pattern);
        assert.equal(res.headers['cache-control'], 'no-store');
        assert.ok(!res.body.includes(FAKE_KEY));
    }
});

test('Steam 연결 실패와 잘못된 JSON은 502', async () => {
    process.env.STEAM_API_KEY = FAKE_KEY;
    mockFetch(() => { throw new TypeError('network down'); });
    let res = await call({ query: { steamid: VALID_STEAM_ID } });
    assert.equal(res.statusCode, 502);
    assert.match(res.json().error, /연결하지 못했/);

    mockFetch(() => new Response('not json', { status: 200 }));
    res = await call({ query: { steamid: VALID_STEAM_ID } });
    assert.equal(res.statusCode, 502);
    assert.match(res.json().error, /해석/);
});

test('ALLOWED_ORIGIN이 있으면 CORS 헤더와 OPTIONS 처리', async () => {
    process.env.ALLOWED_ORIGIN = 'https://example.com';
    let res = await call({ method: 'OPTIONS' });
    assert.equal(res.statusCode, 204);
    assert.equal(res.headers['access-control-allow-origin'], 'https://example.com');
    assert.match(res.headers['access-control-allow-methods'], /GET/);

    res = await call({ query: { steamid: 'bad' } });
    assert.equal(res.statusCode, 400);
    assert.equal(res.headers['access-control-allow-origin'], 'https://example.com');
});

test('ALLOWED_ORIGIN이 없으면 CORS 헤더 없음, GET 이외는 405', async () => {
    let res = await call({ method: 'OPTIONS' });
    assert.equal(res.statusCode, 405);
    assert.equal(res.headers['access-control-allow-origin'], undefined);

    res = await call({ method: 'POST', query: { steamid: VALID_STEAM_ID } });
    assert.equal(res.statusCode, 405);
});
