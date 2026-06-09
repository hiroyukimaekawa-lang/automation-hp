/**
 * gas_main.gs
 * ============================================================================
 * HP自動生成ツール向け Google Apps Script 本体
 * ----------------------------------------------------------------------------
 * 役割:
 *   1. フロントエンド(index.html)からPOSTされたフォーム内容を受け取る
 *   2. Gemini APIでコピーを整える
 *   3. site.json を生成する
 *   4. GitHubへ site.json / index.html をPushする
 *   5. スプレッドシートへ発行情報を記録する
 *   6. 公開URLをフロントへ返す
 *
 * 使い方の概要:
 *   - Apps Script にこのファイルを貼り付け
 *   - 「プロジェクトの設定」→「スクリプト プロパティ」に必要値を設定
 *   - Webアプリとしてデプロイ
 *   - index.html から POST で呼び出す
 *
 * 想定フロントエンド送信形式(JSON):
 * {
 *   "industry": "salon",
 *   "shop_name": "美容室 Lumière",
 *   "tagline": "毎日に、似合う美しさを。",
 *   "concept": "...",
 *   "address": "東京都...",
 *   "tel": "03-...",
 *   "hours": "10:00-19:00",
 *   "closed_days": "火曜",
 *   "sns_instagram": "https://...",
 *   "menu_details": "...",
 *   "staff_intro": "..."
 * }
 * ============================================================================
 */

/**
 * Webアプリ GET 確認用。
 * ブラウザで開いた際に簡易メッセージを返します。
 */
function doGet() {
  return jsonOutput({
    ok: true,
    message: 'HP自動生成ツール GAS API は稼働中です。POSTで利用してください。'
  });
}

/**
 * Webアプリ POST エントリポイント。
 * フロントエンドから送られたJSONを処理して公開URLを返します。
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('POSTデータが見つかりません。');
    }

    var formData = JSON.parse(e.postData.contents);
    var result = onFormSubmit(formData);
    return jsonOutput({ ok: true }, result);
  } catch (error) {
    logError_('doPost', error);
    return jsonOutput({
      ok: false,
      error: error.message || '予期せぬエラーが発生しました。'
    });
  }
}

/**
 * フォーム送信時のメイン処理。
 * 指定された仕様に沿って順番に処理します。
 */
function onFormSubmit(formData) {
  validateFormData_(formData);

  var props = getRequiredProperties_();
  var siteId = generateSiteId(formData.industry);
  var siteData = buildSiteData(formData, siteId);
  var enhanced = callAI(siteData, formData.api_provider, formData.api_key, formData.model);
  var json = buildSiteJson(siteData, enhanced);
  var pushResult = pushToGitHub(siteId, json, formData.industry, props);
  var recordResult = recordToSheet(siteId, formData, enhanced, props);

  return {
    siteId: siteId,
    url: buildPublicUrl_(siteId, props.CLOUDFLARE_PROJECT),
    githubUrl: pushResult.githubFolderUrl,
    sheetUrl: recordResult.sheetUrl,
    status: '公開中'
  };
}

/**
 * フロントから受けた生データを整形し、AIへ渡しやすい形へまとめます。
 */
function buildSiteData(formData, siteId) {
  return {
    site_id: siteId,
    industry: sanitizeString_(formData.industry),
    shop_name: sanitizeString_(formData.shop_name),
    tagline: sanitizeString_(formData.tagline),
    concept: sanitizeString_(formData.concept),
    address: sanitizeString_(formData.address),
    tel: sanitizeString_(formData.tel),
    hours: sanitizeString_(formData.hours),
    closed_days: sanitizeString_(formData.closed_days),
    sns_instagram: sanitizeString_(formData.sns_instagram),
    menu_details: sanitizeString_(formData.menu_details),
    staff_intro: sanitizeString_(formData.staff_intro),
    seat_info: sanitizeString_(formData.seat_info),
    credentials: sanitizeString_(formData.credentials),
    target_level: sanitizeString_(formData.target_level)
  };
}

/**
 * Gemini API を呼び出してコピーを生成します。
 * 出力が崩れた場合にもある程度復旧できるようパース補助を入れています。
 */
