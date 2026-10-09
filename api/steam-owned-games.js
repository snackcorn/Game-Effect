// ==========================================
// 🎮 Vercel 서버리스 함수: Steam 보유 게임 조회
// GET /api/steam-owned-games?steamid=7656xxxxxxxxxxxxx
// Steam API Key는 환경변수 STEAM_API_KEY에서만 읽고 응답에 포함하지 않습니다.
// ==========================================

const STEAM_OWNED_GAMES_URL = 'https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/';
const STEAM_ID_PATTERN = /^\d{17}$/;

function sendJson(res, statusCode, body, cacheControl = 'no-store') {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', cacheControl);
    res.end(JSON.stringify(body));
}

function applyCorsHeaders(res) {
    const allowedOrigin = process.env.ALLOWED_ORIGIN;
    if (!allowedOrigin) return false;
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');
    return true;
}

function getSteamIdParam(req) {
    let value = req.query?.steamid;
    if (value === undefined) {
        value = new URL(req.url || '/', 'http://localhost').searchParams.get('steamid');
    }
    if (Array.isArray(value)) value = value[0];
    return String(value ?? '').trim();
}

function describeSteamError(status) {
    if (status === 401 || status === 403) return 'Steam API Key가 올바르지 않거나 권한이 없습니다. 서버의 STEAM_API_KEY를 확인해 주세요.';
    if (status === 429) return 'Steam API 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
    if (status >= 500) return 'Steam 서버에 일시적인 문제가 있습니다. 잠시 후 다시 시도해 주세요.';
    return 'Steam에서 게임 목록을 가져오지 못했습니다.';
}

module.exports = async function handler(req, res) {
    const corsEnabled = applyCorsHeaders(res);

    if (req.method === 'OPTIONS' && corsEnabled) {
        res.statusCode = 204;
        res.end();
        return;
    }
    if (req.method !== 'GET') {
        res.setHeader('Allow', corsEnabled ? 'GET, OPTIONS' : 'GET');
        sendJson(res, 405, { error: 'GET 요청만 지원합니다.' });
        return;
    }

    const steamId = getSteamIdParam(req);
    if (!STEAM_ID_PATTERN.test(steamId)) {
        sendJson(res, 400, { error: 'steamid는 17자리 숫자(SteamID64)여야 합니다.' });
        return;
    }

    const apiKey = process.env.STEAM_API_KEY;
    if (!apiKey) {
        sendJson(res, 500, { error: '서버에 STEAM_API_KEY 환경변수가 설정되지 않았습니다. Vercel 프로젝트 설정에서 추가해 주세요.' });
        return;
    }

    const steamUrl = `${STEAM_OWNED_GAMES_URL}?key=${encodeURIComponent(apiKey)}&steamid=${steamId}&include_appinfo=1&format=json`;

    let steamResponse;
    try {
        steamResponse = await fetch(steamUrl);
    } catch (error) {
        sendJson(res, 502, { error: 'Steam 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
        return;
    }

    if (steamResponse.status !== 200) {
        sendJson(res, 502, { error: describeSteamError(steamResponse.status), steamStatus: steamResponse.status });
        return;
    }

    let data;
    try {
        data = await steamResponse.json();
    } catch (error) {
        sendJson(res, 502, { error: 'Steam 응답을 해석하지 못했습니다.', steamStatus: steamResponse.status });
        return;
    }

    sendJson(res, 200, data, 'public, max-age=0, s-maxage=60');
};
