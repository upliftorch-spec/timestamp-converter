(function () {
  'use strict';

  const core = window.TimestampCore;
  const language = document.documentElement.lang === 'en' ? 'en' : 'zh-TW';
  const words = language === 'en' ? {
    invalid: 'Enter a valid Unix timestamp or date and time.',
    detected: 'Detected format',
    converted: 'timestamps converted',
    none: 'No supported timestamp was found.',
    copied: 'Copied',
    copy: 'Copy',
    local: 'Browser local time',
    precision: 'Sub-millisecond digits are preserved for display; Unix millisecond output is truncated.',
    skipped: 'unlabelled numeric candidates skipped',
    syslogYear: 'syslog timestamps need a year',
    syslogNeedsYear: 'Enter the year used by this syslog timestamp in Conversion settings.',
    type: {
      unixSeconds: 'Unix seconds', unixMilliseconds: 'Unix milliseconds',
      unixMicroseconds: 'Unix microseconds', unixNanoseconds: 'Unix nanoseconds',
      apache: 'Apache log time', dateTime: 'Date and time', naiveUtc: 'Date and time (assumed UTC)',
      naiveLocal: 'Date and time (assumed local)', naiveZone: 'Date and time (source timezone)',
      isoWithZone: 'ISO 8601 with timezone', javaDateTime: 'Java log time', rfc2822: 'RFC 2822', syslog: 'Syslog', unknown: 'Unknown',
    },
  } : {
    invalid: '請輸入有效的 Unix Timestamp 或日期時間。',
    detected: '辨識格式',
    converted: '個時間已轉換',
    none: '找不到支援的時間格式。',
    copied: '已複製',
    copy: '複製',
    local: '瀏覽器本地時間',
    precision: '已保留毫秒以下位數供顯示；Unix 毫秒輸出會截斷更小的精度。',
    skipped: '個無欄位名稱的純數字候選已略過',
    syslogYear: '個 syslog 時間需要指定年份',
    syslogNeedsYear: '請先在轉換設定填入這筆 syslog 使用的年份。',
    type: {
      unixSeconds: 'Unix 秒', unixMilliseconds: 'Unix 毫秒',
      unixMicroseconds: 'Unix 微秒', unixNanoseconds: 'Unix 奈秒',
      apache: 'Apache Log 時間', dateTime: '日期時間', naiveUtc: '日期時間（視為 UTC）',
      naiveLocal: '日期時間（視為本地）', naiveZone: '日期時間（指定來源時區）',
      isoWithZone: '含時區的 ISO 8601', javaDateTime: 'Java Log 時間', rfc2822: 'RFC 2822', syslog: 'Syslog', unknown: '未知',
    },
  };

  const input = document.getElementById('timestampInput');
  const naiveMode = document.getElementById('naiveMode');
  const sourceZone = document.getElementById('sourceZone');
  const sourceZoneField = document.getElementById('sourceZoneField');
  const outputZone = document.getElementById('outputZone');
  const syslogYear = document.getElementById('syslogYear');
  const numericMode = document.getElementById('numericMode');
  const timezoneList = document.getElementById('timezoneList');
  const status = document.getElementById('inputStatus');
  const resultPanel = document.getElementById('resultPanel');
  const logInput = document.getElementById('logInput');
  const logOutput = document.getElementById('logOutput');
  const logStatus = document.getElementById('logStatus');
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  core.supportedTimeZones().forEach(function (zone) {
    const option = document.createElement('option');
    option.value = zone;
    timezoneList.appendChild(option);
  });
  outputZone.value = browserZone;
  sourceZone.value = browserZone;

  function selectedZone() {
    const requested = outputZone.value.trim();
    let zone = 'UTC';
    try {
      new Intl.DateTimeFormat('en', { timeZone: requested }).format();
      zone = requested;
    } catch (error) {
      outputZone.setCustomValidity(language === 'en' ? 'Choose a valid IANA timezone.' : '請選擇有效的 IANA 時區。');
    }
    if (zone === requested) {
      outputZone.setCustomValidity('');
    }
    return zone;
  }

  function selectedSourceZone() {
    const requested = sourceZone.value.trim();
    let zone = 'UTC';
    if (core.validTimeZone(requested)) {
      zone = requested;
      sourceZone.setCustomValidity('');
    } else {
      sourceZone.setCustomValidity(language === 'en' ? 'Choose a valid source IANA timezone.' : '請選擇有效的來源 IANA 時區。');
    }
    return zone;
  }

  function parseOptions() {
    return {
      naiveMode: naiveMode.value,
      sourceTimeZone: selectedSourceZone(),
      syslogYear: syslogYear.value,
    };
  }

  function resultRows(parsed) {
    const zone = selectedZone();
    const milliseconds = parsed.date.getTime();
    return [
      ['Unix (s)', String(Math.floor(milliseconds / 1000))],
      ['Unix (ms)', String(milliseconds)],
      ['ISO 8601', core.formatIso(parsed)],
      ['UTC', core.formatParsedInZone(parsed, 'UTC', language)],
      [words.local + ' · ' + browserZone, core.formatParsedInZone(parsed, browserZone, language)],
      [zone, core.formatParsedInZone(parsed, zone, language)],
      [language === 'en' ? 'Relative' : '相對時間', core.formatRelative(parsed.date, new Date(), language)],
    ];
  }

  function renderSingle() {
    const parsed = core.parseTimestamp(input.value, parseOptions());
    if (parsed.ok) {
      status.className = 'status success';
      const separator = language === 'en' ? ': ' : '：';
      status.textContent = words.detected + separator + (words.type[parsed.type] || words.type.unknown) + (parsed.precisionLoss ? ' · ' + words.precision : '');
      resultPanel.innerHTML = '';
      resultRows(parsed).forEach(function (row) {
        const item = document.createElement('div');
        item.className = 'result-row';
        const label = document.createElement('div');
        label.className = 'result-label';
        label.textContent = row[0];
        const value = document.createElement('code');
        value.textContent = row[1];
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'copy-btn';
        button.textContent = words.copy;
        button.dataset.copy = row[1];
        item.append(label, value, button);
        resultPanel.appendChild(item);
      });
      resultPanel.hidden = false;
    } else {
      status.className = 'status error';
      status.textContent = parsed.needsYear ? words.syslogNeedsYear : words.invalid;
      resultPanel.hidden = true;
    }
  }

  function convertLogs() {
    const result = core.convertLog(logInput.value, {
      timeZone: selectedZone(),
      locale: language,
      ...parseOptions(),
      numericMode: numericMode.value,
      typeLabels: words.type,
    });
    logOutput.value = result.output;
    if (result.count > 0 || result.skippedNumeric > 0 || result.missingSyslogYear > 0) {
      logStatus.className = result.count > 0 ? 'status success' : 'status warning';
      const notes = [];
      if (result.count > 0) {
        notes.push(result.count + ' ' + words.converted);
      }
      if (result.skippedNumeric > 0) {
        notes.push(result.skippedNumeric + ' ' + words.skipped);
      }
      if (result.missingSyslogYear > 0) {
        notes.push(result.missingSyslogYear + ' ' + words.syslogYear);
      }
      logStatus.textContent = notes.join(' · ');
    } else {
      logStatus.className = 'status error';
      logStatus.textContent = words.none;
    }
  }

  function copyText(value, button) {
    navigator.clipboard.writeText(value).then(function () {
      const original = button.textContent;
      button.textContent = words.copied;
      window.setTimeout(function () {
        button.textContent = original;
      }, 1200);
    }).catch(function () {
      const helper = document.createElement('textarea');
      helper.value = value;
      document.body.appendChild(helper);
      helper.select();
      document.execCommand('copy');
      helper.remove();
    });
  }

  document.getElementById('convertBtn').addEventListener('click', renderSingle);
  document.getElementById('nowBtn').addEventListener('click', function () {
    input.value = String(Math.floor(Date.now() / 1000));
    renderSingle();
  });
  document.getElementById('logConvertBtn').addEventListener('click', convertLogs);
  document.getElementById('logClearBtn').addEventListener('click', function () {
    logInput.value = '';
    logOutput.value = '';
    logStatus.textContent = '';
  });
  document.getElementById('copyLogBtn').addEventListener('click', function (event) {
    copyText(logOutput.value, event.currentTarget);
  });
  document.querySelectorAll('[data-example]').forEach(function (button) {
    button.addEventListener('click', function () {
      input.value = button.dataset.example;
      renderSingle();
    });
  });
  document.addEventListener('click', function (event) {
    const button = event.target.closest('[data-copy]');
    if (button) {
      copyText(button.dataset.copy, button);
    }
  });
  input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      renderSingle();
    }
  });
  naiveMode.addEventListener('change', function () {
    sourceZoneField.hidden = naiveMode.value !== 'zone';
    if (input.value.trim()) {
      renderSingle();
    }
  });
  sourceZone.addEventListener('change', function () {
    if (input.value.trim()) {
      renderSingle();
    }
  });
  outputZone.addEventListener('change', function () {
    if (input.value.trim()) {
      renderSingle();
    }
  });

  const themeButton = document.getElementById('themeToggle');
  const themeIcon = document.getElementById('themeIcon');
  const savedTheme = localStorage.getItem('timestamp_theme');
  if (savedTheme === 'dark') {
    document.documentElement.dataset.theme = 'dark';
    themeIcon.className = 'icon icon-sun';
  }
  themeButton.addEventListener('click', function () {
    const dark = document.documentElement.dataset.theme === 'dark';
    document.documentElement.dataset.theme = dark ? 'light' : 'dark';
    themeIcon.className = dark ? 'icon icon-moon' : 'icon icon-sun';
    localStorage.setItem('timestamp_theme', dark ? 'light' : 'dark');
  });

  document.querySelectorAll('.faq-question').forEach(function (button) {
    button.addEventListener('click', function () {
      const expanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!expanded));
      button.nextElementSibling.hidden = expanded;
    });
  });

  document.getElementById('year').textContent = String(new Date().getFullYear());
  sourceZoneField.hidden = naiveMode.value !== 'zone';
  input.value = String(Math.floor(Date.now() / 1000));
  renderSingle();
}());
