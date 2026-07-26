/**
 * SIDELINE Gmail Bridge（自己完結版）
 *
 * Gmail の Google アラートを取り込み → 保存 → JSON API で公開
 * Surge 上の SIDELINE ページから読み取れます（JSONP対応）。
 *
 * ===== 初回セットアップ（5分） =====
 * 1. このコードをすべて貼る
 * 2. syncGoogleAlerts を実行 → 権限を許可
 * 3. createFiveMinuteTrigger を実行
 * 4. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
 *    - 次のユーザーとして実行: 自分
 *    - アクセスできるユーザー: 全員
 * 5. 表示された URL を SIDELINE ページの「API URL」に貼る
 */

var STORE_FILENAME = 'sideline-digest-store.json';
var ALERT_QUERY_UNREAD = 'from:googlealerts-noreply@google.com is:unread';
var ALERT_QUERY_RECENT = 'from:googlealerts-noreply@google.com newer_than:3d';
var MAX_ARTICLES = 100;

var HIGH_IMPACT = [
  'イノベーション', 'テクノロジー', '新規事業', 'スタートアップ',
  '資金調達', 'シリーズA', 'シリーズB', '買収', '提携', '業務提携', '出資',
  'ローンチ', 'リリース', 'プロダクト', 'プラットフォーム',
  '生成AI', 'AI', '機械学習', 'データ分析', 'ウェアラブル', 'センサー',
  'VR', 'AR', 'メタバース', 'Web3', 'NFT', 'ブロックチェーン',
  'ファンエンゲージメント', 'スポーツテック', 'SportsTech', 'DX'
];

var DOMAIN_HINTS = [
  'スポーツ', 'アスリート', 'クラブ', 'リーグ', 'スタジアム', '観戦',
  'トレーニング', 'パフォーマンス', 'フィットネス', 'eスポーツ',
  'オリンピック', 'ワールドカップ'
];

/* ========== Web API（Surgeから呼ぶ） ========== */

function doGet(e) {
  e = e || { parameter: {} };
  var action = (e.parameter && e.parameter.action) || 'list';

  if (action === 'sync') {
    var added = syncGoogleAlerts();
    return jsonp_(e, { ok: true, added: added, store: readStore_() });
  }

  return jsonp_(e, readStore_());
}

function jsonp_(e, data) {
  var json = JSON.stringify(data);
  var callback = e && e.parameter && e.parameter.callback;
  if (callback && /^[A-Za-z0-9_]+$/.test(callback)) {
    return ContentService
      .createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

/* ========== Gmail 同期 ========== */

function syncGoogleAlerts() {
  var store = readStore_();
  var existing = {};
  store.articles.forEach(function (a) {
    existing[normalizeUrl_(a.url)] = true;
  });

  var newlyAdded = [];
  newlyAdded = newlyAdded.concat(ingestSearch_(ALERT_QUERY_UNREAD, store, existing, true));

  // 初回や取りこぼし用: 直近3日も見る（未処理URLだけ追加）
  if (store.articles.length < 5 || !store.lastIngestAt) {
    newlyAdded = newlyAdded.concat(ingestSearch_(ALERT_QUERY_RECENT, store, existing, false));
  }

  var added = newlyAdded.length;
  store.articles.sort(function (a, b) {
    return (b.score - a.score) || (new Date(b.receivedAt) - new Date(a.receivedAt));
  });
  store.articles = store.articles.slice(0, MAX_ARTICLES);
  store.updatedAt = new Date().toISOString();
  store.lastIngestAt = new Date().toISOString();
  writeStore_(store);

  // 任意: Vercel / Next.js の /api/ingest へ新規分だけ転送
  if (newlyAdded.length) forwardToExternalIngest_(newlyAdded);

  console.log('sync done. added=' + added + ' total=' + store.articles.length);
  return added;
}

function ingestSearch_(query, store, existing, markRead) {
  var threads = GmailApp.search(query, 0, 25);
  var addedArticles = [];

  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (message) {
      if (markRead && !message.isUnread()) return;

      var subject = message.getSubject() || '';
      if (subject.indexOf('Google') === -1 && subject.indexOf('アラート') === -1 && subject.indexOf('Alert') === -1) {
        return;
      }

      var html = message.getBody() || '';
      var text = message.getPlainBody() || '';
      var alertQuery = extractAlertQuery_(subject, html);
      var parsed = parseGoogleAlert_(html, text);
      var receivedAt = message.getDate().toISOString();

      parsed.forEach(function (item) {
        var url = normalizeUrl_(item.url);
        if (!url || !item.title || existing[url]) return;

        var article = enrich_(item, alertQuery, receivedAt);
        store.articles.unshift(article);
        existing[url] = true;
        addedArticles.push(article);
      });

      if (markRead) message.markRead();
    });
  });

  return addedArticles;
}

function createFiveMinuteTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'syncGoogleAlerts') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger('syncGoogleAlerts').timeBased().everyMinutes(5).create();
  console.log('5分トリガーを作成しました');
}

/* ========== パース ========== */

function extractAlertQuery_(subject, html) {
  var m = subject.match(/Google\s*アラート\s*[-–—]\s*(.+)$/i)
    || subject.match(/Google\s*Alert\s*[-–—]\s*(.+)$/i);
  if (m && m[1]) return clean_(m[1]);

  var h = html.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i);
  if (h && h[1]) return clean_(stripTags_(h[1]));
  return 'スポーツ';
}

function parseGoogleAlert_(html, text) {
  var articles = [];
  var seen = {};

  if (html) {
    var re = /<a[^>]*href=["'](https:\/\/www\.google\.com\/url\?[^"']+|https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    var match;
    while ((match = re.exec(html)) !== null) {
      var href = match[1]
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"');
      var title = clean_(stripTags_(match[2]));
      if (!title || title.length < 8) continue;
      if (/^(すべての|See more|View all|Unsubscribe|配信停止)/i.test(title)) continue;

      var url = unwrapGoogleUrl_(href);
      if (!/^https?:\/\//.test(url)) continue;
      if (/google\.com\/alerts/i.test(url)) continue;
      if (seen[url]) continue;

      var after = html.slice(match.index + match[0].length, match.index + match[0].length + 500);
      var snippet = clean_(stripTags_(after)).slice(0, 180);
      if (!snippet) snippet = title;

      var source = '';
      try {
        source = url.match(/^https?:\/\/([^\/]+)/)[1].replace(/^www\./, '');
      } catch (err) {
        source = 'unknown';
      }

      seen[url] = true;
      articles.push({ title: title, url: url, snippet: snippet, source: source });
      if (articles.length >= 30) break;
    }
  }

  if (!articles.length && text) {
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = clean_(lines[i]);
      var um = line.match(/https?:\/\/\S+/);
      if (!um) continue;
      var u = unwrapGoogleUrl_(um[0]);
      var t = clean_(line.replace(um[0], '')) || (i > 0 ? clean_(lines[i - 1]) : '無題の記事');
      articles.push({
        title: t,
        url: u,
        snippet: (lines[i + 1] && lines[i + 1].indexOf('http') !== 0) ? clean_(lines[i + 1]) : t,
        source: 'unknown'
      });
    }
  }

  return articles;
}

function unwrapGoogleUrl_(href) {
  var m = href.match(/[?&]url=([^&]+)/);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch (err) {
      return m[1];
    }
  }
  return href;
}

