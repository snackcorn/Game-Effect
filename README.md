# 🎮 Game Effect

내가 한 게임과 플레이 시간을 기록하는 간단한 게임 기록장입니다.

## 할 수 있는 일

- 게임 기록하기
- 기록 찾기
- 달력, 모든 기록, 연도별 요약 보기
- 최근 7일에 시작한 게임 중 플레이 시간이 많은 게임 10개 보기
- Steam 플레이 시간 가져오기
- 구글 시트에서 모든 연도 기록 가져오기
- CSV 또는 시작일 연도별 탭 Excel 파일(.xlsx) 저장하기
- 잘못되거나 똑같이 겹친 기록 정리하기

## 처음 사용하기

### 1. 바로 기록하기

웹페이지의 **게임 기록하기**에서 게임 이름, 플레이 시간, 시작한 날을 입력하고 **기록하기**를 누릅니다.

시작한 날을 비워 두면 오늘 날짜로 기록합니다.

### 2. 구글 시트에서 기록 가져오기

1. **구글 시트 연결하기**를 엽니다.
2. `기록 가져오기` 칸에 구글 스프레드시트 주소를 넣습니다.
3. **기록 가져오기**를 누릅니다.

기록은 시작한 날의 연도별 탭(예: `2026`)에 자동으로 저장됩니다. 불러올 때는 모든 연도 탭을 함께 읽습니다.

시트의 첫 번째 줄에는 아래 항목이 필요합니다.

| 이름 | 시작일 |
| --- | --- |

더 많은 내용을 함께 저장하려면 아래처럼 첫 줄을 만드세요.

| 이름 | 시작일 | 종료일 | 플랫폼 | 시간 | 엔딩여부 | 메모 | 한줄평 | Steam AppID | Steam 누적시간 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

## 새 기록을 구글 시트에 저장하기

게임을 기록할 때마다 구글 시트에도 자동으로 추가하고 싶다면 아래 설정을 한 번만 하면 됩니다.

시트를 직접 만들기 어렵다면 웹페이지의 **CSV로 저장** 또는 **Excel로 저장**을 누르세요. CSV는 가볍고 한 장짜리라 다른 서비스로 옮길 때 편합니다. Excel 파일은 시작일 연도에 따라 탭이 나뉘어 Excel에서 계속 정리할 때 편합니다.

### 연결 코드 넣기

1. 구글 스프레드시트에서 **확장 프로그램 → Apps Script**를 엽니다.
2. 화면에 있는 코드를 모두 지우고 아래 코드를 붙여 넣습니다.
3. 저장 버튼을 누릅니다.

```javascript
const HEADERS = ['이름', '시작일', '종료일', '플랫폼', '시간', '엔딩여부', '메모', '한줄평', 'Steam AppID', 'Steam 누적시간'];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = getYearSheet(getYear(data.startDate));

    sheet.appendRow([
      data.title || '',
      data.startDate || '',
      data.endDate || '',
      data.platform || '',
      Number(data.time || 0),
      data.isEnding || 'x',
      data.memo || '',
      data.review || '',
      data.steamAppId || '',
      data.steamTotal ?? ''
    ]);

    return json({ result: 'success' });
  } catch (error) {
    return json({ result: 'error', message: String(error) });
  }
}

function getYear(dateText) {
  const match = String(dateText || '').match(/^(\d{4})/);
  return match ? match[1] : String(new Date().getFullYear());
}

function getYearSheet(year) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const name = String(year);
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  return sheet;
}

function doGet(e) {
  const p = e.parameter || {};
  if (p.action === 'gameRecords') return jsonp({ result: 'success', records: getAllRecords() }, p.callback);
  if (p.action !== 'steamOwnedGames') return jsonp({ error: '잘못된 요청입니다.' }, p.callback);

  try {
    const url = 'https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/' +
      '?key=' + encodeURIComponent(p.key) +
      '&steamid=' + encodeURIComponent(p.steamid) +
      '&include_appinfo=1&format=json';
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) throw new Error('Steam에서 정보를 가져오지 못했습니다.');
    return jsonp(JSON.parse(response.getContentText()), p.callback);
  } catch (error) {
    return jsonp({ error: String(error) }, p.callback);
  }
}

function getAllRecords() {
  const records = [];
  SpreadsheetApp.getActiveSpreadsheet().getSheets().forEach(sheet => {
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return;
    const headers = values[0].map(String);
    const value = (row, name) => {
      const index = headers.indexOf(name);
      const item = index > -1 ? row[index] : '';
      return item instanceof Date ? Utilities.formatDate(item, Session.getScriptTimeZone(), 'yyyy-MM-dd') : item;
    };
    values.slice(1).forEach(row => records.push({
      title: value(row, '이름'), startDate: value(row, '시작일'), endDate: value(row, '종료일'),
      platform: value(row, '플랫폼'), time: value(row, '시간'), isEnding: value(row, '엔딩여부'),
      memo: value(row, '메모'), review: value(row, '한줄평'), steamAppId: value(row, 'Steam AppID'), steamTotal: value(row, 'Steam 누적시간')
    }));
  });
  return records;
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonp(data, callback) {
  const text = JSON.stringify(data);
  if (callback && /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + text + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return json(data);
}
```