/**
 * AI API を呼び出してコピーを生成します。
 * プロバイダー (gemini / claude) に応じて処理を振り分けます。
 */
function callAI(siteData, apiProvider, apiKey, modelName) {
  var props = PropertiesService.getScriptProperties();
  
  if (!apiProvider) {
    apiProvider = 'gemini';
  }
  
  if (!apiKey) {
    if (apiProvider === 'gemini') {
      apiKey = props.getProperty('GEMINI_API_KEY');
    } else if (apiProvider === 'claude' || apiProvider === 'anthropic') {
      apiKey = props.getProperty('CLAUDE_API_KEY');
    }
    
    if (!apiKey) {
      throw new Error(apiProvider.toUpperCase() + 'のAPIキーが設定されていません。ブラウザの右上⚙️アイコンから設定するか、GASのスクリプトプロパティ(GEMINI_API_KEY / CLAUDE_API_KEY)を設定してください。');
    }
  }
  
  if (!modelName || modelName === 'custom') {
    modelName = (apiProvider === 'gemini') ? 'gemini-2.5-flash' : 'claude-3-5-sonnet-20241022';
  }

  var prompt = [
    'あなたはプロのコピーライターです。',
    '以下の店舗情報をもとに、次の4つを生成してください。',
    '出力はJSON形式のみ。余分なテキスト不要。',
    '',
    '店舗名：' + siteData.shop_name,
    '業種：' + siteData.industry,
    'コンセプト：' + siteData.concept,
    '',
    '生成してください：',
    '1. "hero_headline": ファーストビューのキャッチコピー（20文字以内、インパクトあり）',
    '2. "hero_subtext": サブコピー（40文字以内、コンセプトを凝縮）',
    '3. "about_text": Aboutセクションの本文（150〜200文字、温かみのある文体）',
    '4. "seo_description": meta description（120文字以内、検索向け）',
    '',
    '出力例：',
    '{"hero_headline":"...","hero_subtext":"...","about_text":"...","seo_description":"..."}'
  ].join('\n');

  if (apiProvider === 'gemini') {
    return callGeminiAPI_(siteData, apiKey, modelName, prompt);
  } else if (apiProvider === 'claude' || apiProvider === 'anthropic') {
    return callClaudeAPI_(siteData, apiKey, modelName, prompt);
  } else {
    throw new Error('サポートされていないAIプロバイダーです: ' + apiProvider);
  }
}

function callGeminiAPI_(siteData, apiKey, modelName, prompt) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelName + ':generateContent?key=' + encodeURIComponent(apiKey);

  var payload = {
    contents: [
      {
        parts: [
          { text: prompt }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json'
    }
  };

  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var text = response.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('Gemini APIエラー: HTTP ' + code + ' / ' + text);
  }

  var json = JSON.parse(text);
  var rawText = (((json || {}).candidates || [])[0] || {}).content;
  rawText = ((rawText || {}).parts || [])[0];
  rawText = (rawText || {}).text || '';

  if (!rawText) {
    throw new Error('Gemini APIの応答に生成テキストが含まれていません。');
  }

  var parsed = safeJsonParse_(rawText);
  return {
    hero_headline: sanitizeString_(parsed.hero_headline) || fallbackHeroHeadline_(siteData),
    hero_subtext: sanitizeString_(parsed.hero_subtext) || fallbackHeroSubtext_(siteData),
    about_text: sanitizeString_(parsed.about_text) || fallbackAboutText_(siteData),
    seo_description: sanitizeString_(parsed.seo_description) || fallbackSeoDescription_(siteData)
  };
}

function callClaudeAPI_(siteData, apiKey, modelName, prompt) {
  var url = 'https://api.anthropic.com/v1/messages';
  var headers = {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json'
  };

  var payload = {
    model: modelName,
    max_tokens: 1024,
    messages: [
      { role: 'user', content: prompt }
    ],
    temperature: 0.7
  };

  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var text = response.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('Claude APIエラー: HTTP ' + code + ' / ' + text);
  }

  var json = JSON.parse(text);
  var rawText = (((json || {}).content || [])[0] || {}).text || '';

  if (!rawText) {
    throw new Error('Claude APIの応答に生成テキストが含まれていません。');
  }

  var parsed = safeJsonParse_(rawText);
  return {
    hero_headline: sanitizeString_(parsed.hero_headline) || fallbackHeroHeadline_(siteData),
    hero_subtext: sanitizeString_(parsed.hero_subtext) || fallbackHeroSubtext_(siteData),
    about_text: sanitizeString_(parsed.about_text) || fallbackAboutText_(siteData),
    seo_description: sanitizeString_(parsed.seo_description) || fallbackSeoDescription_(siteData)
  };
}

