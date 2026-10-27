import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkPagePath, parseArgs, parseViewport, UsageError, validateSteps } from '../lib/args.mjs';

describe('parseArgs', () => {
  it('needs --out', () => assert.throws(() => parseArgs([]), UsageError));

  it('fills the defaults', () => {
    const args = parseArgs(['--out', '/tmp/o']);
    assert.deepEqual(args.paths, ['/berlin']);
    assert.deepEqual(args.viewports, [{ width: 1440, height: 900 }]);
    assert.deepEqual(args.langs, ['de']);
    assert.deepEqual(args.themes, ['light']);
    assert.equal(args.seed, 1);
    assert.equal(args.scroll, false);
    assert.equal(args.fullPage, false);
    assert.equal(args.timeoutSeconds, 480);
    assert.equal(args.guardTest, undefined);
  });

  it('takes repeated and comma-separated values, and --name=value', () => {
    const args = parseArgs([
      '--out=/tmp/o', '--path', '/berlin', '--path', '/berlin/sources', '--viewport', '390x844,1440x900',
      '--lang', 'en', '--lang=ar', '--theme', 'light,dark', '--seed', '7', '--scroll', '--full-page', '--timeout', '120',
      '--steps', 's.json', '--settle', '0', '--timezone', 'Europe/Istanbul', '--pg-bin', '/pg', '--pg-user', 'pg', '--playwright', '/pw',
    ]);
    assert.deepEqual(args.paths, ['/berlin', '/berlin/sources']);
    assert.deepEqual(args.viewports, [{ width: 390, height: 844 }, { width: 1440, height: 900 }]);
    assert.deepEqual(args.langs, ['en', 'ar']);
    assert.deepEqual(args.themes, ['light', 'dark']);
    assert.equal(args.seed, 7);
    assert.equal(args.scroll, true);
    assert.equal(args.fullPage, true);
    assert.equal(args.timeoutSeconds, 120);
    assert.equal(args.stepsFile, 's.json');
    assert.equal(args.settleMs, 0);
    assert.equal(args.timezone, 'Europe/Istanbul');
    assert.equal(args.pgBin, '/pg');
    assert.equal(args.pgUser, 'pg');
    assert.equal(args.playwright, '/pw');
  });

  it('accepts each guard test case and refuses others', () => {
    for (const c of ['env', 'target', 'target-loopback', 'network']) assert.equal(parseArgs(['--out', 'o', `--guard-test=${c}`]).guardTest, c);
    assert.throws(() => parseArgs(['--out', 'o', '--guard-test=other']), UsageError);
  });

  it('refuses bad values', () => {
    const bad = [
      ['--lang', 'fr'], ['--theme', 'blue'], ['--viewport', 'big'], ['--viewport', '10x10'], ['--seed', '-1'], ['--seed', 'x'],
      ['--timeout', '5'], ['--path', 'https://example.com/'], ['--path', '//example.com/x'], ['--path', 'berlin'],
      ['--unknown'], ['--scroll=yes'], ['--seed'], ['--timezone', '../etc'], ['--pg-user', 'Root;'], ['stray'],
    ];
    for (const extra of bad) assert.throws(() => parseArgs(['--out', 'o', ...extra]), UsageError, extra.join(' '));
    assert.throws(() => parseArgs(['--out', 'o', '--seed', '1', '--seed', '2']), /given twice/);
  });

  it('--help needs nothing else', () => assert.equal(parseArgs(['--help']).help, true));
});

describe('checkPagePath and parseViewport', () => {
  it('keeps paths on the run\'s own server', () => {
    assert.equal(checkPagePath('/berlin?x=1#y'), null);
    assert.notEqual(checkPagePath('/\\example.com'), null);
    assert.notEqual(checkPagePath(undefined), null);
  });
  it('parses WIDTHxHEIGHT', () => assert.deepEqual(parseViewport('390x844'), { width: 390, height: 844 }));
});

describe('validateSteps', () => {
  it('accepts every action', () => {
    const steps = validateSteps([
      { action: 'click', selector: 'button' },
      { action: 'tap', text: 'Wetter', nth: 1 },
      { action: 'hover', text: 'News', exact: true },
      { action: 'wait', ms: 500 },
      { action: 'wait', selector: '[role=dialog]', timeout: 5000 },
      { action: 'scroll-to', text: 'Pollen' },
      { action: 'scroll-to', position: 'bottom' },
      { action: 'press', key: 'Escape' },
      { action: 'goto', path: '/berlin/sources' },
      { action: 'screenshot', name: 'popover-open' },
      { action: 'screenshot', name: 'tile', selector: 'section' },
    ]);
    assert.equal(steps.length, 11);
  });

  it('refuses what it cannot run', () => {
    const bad = [
      {},
      [{ action: 'drag' }],
      [{ action: 'click' }],
      [{ action: 'click', selector: 'a', text: 'b' }],
      [{ action: 'wait' }],
      [{ action: 'press' }],
      [{ action: 'goto', path: 'https://example.com/' }],
      [{ action: 'screenshot' }],
      [{ action: 'screenshot', name: '../x' }],
      [{ action: 'screenshot', name: 'a' }, { action: 'screenshot', name: 'a' }],
      [{ action: 'click', selector: 'a', extra: 1 }],
      [{ action: 'click', selector: 'a', nth: -1 }],
      [{ action: 'scroll-to', position: 'middle' }],
      [{ action: 'click', selector: 'a', timeout: 0 }],
    ];
    for (const steps of bad) assert.throws(() => validateSteps(steps), UsageError, JSON.stringify(steps));
  });
});
