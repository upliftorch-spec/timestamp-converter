(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.TimestampCore = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
  const RFC_DAYS = '(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)';
  const RFC_MONTHS = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)';

  function validDate(date) {
    return date instanceof Date && Number.isFinite(date.getTime());
  }

  function normalizeConfig(options) {
    let config = {};
    if (typeof options === 'string') {
      config = { naiveMode: options };
    } else {
      config = options || {};
    }
    return {
      naiveMode: config.naiveMode === 'local' || config.naiveMode === 'zone' ? config.naiveMode : 'utc',
      sourceTimeZone: config.sourceTimeZone || 'UTC',
      syslogYear: Number.isInteger(Number(config.syslogYear)) && String(config.syslogYear).trim() ? Number(config.syslogYear) : null,
    };
  }

  function validComponents(parts) {
    const probe = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond));
    return probe.getUTCFullYear() === parts.year && probe.getUTCMonth() + 1 === parts.month && probe.getUTCDate() === parts.day &&
      probe.getUTCHours() === parts.hour && probe.getUTCMinutes() === parts.minute && probe.getUTCSeconds() === parts.second;
  }

  function zoneDateParts(date, timeZone) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    const values = {};
    formatter.formatToParts(date).forEach(function (part) {
      if (part.type !== 'literal') {
        values[part.type] = Number(part.value);
      }
    });
    return values;
  }

  function validTimeZone(timeZone) {
    let valid = true;
    try {
      new Intl.DateTimeFormat('en', { timeZone }).format();
    } catch (error) {
      valid = false;
    }
    return valid;
  }

  function zonedDate(parts, timeZone) {
    let date = new Date(NaN);
    if (validTimeZone(timeZone)) {
      const desired = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond);
      let candidate = desired;
      for (let index = 0; index < 3; index += 1) {
        const shown = zoneDateParts(new Date(candidate), timeZone);
        const shownAsUtc = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute, shown.second, parts.millisecond);
        candidate += desired - shownAsUtc;
      }
      const checked = zoneDateParts(new Date(candidate), timeZone);
      if (checked.year === parts.year && checked.month === parts.month && checked.day === parts.day && checked.hour === parts.hour && checked.minute === parts.minute && checked.second === parts.second) {
        date = new Date(candidate);
      }
    }
    return date;
  }

  function dateFromParts(parts, config, offsetText) {
    let date = new Date(NaN);
    if (validComponents(parts)) {
      if (offsetText) {
        let offsetMinutes = 0;
        let offsetValid = true;
        if (offsetText.toUpperCase() !== 'Z' && offsetText.toUpperCase() !== 'UTC' && offsetText.toUpperCase() !== 'GMT') {
          const offsetMatch = offsetText.match(/^([+-])(\d{2}):?(\d{2})$/);
          const offsetHour = offsetMatch ? Number(offsetMatch[2]) : 99;
          const offsetMinute = offsetMatch ? Number(offsetMatch[3]) : 99;
          offsetValid = Boolean(offsetMatch) && offsetHour <= 14 && offsetMinute <= 59 && (offsetHour < 14 || offsetMinute === 0);
          if (offsetValid) {
            offsetMinutes = (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3])) * (offsetMatch[1] === '+' ? 1 : -1);
          }
        }
        if (offsetValid) {
          date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond) - offsetMinutes * 60000);
        }
      } else if (config.naiveMode === 'local') {
        date = new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond);
      } else if (config.naiveMode === 'zone') {
        date = zonedDate(parts, config.sourceTimeZone);
      } else {
        date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond));
      }
    }
    return date;
  }

  function floorDivision(value, divisor) {
    let quotient = value / divisor;
    if (value < 0n && value % divisor !== 0n) {
      quotient -= 1n;
    }
    return quotient;
  }

  function parseNumeric(value) {
    const signless = value.replace(/^[+-]/, '');
    let multiplier = 1000000n;
    let type = 'unixMilliseconds';
    let precisionDigits = 3;
    if (signless.length <= 10) {
      multiplier = 1000000000n; type = 'unixSeconds'; precisionDigits = 0;
    } else if (signless.length <= 13) {
      multiplier = 1000000n; type = 'unixMilliseconds'; precisionDigits = 3;
    } else if (signless.length <= 16) {
      multiplier = 1000n; type = 'unixMicroseconds'; precisionDigits = 6;
    } else {
      multiplier = 1n; type = 'unixNanoseconds'; precisionDigits = 9;
    }
    const epochNanoseconds = BigInt(value) * multiplier;
    const milliseconds = floorDivision(epochNanoseconds, 1000000n);
    const numericMilliseconds = Number(milliseconds);
    const date = new Date(numericMilliseconds);
    const fractionNanoseconds = ((epochNanoseconds % 1000000000n) + 1000000000n) % 1000000000n;
    const fraction = precisionDigits > 0 ? fractionNanoseconds.toString().padStart(9, '0').slice(0, precisionDigits) : '';
    const ok = Number.isSafeInteger(numericMilliseconds) && validDate(date);
    return { ok, date, type, fraction, precisionDigits, precisionLoss: precisionDigits > 3 };
  }

  function parseIsoLike(value, config) {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})([.,](\d{1,9}))?)?)?(Z|[+-]\d{2}:?\d{2})?$/i);
    let result = { ok: false, date: null, type: 'unknown', fraction: '', precisionDigits: 0, precisionLoss: false };
    if (match) {
      const fraction = match[8] || '';
      const parts = {
        year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: Number(match[4] || 0), minute: Number(match[5] || 0), second: Number(match[6] || 0), millisecond: Number(fraction.slice(0, 3).padEnd(3, '0') || 0),
      };
      const date = dateFromParts(parts, config, match[9] || '');
      let type = match[7] && match[7].startsWith(',') ? 'javaDateTime' : 'dateTime';
      if (match[9]) {
        type = 'isoWithZone';
      } else if (config.naiveMode === 'zone') {
        type = 'naiveZone';
      } else if (config.naiveMode === 'local') {
        type = 'naiveLocal';
      } else {
        type = 'naiveUtc';
      }
      if (match[7] && match[7].startsWith(',')) {
        type = 'javaDateTime';
      }
      result = { ok: validDate(date), date, type, fraction, precisionDigits: fraction.length, precisionLoss: fraction.length > 3 };
    }
    return result;
  }

  function parseApache(value, config) {
    const match = value.match(/^(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{2})(\d{2})$/);
    let result = { ok: false, date: null, type: 'apache', fraction: '', precisionDigits: 0, precisionLoss: false };
    if (match && MONTHS[match[2]]) {
      const parts = { year: Number(match[3]), month: MONTHS[match[2]], day: Number(match[1]), hour: Number(match[4]), minute: Number(match[5]), second: Number(match[6]), millisecond: 0 };
      const date = dateFromParts(parts, config, match[7] + ':' + match[8]);
      result = { ...result, ok: validDate(date), date };
    }
    return result;
  }

  function parseRfc2822(value) {
    const pattern = new RegExp('^(?:' + RFC_DAYS + ',\\s+)?\\d{1,2}\\s+' + RFC_MONTHS + '\\s+\\d{4}\\s+\\d{2}:\\d{2}(?::\\d{2})?\\s+(?:GMT|UTC|[+-]\\d{4})$', 'i');
    const date = pattern.test(value) ? new Date(value) : new Date(NaN);
    return { ok: validDate(date), date, type: 'rfc2822', fraction: '', precisionDigits: 0, precisionLoss: false };
  }

  function parseSyslog(value, config) {
    const match = value.match(/^([A-Za-z]{3})\s{1,2}(\d{1,2}) (\d{2}):(\d{2}):(\d{2})$/);
    let result = { ok: false, date: null, type: 'syslog', fraction: '', precisionDigits: 0, precisionLoss: false, needsYear: true };
    if (match && MONTHS[match[1]] && config.syslogYear) {
      const parts = { year: config.syslogYear, month: MONTHS[match[1]], day: Number(match[2]), hour: Number(match[3]), minute: Number(match[4]), second: Number(match[5]), millisecond: 0 };
      const date = dateFromParts(parts, config, '');
      result = { ...result, ok: validDate(date), date, needsYear: false };
    }
    return result;
  }

  function parseTimestamp(input, options) {
    const value = String(input == null ? '' : input).trim();
    const config = normalizeConfig(options);
    let result = { ok: false, date: null, type: 'unknown', fraction: '', precisionDigits: 0, precisionLoss: false };
    if (/^[+-]?\d{1,19}$/.test(value)) {
      result = parseNumeric(value);
    } else if (/^\d{2}\/[A-Za-z]{3}\/\d{4}:/.test(value)) {
      result = parseApache(value, config);
    } else if (new RegExp('^(?:' + RFC_DAYS + ',\\s+)?\\d{1,2}\\s+' + RFC_MONTHS + '\\s+\\d{4}', 'i').test(value)) {
      result = parseRfc2822(value);
    } else if (/^[A-Za-z]{3}\s{1,2}\d{1,2} \d{2}:\d{2}:\d{2}$/.test(value)) {
      result = parseSyslog(value, config);
    } else {
      result = parseIsoLike(value, config);
    }
    return result;
  }

  function getZoneParts(date, timeZone, locale) {
    const formatter = new Intl.DateTimeFormat(locale || 'en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'shortOffset',
    });
    const values = {};
    formatter.formatToParts(date).forEach(function (part) {
      if (part.type !== 'literal') {
        values[part.type] = part.value;
      }
    });
    return values;
  }

  function formatInZone(date, timeZone, locale) {
    const parts = getZoneParts(date, timeZone, locale);
    return parts.year + '-' + parts.month + '-' + parts.day + ' ' + parts.hour + ':' + parts.minute + ':' + parts.second + ' ' + (parts.timeZoneName || 'UTC');
  }

  function formatParsedInZone(parsed, timeZone, locale) {
    const parts = getZoneParts(parsed.date, timeZone, locale);
    const fraction = parsed.fraction ? '.' + parsed.fraction : '';
    return parts.year + '-' + parts.month + '-' + parts.day + ' ' + parts.hour + ':' + parts.minute + ':' + parts.second + fraction + ' ' + (parts.timeZoneName || 'UTC');
  }

  function formatIso(parsed) {
    const base = parsed.date.toISOString();
    let value = base;
    if (parsed.fraction) {
      value = base.slice(0, 19) + '.' + parsed.fraction + 'Z';
    }
    return value;
  }

  function formatRelative(date, now, locale) {
    const base = now instanceof Date ? now : new Date();
    const seconds = Math.round((date.getTime() - base.getTime()) / 1000);
    const absolute = Math.abs(seconds);
    let unit = 'second';
    let divisor = 1;
    if (absolute >= 31536000) { unit = 'year'; divisor = 31536000; }
    else if (absolute >= 2592000) { unit = 'month'; divisor = 2592000; }
    else if (absolute >= 86400) { unit = 'day'; divisor = 86400; }
    else if (absolute >= 3600) { unit = 'hour'; divisor = 3600; }
    else if (absolute >= 60) { unit = 'minute'; divisor = 60; }
    return new Intl.RelativeTimeFormat(locale || 'en', { numeric: 'auto' }).format(Math.round(seconds / divisor), unit);
  }

  function candidatePattern() {
    const rfc = '(?:' + RFC_DAYS + ',\\s+)?\\d{1,2}\\s+' + RFC_MONTHS + '\\s+\\d{4}\\s+\\d{2}:\\d{2}(?::\\d{2})?\\s+(?:GMT|UTC|[+-]\\d{4})';
    return new RegExp('\\b\\d{2}/[A-Za-z]{3}/\\d{4}:\\d{2}:\\d{2}:\\d{2} [+-]\\d{4}\\b|' + rfc + '|\\b[A-Za-z]{3}\\s{1,2}\\d{1,2} \\d{2}:\\d{2}:\\d{2}\\b|\\b\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}(?::\\d{2}(?:[.,]\\d{1,9})?)?(?:Z|[+-]\\d{2}:?\\d{2})?\\b|(?<!\\d)[+-]?(?:\\d{19}|\\d{16}|\\d{13}|\\d{10})(?!\\d)', 'gi');
  }

  function numericHasContext(source, offset) {
    const prefix = source.slice(Math.max(0, offset - 40), offset);
    return /(?:timestamp|epoch|created[_-]?at|updated[_-]?at|time|ts|iat|exp|nbf)\s*[=:]\s*$/i.test(prefix);
  }

  function convertLog(text, options) {
    const config = options || {};
    const timeZone = config.timeZone || 'UTC';
    const locale = config.locale || 'en-CA';
    const numericMode = config.numericMode === 'all' ? 'all' : 'contextual';
    const typeLabels = config.typeLabels || {};
    let count = 0;
    let skippedNumeric = 0;
    let missingSyslogYear = 0;
    const source = String(text == null ? '' : text);
    const output = source.replace(candidatePattern(), function (match, offset) {
      const numeric = /^[+-]?\d+$/.test(match);
      const hasContext = !numeric || numericMode === 'all' || numericHasContext(source, offset);
      const parsed = parseTimestamp(match, config);
      let replacement = match;
      if (!hasContext) {
        skippedNumeric += 1;
      } else if (parsed.ok) {
        count += 1;
        replacement = match + ' → ' + formatParsedInZone(parsed, timeZone, locale) + ' [' + (typeLabels[parsed.type] || parsed.type) + ']';
      } else if (parsed.type === 'syslog' && parsed.needsYear) {
        missingSyslogYear += 1;
      }
      return replacement;
    });
    return { output, count, skippedNumeric, missingSyslogYear };
  }

  function supportedTimeZones() {
    let zones = [];
    if (typeof Intl.supportedValuesOf === 'function') {
      zones = Intl.supportedValuesOf('timeZone');
    } else {
      zones = ['UTC', 'Asia/Taipei', 'Asia/Tokyo', 'Asia/Singapore', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney'];
    }
    if (!zones.includes('UTC')) {
      zones.unshift('UTC');
    }
    return zones;
  }

  return { convertLog, formatInZone, formatIso, formatParsedInZone, formatRelative, parseTimestamp, supportedTimeZones, validTimeZone };
}));