/**
 * site.json を仕様通りのスキーマで構築します。
 */
function buildSiteJson(siteData, enhanced) {
  return {
    meta: {
      site_id: siteData.site_id,
      industry: siteData.industry,
      generated_at: new Date().toISOString(),
      version: '1.0'
    },
    shop: {
      name: siteData.shop_name,
      tagline: siteData.tagline,
      address: siteData.address,
      tel: siteData.tel,
      hours: siteData.hours,
      closed_days: siteData.closed_days,
      sns: {
        instagram: siteData.sns_instagram
      }
    },
    copy: {
      hero_headline: enhanced.hero_headline,
      hero_subtext: enhanced.hero_subtext,
      about_text: enhanced.about_text,
      seo_description: enhanced.seo_description
    },
    industry_data: {
      menu: siteData.menu_details,
      extra: buildIndustryExtra_(siteData)
    }
  };
}

/**
 * GitHubへファイルをPushします。
 *
 * 保存先:
 *   /sites/{siteId}/site.json
 *   /sites/{siteId}/index.html
 *
 * 補足:
 *   - テンプレートHTMLは templates/{industry}/index.html から取得します
 *   - clinic/school はテンプレート未配置でも動くように簡易フォールバックHTMLを返します
 */
function pushToGitHub(siteId, jsonObject, industry, props) {
  var owner = props.GITHUB_OWNER;
  var repo = props.GITHUB_REPO;
  var token = props.GITHUB_TOKEN;
  var branch = props.GITHUB_BRANCH || 'main';

  var siteJsonPath = 'sites/' + siteId + '/site.json';
  var siteHtmlPath = 'sites/' + siteId + '/index.html';
  var templatePath = 'templates/' + industry + '/index.html';

  var templateHtml = getTemplateContent_(templatePath, props);
  var siteJsonString = JSON.stringify(jsonObject, null, 2);

  putGitHubFile_(owner, repo, branch, token, siteJsonPath, siteJsonString, 'Add site.json for ' + siteId);
  putGitHubFile_(owner, repo, branch, token, siteHtmlPath, templateHtml, 'Add site template for ' + siteId);

  return {
    githubFolderUrl: 'https://github.com/' + owner + '/' + repo + '/tree/' + branch + '/sites/' + siteId,
    githubApiTemplatePath: templatePath
  };
}

/**
 * サイトIDを採番します。
 * 形式: {industry}-{3桁ゼロ埋め}
 * 採番元: スプレッドシートのB列(siteId)
 */
function generateSiteId(industry) {
  var props = getRequiredProperties_();
  var sheet = getRecordSheet_(props.SPREADSHEET_ID);
  var lastRow = sheet.getLastRow();
  var values = lastRow > 1 ? sheet.getRange(2, 2, lastRow - 1, 1).getValues() : [];
  var maxNum = 0;

  values.forEach(function(row) {
    var id = String(row[0] || '');
    var match = id.match(new RegExp('^' + industry + '-(\\d{3})$'));
    if (match) {
      maxNum = Math.max(maxNum, parseInt(match[1], 10));
    }
  });

  var next = maxNum + 1;
  return industry + '-' + ('000' + next).slice(-3);
}

/**
 * スプレッドシートへ発行情報を記録します。
 *
 * 列定義:
 *   A 発行日時
 *   B サイトID
 *   C 業種
 *   D 店舗名
 *   E 発行URL
 *   F GitHub URL
 *   G ステータス
 *   H 担当スタッフ名
 */
