'use strict';

const assert = require('node:assert/strict');
const core = require('./core.js');

function parsed(input, options) {
  const result = core.parseTimestamp(input, options);
  assert.equal(result.ok, true, input + ' should parse');
  return result;
}

assert.equal(parsed('1767225600').date.toISOString(), '2026-01-01T00:00:00.000Z');
assert.equal(parsed('1767225600000').date.toISOString(), '2026-01-01T00:00:00.000Z');
assert.equal(core.formatIso(parsed('1767225600123456')), '2026-01-01T00:00:00.123456Z');
assert.equal(core.formatIso(parsed('1767225600123456789')), '2026-01-01T00:00:00.123456789Z');
assert.equal(core.formatIso(parsed('2026-01-01T00:00:00.123456789Z')), '2026-01-01T00:00:00.123456789Z');
assert.equal(parsed('2026-01-01T08:00:00+08:00').date.toISOString(), '2026-01-01T00:00:00.000Z');
assert.equal(parsed('2026-01-01 09:00:00', { naiveMode: 'zone', sourceTimeZone: 'Asia/Tokyo' }).date.toISOString(), '2026-01-01T00:00:00.000Z');
assert.equal(parsed('01/Jan/2026:08:00:00 +0800').date.toISOString(), '2026-01-01T00:00:00.000Z');
assert.equal(parsed('2026-01-01 08:00:00,123', { naiveMode: 'utc' }).type, 'javaDateTime');
assert.equal(parsed('Thu, 01 Jan 2026 00:00:00 GMT').date.toISOString(), '2026-01-01T00:00:00.000Z');
assert.equal(core.parseTimestamp('Jan  1 08:00:00', { naiveMode: 'utc' }).ok, false);
assert.equal(parsed('Jan  1 08:00:00', { naiveMode: 'utc', syslogYear: 2026 }).date.toISOString(), '2026-01-01T08:00:00.000Z');
assert.equal(core.parseTimestamp('2026-02-30T00:00:00Z').ok, false);
assert.equal(core.parseTimestamp('2026-01-01T00:00:00+14:01').ok, false);
assert.equal(core.parseTimestamp('2026-01-01T00:00:00+25:00').ok, false);
assert.equal(core.parseTimestamp('Jan 1 08:00:00').ok, false);
assert.equal(core.parseTimestamp('not-a-time').ok, false);

const mixedLog = core.convertLog('time=1767225600\norder=1767225600000\n2026-01-01 08:00:00,123 ready\nThu, 01 Jan 2026 00:00:00 GMT mail', {
  timeZone: 'Asia/Taipei', naiveMode: 'utc', numericMode: 'contextual', typeLabels: { unixSeconds: 'Unix s', javaDateTime: 'Java', rfc2822: 'RFC' },
});
assert.equal(mixedLog.count, 3);
assert.equal(mixedLog.skippedNumeric, 1);
assert.match(mixedLog.output, /16:00:00\.123/);
assert.match(mixedLog.output, /\[Java\]/);
assert.match(mixedLog.output, /\[RFC\]/);

const syslogWithoutYear = core.convertLog('Jan  1 08:00:00 host ready', { timeZone: 'UTC' });
assert.equal(syslogWithoutYear.count, 0);
assert.equal(syslogWithoutYear.missingSyslogYear, 1);

const syslogWithYear = core.convertLog('Jan  1 08:00:00 host ready', { timeZone: 'Asia/Taipei', naiveMode: 'utc', syslogYear: 2026 });
assert.equal(syslogWithYear.count, 1);
assert.match(syslogWithYear.output, /2026-01-01 16:00:00/);

assert.equal(core.validTimeZone('Asia/Taipei'), true);
assert.equal(core.validTimeZone('Mars/Olympus'), false);
assert.match(core.formatParsedInZone(parsed('2026-01-01T00:00:00.123456789Z'), 'America/New_York'), /2025-12-31 19:00:00\.123456789 GMT-5/);
console.log('timestamp-converter P0: 29 checks passed');
