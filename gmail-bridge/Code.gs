/**
 * スポーツニュースダイジェスト Gmail Bridge
 *
 * 毎朝9時（Asia/Tokyo）:
 *   1. Gmail の Google アラートを取り込み
 *   2. Vercel /api/ingest へ転送
 *   3. Slack へ全件ダイジェスト通知
 *
 * 初回:
 *   1. setupScriptProperties を実行
 *   2. syncGoogleAlerts を実行（権限許可）
 *   3. createMorningTrigger を実行
 */

var ALERT_QUERY_UNREAD = 'from:googlealerts-noreply@google.com is:unread';
var ALERT_QUERY_RECENT = 'from:googlealerts-noreply@google.com newer_than:7d';
var TARGET_ARTICLES = 30;
var MAX_THREADS = 50;

/* ========== 初回セットアップ ========== */

function setupScriptProperties() {
  // 秘密鍵は Git に載せない。Vercel と同じ値をここに入れてから実行する。
  PropertiesService.getScriptProperties().setProperties({
    INGEST_URL: 'https://sports-alert-digest.vercel.app/api/ingest',
    INGEST_SECRET: 'YOUR_INGEST_SECRET',
    DIGEST_URL: 'https://sports-alert-digest.vercel.app/api/cron/digest',
    CRON_SECRET: 'YOUR_CRON_SECRET'
  }, true);
  console.log('スクリプトプロパティを設定しました');
  checkScriptProperties();
}

function checkScriptProperties() {
  var props = PropertiesService.getScriptProperties();
  ['INGEST_URL', 'INGEST_SECRET', 'DIGEST_URL', 'CRON_SECRET'].forEach(function (key) {
    var value = props.getProperty(key);
    if (!value) {
      console.log(key + ': ❌ 未設定');
      return;
    }
    console.log(key + ': ✅ 設定済み (' + value.slice(0, 4) + '...' + value.slice(-4) + ')');
  });
}

function createMorningTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    var fn = trigger.getHandlerFunction();
    if (fn === 'morningDigest' || fn === 'syncGoogleAlerts') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('morningDigest')
    .timeBased()
    .atHour(9)
    .everyDays(1)
    .inTimezone('Asia/Tokyo')
    .create();

  console.log('毎朝9時（日本時間）のトリガーを作成しました');
}

/* ========== 毎朝の本体 ========== */

function morningDigest() {
  var added = syncGoogleAlerts();
  notifySlackDigest_();
  console.log('morningDigest done. added=' + added);
}

function syncGoogleAlerts() {
  var articles = [];
  var seen = {};

  // 1) 未読を優先取得
  collectFromSearch_(ALERT_QUERY_UNREAD, articles, seen, true);

  // 2) 足りなければ直近7日分からも補充（約30件を目指す）
  if (articles.length < TARGET_ARTICLES) {
    collectFromSearch_(ALERT_QUERY_RECENT, articles, seen, false);
  }

  if (articles.length > TARGET_ARTICLES) {
    articles = articles.slice(0, TARGET_ARTICLES);
  }

  if (articles.length) forwardToIngest_(articles);
  console.log('sync done. added=' + articles.length + ' (target=' + TARGET_ARTICLES + ')');
  return articles.length;
}

function collectFromSearch_(query, articles, seen, markRead) {
  GmailApp.search(query, 0, MAX_THREADS).forEach(function (thread) {
    if (articles.length >= TARGET_ARTICLES) return;

    thread.getMessages().forEach(function (message) {
      if (articles.length >= TARGET_ARTICLES) return;
      if (markRead && !message.isUnread()) return;

      var subject = message.getSubject() || '';
      if (subject.indexOf('Google') === -1 &&
          subject.indexOf('アラート') === -1 &&
          subject.indexOf('Alert') === -1) {
        return;
      }

      var alertQuery = extractAlertQuery_(subject);
      var parsed = parseGoogleAlert_(message.getBody() || '', message.getPlainBody() || '');

      parsed.forEach(function (item) {
        if (articles.length >= TARGET_ARTICLES) return;
        var url = normalizeUrl_(item.url);
        if (!url || !item.title || seen[url]) return;
        seen[url] = true;
        articles.push({
          title: item.title,
          url: url,
          snippet: item.snippet,
          source: item.source,
          alertQuery: alertQuery
        });
      });

      if (markRead) message.markRead();
    });
  });
}

function notifySlackDigest_() {
  var props = PropertiesService.getScriptProperties();
  var digestUrl = props.getProperty('DIGEST_URL');
  var cronSecret = props.getProperty('CRON_SECRET');
  if (!digestUrl) {
    console.log('DIGEST_URL 未設定のため Slack 通知をスキップ');
    return;
  }

  var options = {
    method: 'get',
    muteHttpExceptions: true,
    headers: {}
  };
  if (cronSecret) options.headers.Authorization = 'Bearer ' + cronSecret;

  var res = UrlFetchApp.fetch(digestUrl, options);
  console.log('digest notify status=' + res.getResponseCode() + ' body=' + res.getContentText());
}

function forwardToIngest_(articles) {
  var props = PropertiesService.getScriptProperties();
  var ingestUrl = props.getProperty('INGEST_URL');
  if (!ingestUrl) {
    console.log('INGEST_URL 未設定のため転送スキップ');
    return;
  }

  var options = {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    payload: JSON.stringify({
      articles: articles.map(function (a) {
        return {
          title: a.title,
          url: a.url,
          snippet: a.snippet,
          source: a.source
        };
      }),
      alertQuery: (articles[0] && articles[0].alertQuery) || 'スポーツ'
    })
  };

  var secret = props.getProperty('INGEST_SECRET');
  if (secret) options.headers = { 'x-ingest-secret': secret };

  var res = UrlFetchApp.fetch(ingestUrl, options);
  console.log('ingest status=' + res.getResponseCode() + ' body=' + res.getContentText());
}

/* ========== メール解析 ========== */

function extractAlertQuery_(subject) {
  var m = subject.match(/Google\s*アラート\s*[-–—]\s*(.+)$/i)
    || subject.match(/Google\s*Alert\s*[-–—]\s*(.+)$/i);
  return m && m[1] ? clean_(m[1]) : 'スポーツ';
}

function parseGoogleAlert_(html, text) {
  var articles = [];
  var seen = {};

  if (html) {
    var re = /<a[^>]*href=["'](https:\/\/www\.google\.com\/url\?[^"']+|https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    var match;
    while ((match = re.exec(html)) !== null) {
      var href = match[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"');
      var title = clean_(stripTags_(match[2]));
      if (!title || title.length < 8) continue;
      if (/^(すべての|See more|View all|Unsubscribe|配信停止)/i.test(title)) continue;

      var url = unwrapGoogleUrl_(href);
      if (!/^https?:\/\//.test(url)) continue;
      if (/google\.com\/alerts/i.test(url)) continue;
      if (seen[url]) continue;

      var after = html.slice(match.index + match[0].length, match.index + match[0].length + 1200);
      var snippet = clean_(stripTags_(after)).slice(0, 800) || title;
      var source = 'unknown';
      try {
        source = url.match(/^https?:\/\/([^\/]+)/)[1].replace(/^www\./, '');
      } catch (err) {}

      seen[url] = true;
      articles.push({ title: title, url: url, snippet: snippet, source: source });
      if (articles.length >= TARGET_ARTICLES) break;
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
  if (!m) return href;
  try {
    return decodeURIComponent(m[1]);
  } catch (err) {
    return m[1];
  }
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
  return String(url || '').split('#')[0];
}