function recordToSheet(siteId, formData, enhanced, props) {
  var sheet = getRecordSheet_(props.SPREADSHEET_ID);
  ensureSheetHeader_(sheet);

  var publishedUrl = buildPublicUrl_(siteId, props.CLOUDFLARE_PROJECT);
  var githubUrl = 'https://github.com/' + props.GITHUB_OWNER + '/' + props.GITHUB_REPO + '/tree/' + (props.GITHUB_BRANCH || 'main') + '/sites/' + siteId;
  var staffName = sanitizeString_(formData.staff_name || Session.getActiveUser().getEmail() || '未設定');

  sheet.appendRow([
    new Date(),
    siteId,
    sanitizeString_(formData.industry),
    sanitizeString_(formData.shop_name),
    publishedUrl,
    githubUrl,
    '公開中',
    staffName
  ]);

  return {
    sheetUrl: 'https://docs.google.com/spreadsheets/d/' + props.SPREADSHEET_ID + '/edit',
    lastHeroHeadline: enhanced.hero_headline
  };
}

/**
 * スクリプトプロパティから必要な環境変数を取得します。
 */
function getRequiredProperties_() {
  var props = PropertiesService.getScriptProperties();
  var config = {
    GEMINI_API_KEY: props.getProperty('GEMINI_API_KEY'),
    GITHUB_TOKEN: props.getProperty('GITHUB_TOKEN'),
    GITHUB_OWNER: props.getProperty('GITHUB_OWNER'),
    GITHUB_REPO: props.getProperty('GITHUB_REPO'),
    GITHUB_BRANCH: props.getProperty('GITHUB_BRANCH') || 'main',
    SPREADSHEET_ID: props.getProperty('SPREADSHEET_ID'),
    CLOUDFLARE_PROJECT: props.getProperty('CLOUDFLARE_PROJECT')
  };

  var requiredKeys = [
    'GITHUB_TOKEN',
    'GITHUB_OWNER',
    'GITHUB_REPO',
    'SPREADSHEET_ID',
    'CLOUDFLARE_PROJECT'
  ];

  requiredKeys.forEach(function(key) {
    if (!config[key]) {
      throw new Error('スクリプトプロパティが未設定です: ' + key);
    }
  });

  return config;
}

/**
 * フォーム入力の最低限バリデーション。
 */
function validateFormData_(formData) {
  if (!formData) throw new Error('フォームデータが空です。');

  var requiredFields = ['industry', 'shop_name', 'concept', 'address'];
  requiredFields.forEach(function(key) {
    if (!String(formData[key] || '').trim()) {
      throw new Error('必須項目が未入力です: ' + key);
    }
  });

  var allowedIndustries = ['salon', 'food', 'clinic', 'school'];
  if (allowedIndustries.indexOf(String(formData.industry)) === -1) {
    throw new Error('対応していない業種です: ' + formData.industry);
  }

  if (String(formData.shop_name || '').length > 50) {
    throw new Error('店舗名・屋号は50文字以内で入力してください。');
  }
  if (String(formData.tagline || '').length > 100) {
    throw new Error('キャッチフレーズは100文字以内で入力してください。');
  }
  if (String(formData.concept || '').length > 500) {
    throw new Error('コンセプト・想いは500文字以内で入力してください。');
  }
  if (formData.sns_instagram && !/^https?:\/\//.test(String(formData.sns_instagram))) {
    throw new Error('Instagram URLは http:// または https:// から始めてください。');
  }
}

/**
 * GitHub上のテンプレートHTMLを取得します。
 * ファイルが無い場合は簡易フォールバックHTMLを返します。
 */
function getTemplateContent_(templatePath, props) {
  var owner = props.GITHUB_OWNER;
  var repo = props.GITHUB_REPO;
  var branch = props.GITHUB_BRANCH || 'main';
  var token = props.GITHUB_TOKEN;
  var url = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + encodePath_(templatePath) + '?ref=' + encodeURIComponent(branch);

  var response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json'
    },
    muteHttpExceptions: true
  });

  if (response.getResponseCode() === 200) {
    var data = JSON.parse(response.getContentText());
    return Utilities.newBlob(Utilities.base64Decode(data.content.replace(/\n/g, ''))).getDataAsString('UTF-8');
  }

  return buildFallbackTemplateHtml_();
}

