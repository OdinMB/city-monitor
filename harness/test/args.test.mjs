import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkPagePath, parseArgs, parseViewport, USAGE, UsageError, validateSteps } from '../lib/args.mjs';
import { MAP_STYLE_NAMES } from '../lib/map-style.mjs';
import { SCENARIO_NAMES } from '../lib/scenarios.mjs';

describe('parseArgs', () => {
  it('needs --out', () => assert.throws(() => parseArgs([]), UsageError));

  it('fills the defaults', () => {
    const args = parseArgs(['--out', '/tmp/o']);
    assert.equal(args.city, 'berlin');
    assert.deepEqual(args.paths, ['/berlin']);
    assert.deepEqual(args.viewports, [{ width: 1440, height: 900 }]);
    assert.deepEqual(args.langs, ['de']);
    assert.deepEqual(args.themes, ['light']);
    assert.equal(args.seed, 1);
    assert.equal(args.scenario, 'default');
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

  it('takes one scenario by name and refuses others with the list', () => {
    for (const name of SCENARIO_NAMES) {
      assert.equal(parseArgs(['--out', 'o', '--scenario', name]).scenario, name);
      assert.equal(parseArgs(['--out', 'o', `--scenario=${name}`]).scenario, name);
    }
    for (const bad of ['hurricane', 'Quiet', 'quiet,storm', '__proto__']) {
      assert.throws(() => parseArgs(['--out', 'o', '--scenario', bad]), (err) => err instanceof UsageError
        && err.message === `--scenario ${bad}: use one of ${SCENARIO_NAMES.join(', ')}`, bad);
    }
    assert.throws(() => parseArgs(['--out', 'o', '--scenario', 'quiet', '--scenario', 'storm']), /given twice/);
    assert.throws(() => parseArgs(['--out', 'o', '--scenario']), /needs a value/);
    assert.match(USAGE, new RegExp(`--scenario <name> .*${SCENARIO_NAMES.join(' \\| ')}`));
  });

  it('takes a configured city, whose dashboard is then the default page', () => {
    for (const argv of [['--city', 'hamburg'], ['--city=hamburg']]) {
      const args = parseArgs(['--out', 'o', ...argv]);
      assert.equal(args.city, 'hamburg');
      assert.deepEqual(args.paths, ['/hamburg']);
    }
    assert.deepEqual(parseArgs(['--out', 'o', '--city', 'berlin']).paths, ['/berlin']);
    const explicit = parseArgs(['--out', 'o', '--city', 'hamburg', '--path', '/hamburg/sources', '--path', '/berlin']);
    assert.deepEqual(explicit.paths, ['/hamburg/sources', '/berlin'], 'given paths are kept as given');
  });

  it('refuses a city both packages do not register, with the list', () => {
    for (const bad of ['atlantis', 'Hamburg', 'berlin,hamburg', '__proto__', 'constructor', '../berlin', '']) {
      assert.throws(() => parseArgs(['--out', 'o', `--city=${bad}`]), (err) => err instanceof UsageError
        && err.message.startsWith(`--city ${bad}: use one of berlin, hamburg (`), JSON.stringify(bad));
    }
    assert.throws(() => parseArgs(['--out', 'o', '--city']), /needs a value/);
    assert.throws(() => parseArgs(['--out', 'o', '--city', 'berlin', '--city', 'hamburg']), /given twice/);
    assert.throws(() => parseArgs(['--out', 'o', '--city', '--path', '/x']), /needs a value/);
  });

  it('checks the city against the list it is given', () => {
    assert.equal(parseArgs(['--out', 'o', '--city', 'teststadt'], { cities: ['teststadt'] }).city, 'teststadt');
    assert.throws(() => parseArgs(['--out', 'o'], { cities: ['hamburg'] }), /--city berlin: use one of hamburg /, 'the default too');
    assert.throws(() => parseArgs(['--out', 'o', '--city', 'hamburg'], { cities: [] }), UsageError);
    assert.match(USAGE, /--city <id> .*default berlin/);
    assert.match(USAGE, /--path <path> .*default \/<city>/);
  });

  it('takes a map style by name, local by default, and refuses others with the list', () => {
    assert.equal(parseArgs(['--out', 'o']).mapStyle, 'local');
    for (const mode of MAP_STYLE_NAMES) {
      assert.equal(parseArgs(['--out', 'o', '--map-style', mode]).mapStyle, mode);
      assert.equal(parseArgs(['--out', 'o', `--map-style=${mode}`]).mapStyle, mode);
    }
    for (const bad of ['offline', 'Fail', 'fail,local', '__proto__', '']) {
      assert.throws(() => parseArgs(['--out', 'o', `--map-style=${bad}`]), (err) => err instanceof UsageError
        && err.message === `--map-style ${bad}: use one of ${MAP_STYLE_NAMES.join(', ')}`, JSON.stringify(bad));
    }
    assert.throws(() => parseArgs(['--out', 'o', '--map-style', 'fail', '--map-style', 'local']), /given twice/);
    assert.throws(() => parseArgs(['--out', 'o', '--map-style']), /needs a value/);
    assert.match(USAGE, new RegExp(`--map-style <mode> .*${MAP_STYLE_NAMES.join(' \\| ')} \\(default local\\)`));
  });

  it('keeps the new options apart from the scenario and the guard test', () => {
    const args = parseArgs(['--out', 'o', '--scenario', 'frost', '--map-style', 'fail-once', '--guard-test=env']);
    assert.deepEqual([args.scenario, args.mapStyle, args.guardTest], ['frost', 'fail-once', 'env']);
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

  it('accepts a swipe on the viewport or on an element, with one finger or two', () => {
    const steps = validateSteps([
      { action: 'swipe', from: [300, 500], to: [60, 500] },
      { action: 'swipe', selector: '[data-testid=map-container]', from: [200, 150], to: [200, 40], fingers: 2, ms: 600 },
      { action: 'swipe', text: 'News', nth: 1, from: [0, 0], to: [7680, 7680], fingers: 1, ms: 0, timeout: 5000 },
      { action: 'swipe', from: [10.5, 20.25], to: [11, 20.25], ms: 10_000 },
    ]);
    assert.equal(steps.length, 4);
    assert.deepEqual(steps[1].from, [200, 150]);
  });

  it('refuses a swipe it cannot run, and swipe fields on other actions', () => {
    const bad = [
      { action: 'swipe' },
      { action: 'swipe', from: [1, 2] },
      { action: 'swipe', to: [1, 2] },
      { action: 'swipe', from: [1, 2], to: [1, 2] },
      { action: 'swipe', from: [1], to: [1, 2] },
      { action: 'swipe', from: [1, 2, 3], to: [1, 2] },
      { action: 'swipe', from: { x: 1, y: 2 }, to: [3, 4] },
      { action: 'swipe', from: ['1', 2], to: [3, 4] },
      { action: 'swipe', from: [-1, 2], to: [3, 4] },
      { action: 'swipe', from: [1, 2], to: [7681, 4] },
      { action: 'swipe', from: [1, 2], to: [Number.NaN, 4] },
      { action: 'swipe', from: [1, 2], to: [3, 4], fingers: 3 },
      { action: 'swipe', from: [1, 2], to: [3, 4], fingers: 0 },
      { action: 'swipe', from: [1, 2], to: [3, 4], fingers: '2' },
      { action: 'swipe', from: [1, 2], to: [3, 4], ms: -1 },
      { action: 'swipe', from: [1, 2], to: [3, 4], ms: 10_001 },
      { action: 'swipe', from: [1, 2], to: [3, 4], ms: 1.5 },
      { action: 'swipe', from: [1, 2], to: [3, 4], selector: 'a', text: 'b' },
      { action: 'swipe', from: [1, 2], to: [3, 4], direction: 'left' },
      { action: 'tap', text: 'x', from: [1, 2] },
      { action: 'click', selector: 'a', fingers: 2 },
      { action: 'wait', ms: 5, to: [1, 2] },
    ];
    for (const step of bad) assert.throws(() => validateSteps([step]), UsageError, JSON.stringify(step));
  });
});
