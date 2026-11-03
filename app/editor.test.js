const { test } = require('node:test');
const assert = require('node:assert/strict');
const { safeName, validate } = require('./editor');
test('unsafe names are sanitized', () => assert.equal(safeName('话题:/?'), '话题'));
test('invalid cuts are rejected before rendering', () => assert.throws(() => validate({ topics: [{ topic: 'x', title: 'y', description: 'z', segments: [{ source: 'a.mp4', start: 5, end: 2 }] }] }, __dirname, 'out'), /切点无效/));