/**
 * GitHub Contents API でファイル作成/更新。
 */
function putGitHubFile_(owner, repo, branch, token, path, contentString, commitMessage) {
  var apiUrl = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + encodePath_(path);
  var sha = getGitHubFileSha_(owner, repo, branch, token, path);

  var payload = {
    message: commitMessage,
    content: Utilities.base64Encode(Utilities.newBlob(contentString, 'text/plain', 'utf-8').getBytes()),
    branch: branch
  };

  if (sha) payload.sha = sha;

  var response = UrlFetchApp.fetch(apiUrl, {
    method: 'put',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('GitHub APIエラー (' + path + '): HTTP ' + code + ' / ' + response.getContentText());
  }

  return JSON.parse(response.getContentText());
}

/**
 * 既存ファイルのSHAを取得。
 * 新規作成時は null を返します。
 */
function getGitHubFileSha_(owner, repo, branch, token, path) {
  var apiUrl = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + encodePath_(path) + '?ref=' + encodeURIComponent(branch);
  var response = UrlFetchApp.fetch(apiUrl, {
    method: 'get',
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json'
    },
    muteHttpExceptions: true
  });

  if (response.getResponseCode() === 404) return null;
  if (response.getResponseCode() !== 200) {
    throw new Error('GitHub SHA取得エラー: ' + response.getContentText());
  }

  var data = JSON.parse(response.getContentText());
  return data.sha || null;
}

/**
 * 記録用シートを取得。シート名が無ければ「sites」を作成します。
 */
function getRecordSheet_(spreadsheetId) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName('sites') || ss.insertSheet('sites');
  ensureSheetHeader_(sheet);
  return sheet;
}

/**
 * ヘッダーが無ければ自動作成。
 */
function ensureSheetHeader_(sheet) {
  if (sheet.getLastRow() > 0) return;
  sheet.getRange(1, 1, 1, 8).setValues([[
    '発行日時',
    'サイトID',
    '業種',
    '店舗名',
    '発行URL',
    'GitHub URL',
    'ステータス',
    '担当スタッフ名'
  ]]);
  sheet.setFrozenRows(1);
}

/**
 * 業種ごとの extra 情報を1つの文字列としてまとめます。
 * site.json スキーマを厳密に守るため、industry_data.extra は文字列として保持します。
 */
function buildIndustryExtra_(siteData) {
  var industry = siteData.industry;
  if (industry === 'salon') {
    return joinNonEmptyLines_([
      'スタイリスト紹介: ' + siteData.staff_intro
    ]);
  }
  if (industry === 'food') {
    return joinNonEmptyLines_([
      '席数・個室有無: ' + siteData.seat_info
    ]);
  }
  if (industry === 'clinic') {
    return joinNonEmptyLines_([
      '資格・経歴: ' + siteData.credentials
    ]);
  }
  if (industry === 'school') {
    return joinNonEmptyLines_([
      '対象年齢・レベル: ' + siteData.target_level
    ]);
  }
  return '';
}

/**
 * Cloudflare Pagesの公開URLを生成。
 */
function buildPublicUrl_(siteId, cloudflareProject) {
  return 'https://' + cloudflareProject + '.pages.dev/sites/' + siteId + '/';
}

/**
 * JSONレスポンスを返すヘルパー。
 */