function stripTags_(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function clean_(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function normalizeUrl_(url) {
  try {
    return String(url || '').split('#')[0];
  } catch (err) {
    return url;
  }
}

/* ========== スコア・要約 ========== */

function enrich_(item, alertQuery, receivedAt) {
  var blob = item.title + ' ' + item.snippet + ' ' + alertQuery;
  var tags = detectTags_(blob);
  var score = scoreArticle_(blob, item);
  var summary = buildSummary_(item, tags);
  var article = {
    id: Utilities.getUuid().slice(0, 10),
    title: item.title,
    summary: summary,
    url: item.url,
    source: item.source || 'unknown',
    alertQuery: alertQuery,
    receivedAt: receivedAt,
    score: score,
    tags: tags,
    shareText: ''
  };
  article.shareText = buildShareText_(article);
  return article;
}

function detectTags_(text) {
  var tags = [];
  function push(tag) {
    if (tags.indexOf(tag) === -1) tags.push(tag);
  }
  if (/イノベーション|革新/.test(text)) push('イノベーション');
  if (/テクノロジー|テック|SportsTech|スポーツテック/.test(text)) push('テクノロジー');
  if (/AI|人工知能|機械学習|生成AI/.test(text)) push('AI');
  if (/新規事業|スタートアップ|起業/.test(text)) push('新規事業');
  if (/ビジネス|事業|収益|マネタイズ/.test(text)) push('ビジネス');
  if (/Web3|NFT|ブロックチェーン|メタバース/.test(text)) push('Web3');
  if (/資金調達|出資|投資|シリーズ/.test(text)) push('資金調達');
  if (/提携|買収|パートナー/.test(text)) push('提携');
  DOMAIN_HINTS.forEach(function (w) {
    if (text.indexOf(w) !== -1 && tags.length < 4) push(w);
  });
  return tags.slice(0, 4);
}

function scoreArticle_(text, item) {
  var score = 35;
  HIGH_IMPACT.forEach(function (w) {
    if (text.indexOf(w) !== -1) score += 10;
  });
  DOMAIN_HINTS.forEach(function (w) {
    if (text.indexOf(w) !== -1) score += 3;
  });
  if (/スポーツ/.test(text)) score += 8;
  if (/イノベーション|テクノロジー|AI|Web3|ビジネス|新規事業/.test(text)) score += 10;
  if (item.title && item.title.length >= 20 && item.title.length <= 70) score += 4;
  if (item.snippet && item.snippet.length >= 40) score += 3;
  return Math.min(score, 100);
}

function buildSummary_(item, tags) {
  var base = item.snippet || item.title;
  if (base.length > 120) base = base.slice(0, 117) + '…';
  var why = tags.length ? ('注目点: ' + tags.join(' / ')) : 'スポーツイノベーション関連の速報';
  return base + '（' + why + '）';
}

function buildShareText_(article) {
  var tagLine = article.tags.length
    ? article.tags.map(function (t) { return '#' + t.replace(/\s+/g, ''); }).join(' ')
    : '#スポーツイノベーション';
  var summary = String(article.summary || '').replace(/（注目点:.*?）$/, '').trim();
  if (summary.length > 110) summary = summary.slice(0, 109) + '…';
  return [
    '【スポーツイノベーション】' + article.title,
    '',
    summary,
    '',
    article.url,
    '',
    tagLine + ' #スポーツテック #SIDELINE'
  ].join('\n');
}

/* ========== 保存（Googleドライブ） ========== */

function getStoreFile_() {
  var it = DriveApp.getFilesByName(STORE_FILENAME);
  if (it.hasNext()) return it.next();
  var seed = {
    updatedAt: new Date().toISOString(),
    lastIngestAt: null,
    articles: []
  };
  return DriveApp.createFile(STORE_FILENAME, JSON.stringify(seed), MimeType.PLAIN_TEXT);
}

function readStore_() {
  try {
    var file = getStoreFile_();
    var raw = file.getBlob().getDataAsString('UTF-8');
    var data = JSON.parse(raw);
    if (!data.articles) data.articles = [];
    return data;
  } catch (err) {
    return { updatedAt: null, lastIngestAt: null, articles: [] };
  }
}

function writeStore_(store) {
  getStoreFile_().setContent(JSON.stringify(store));
}

/* ========== 任意: 外部 Next.js へも転送 ========== */

function forwardToExternalIngest_(articles) {
  var props = PropertiesService.getScriptProperties();
  var ingestUrl = props.getProperty('INGEST_URL');
  if (!ingestUrl) return;

  var secret = props.getProperty('INGEST_SECRET');
  var payload = {
    articles: (articles || []).map(function (a) {
      return {
        title: a.title,
        url: a.url,
        snippet: a.summary,
        source: a.source
      };
    }),
    alertQuery: articles[0] && articles[0].alertQuery
      ? articles[0].alertQuery
      : 'スポーツ イノベーション'
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  if (secret) options.headers = { 'x-ingest-secret': secret };

  try {
    UrlFetchApp.fetch(ingestUrl, options);
  } catch (err) {
    console.error('external ingest failed: ' + err);
  }
}