### 저장 주소 만들기

1. Apps Script 오른쪽 위에서 **배포 → 새 배포**를 누릅니다.
2. 유형은 **웹 앱**을 선택합니다.
3. 실행 계정은 **나**, 사용할 수 있는 사람은 **모든 사용자**로 선택합니다.
4. 배포 후 나오는 `/exec` 주소를 복사합니다.
5. Game Effect의 **기록 저장하기** 칸에 붙여 넣고 **저장 주소 입력**을 누릅니다.

## 기록 도구

- **처음 설정하기**: 시트 첫 줄에 무엇을 적는지와 연결 코드를 확인합니다.
- **기록 정리**: 날짜나 시간이 잘못된 기록, 완전히 같은 기록을 지웁니다.
- **CSV로 저장**: 현재 기록을 한 장짜리 CSV 파일로 내려받습니다.
- **Excel로 저장**: 현재 기록을 시작일 연도별 탭으로 나눈 Excel 파일로 내려받습니다.

## Steam 연결하기

**Steam 연결하기**에서 SteamID64(17자리 숫자)만 입력하고 저장합니다. Steam API Key는 입력하지 않습니다. 키는 서버(Vercel 환경변수)에만 보관되고, 브라우저는 같은 도메인의 `/api/steam-owned-games`를 호출합니다. 구글 시트 저장 주소가 없어도 Steam 동기화는 동작하며, 저장 주소가 있으면 새 Steam 기록을 구글 시트에도 함께 저장합니다.

게임 이름을 입력하면 플레이 시간 계산에 활용할 수 있고, **최근 플레이 동기화**로 새 플레이 시간을 기록할 수 있습니다. 총 플레이 시간이 0.3시간(18분) 미만인 게임은 제외합니다.

- **SteamID64 찾기**: Steam 프로필 주소가 `.../profiles/7656...`라면 뒤의 17자리 숫자입니다.
- **공개 설정 필수**: Steam 프로필 → **프로필 편집 → 개인정보 설정**에서 **게임 세부 정보**를 **공개**로 바꿔야 게임 목록과 플레이 시간을 가져올 수 있습니다. 비공개이면 게임 목록이 비어 있게 됩니다.

> 위 Apps Script 코드의 `steamOwnedGames` 부분은 이제 사용하지 않습니다. 구글 시트 저장·가져오기에는 그대로 두어도 문제없습니다.

## Vercel에 배포하기

정적 화면(저장소 루트)과 Steam 서버리스 함수(`api/steam-owned-games.js`)가 같은 도메인에서 함께 제공됩니다. 별도 빌드 설정은 필요 없습니다.

1. [Steam Web API Key 페이지](https://steamcommunity.com/dev/apikey)에서 키를 발급합니다.
2. Vercel에서 **Add New → Project**로 이 저장소를 가져옵니다. Framework Preset은 **Other**, Build Command와 Output Directory는 비워 둡니다.
3. **Settings → Environment Variables**에 `STEAM_API_KEY`를 추가합니다. (`.env.example` 참고)
   - 다른 도메인에서 함수를 호출해야 할 때만 `ALLOWED_ORIGIN`(예: `https://example.com`)을 추가합니다. 같은 도메인에서만 쓰면 비워 둡니다.
4. 배포(또는 환경변수 추가 후 **Redeploy**)합니다.
5. 배포된 주소에서 SteamID64를 저장하고 **최근 플레이 동기화**를 눌러 확인합니다.

함수 테스트(실제 Steam 호출 없음): `node --test tests/steam-owned-games.test.js` (Node 18 이상)