function jsonOutput(baseObj, extraObj) {
  var merged = {};
  Object.keys(baseObj || {}).forEach(function(key) { merged[key] = baseObj[key]; });
  Object.keys(extraObj || {}).forEach(function(key) { merged[key] = extraObj[key]; });
  return ContentService
    .createTextOutput(JSON.stringify(merged))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 文字列を安全に整形。
 */
function sanitizeString_(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

/**
 * JSONの復旧パーサ。
 * 余計なコードブロックや前後テキストが付いても、なるべくJSONだけ取り出します。
 */
function safeJsonParse_(text) {
  var cleaned = String(text || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    var start = cleaned.indexOf('{');
    var end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error('GeminiのJSONパースに失敗しました。応答: ' + text);
  }
}

/**
 * URLパスのエンコード補助。
 */
function encodePath_(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

/**
 * 空文字を除いて改行結合。
 */
function joinNonEmptyLines_(lines) {
  return (lines || []).filter(function(line) {
    return String(line || '').replace(/^[^:]*:\s*/, '').trim();
  }).join('\n');
}

/**
 * Gemini失敗時の最低限のフォールバック文言群。
 */
function fallbackHeroHeadline_(siteData) {
  return siteData.shop_name ? (siteData.shop_name + 'の魅力を、もっと身近に') : '毎日に寄り添う新しい出会い';
}

function fallbackHeroSubtext_(siteData) {
  return siteData.concept ? siteData.concept.slice(0, 40) : '想いが伝わる、あたたかな店舗サイトをお届けします。';
}

function fallbackAboutText_(siteData) {
  return siteData.concept || 'お客様一人ひとりとの出会いを大切にし、心地よい時間と確かな価値を提供できるよう努めています。';
}

function fallbackSeoDescription_(siteData) {
  return [siteData.shop_name, siteData.address, siteData.hours].filter(Boolean).join(' / ').slice(0, 120);
}

/**
 * clinic / school 用フォールバックテンプレート。
 * GitHubにテンプレートが無くても公開可能な最低限の静的HTMLを返します。
 */
function buildFallbackTemplateHtml_() {
  return [
    '<!DOCTYPE html>',
    '<html lang="ja">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '  <title>店舗サイト</title>',
    '  <meta name="description" content="">',
    '  <style>',
    '    body{font-family:\'Noto Sans JP\',sans-serif;margin:0;background:#F8FAFC;color:#1E293B;}',
    '    .wrap{max-width:960px;margin:0 auto;padding:24px 16px 56px;}',
    '    .box{background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:24px;margin-top:16px;}',
    '    .hero{padding:64px 24px;background:linear-gradient(135deg,#DBEAFE,#EFF6FF);border-radius:20px;}',
    '    h1,h2{margin:0 0 12px;} p{line-height:1.8;} .muted{color:#64748B;}',
    '  </style>',
    '</head>',
    '<body>',
    '  <div class="wrap">',
    '    <section class="hero">',
    '      <p class="muted" data-field="shop.name"></p>',
    '      <h1 data-field="copy.hero_headline">キャッチコピー</h1>',
    '      <p data-field="copy.hero_subtext">サブコピー</p>',
    '    </section>',
    '    <section class="box">',
    '      <h2>About</h2>',
    '      <p data-field="copy.about_text"></p>',
    '    </section>',
    '    <section class="box">',
    '      <h2>Information</h2>',
    '      <p><strong>住所：</strong><span data-field="shop.address"></span></p>',
    '      <p><strong>電話番号：</strong><span data-field="shop.tel"></span></p>',
    '      <p><strong>営業時間：</strong><span data-field="shop.hours"></span></p>',
    '      <p><strong>定休日：</strong><span data-field="shop.closed_days"></span></p>',
    '      <p><strong>Instagram：</strong><span data-field="shop.sns.instagram"></span></p>',
    '    </section>',
    '    <section class="box">',
    '      <h2>メニュー・詳細</h2>',
    '      <p style="white-space:pre-wrap;" data-field="industry_data.menu"></p>',
    '      <p style="white-space:pre-wrap;" data-field="industry_data.extra"></p>',
    '    </section>',
    '  </div>',
    '  <script>',
    '    fetch("./site.json").then(function(r){return r.json();}).then(function(data){',
    '      document.title = data.shop.name || "店舗サイト";',
    '      var meta = document.querySelector("meta[name=description]");',
    '      if(meta && data.copy && data.copy.seo_description){ meta.setAttribute("content", data.copy.seo_description); }',
    '      document.querySelectorAll("[data-field]").forEach(function(el){',
    '        var keys = el.dataset.field.split(".");',
    '        var value = data;',
    '        keys.forEach(function(key){ value = value && value[key]; });',
    '        if(value){ el.textContent = value; }',
    '      });',
    '    });',
    '  </script>',
    '</body>',
    '</html>'
  ].join('\n');
}

/**
 * 簡易ログ関数。
 */
function logError_(scope, error) {
  console.error('[ERROR][' + scope + ']', error && error.stack ? error.stack : error);
}
