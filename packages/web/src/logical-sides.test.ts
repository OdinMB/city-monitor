import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'tailwindcss';
import ts from 'typescript';

/**
 * In Arabic the page runs right to left (App sets <html dir="rtl">), and only
 * logical sides mirror: ms-/me-, ps-/pe-, inset-s-/inset-e-, border-s/-e,
 * rounded-s/-e, text-start/-end, and margin-inline-start and the like in popup
 * HTML. A physical side (ml-, right-0, text-left, margin-left) stays where it
 * is and puts things on the wrong side of the mirrored layout, or off screen.
 *
 * This reads every class string and inline style in the web source (tests
 * aside) and fails on a physical left or right side that is not listed below
 * with the reason it has to stay physical. jsdom does no layout, so no
 * rendering test can see the difference.
 *
 * A logical side is not enough on an inline element inside running text. Its
 * margin follows the element's own direction (right to left, inherited from
 * the page), while the bidi algorithm places it by the text around it. Next to
 * German or a number with a Latin unit, which runs left to right, ms-1.5 then
 * lands on the outer side and the words run together ("Tegeler See15.5°C").
 * So such an element has to sit in an isolated run (an ancestor with `dir`,
 * a <bdi>, <Ltr>), or be listed below because the text around it is
 * translated and runs in the page's direction.
 */

const SRC = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/** Physical-side utilities, once variants (sm:, dark:, @xs:) and a leading - or ! are removed. */
const PHYSICAL_CLASS =
  /^(?:m[lr]|p[lr]|left|right|border-[lr]|rounded-(?:[lr]|[tb][lr])|scroll-[mp][lr])(?:-|$)|^(?:text|float|clear)-(?:left|right)$/;

/** Logical-side utilities, checked against Tailwind so a misspelt one fails instead of doing nothing. */
const LOGICAL_CLASS = /^(?:m[se]|p[se]|inset-[se]|border-[se]|rounded-(?:[se]|[se][se]))(?:-|$)|^text-(?:start|end)$/;

/** Physical sides written as CSS in a string, as popup HTML does. */
const PHYSICAL_CSS = /\b(?:margin|padding|border)-(?:left|right)\b|text-align\s*:\s*(?:left|right)\b|(?:^|[\s;"'])(?:left|right)\s*:/g;

/** Physical sides in a React style object. */
const PHYSICAL_STYLE_KEY = /^(?:left|right|(?:margin|padding|border)(?:Left|Right)\w*)$/;

/** Sides that stay physical on purpose, each with its reason. */
const DELIBERATELY_PHYSICAL: { file: string; found: string; reason: string }[] = [
  {
    file: 'components/layout/TopBar.tsx',
    found: 'left-1/2',
    reason: 'centres the city name: left-1/2 with -translate-x-1/2 lands in the middle in either direction',
  },
  {
    file: 'components/layout/ScrollIndicator.tsx',
    found: 'mr-[45%]',
    reason: 'keeps its place over the skyline picture, which is the same picture in every language',
  },
  {
    file: 'components/strips/CrisisStrip.tsx',
    found: 'text-right',
    reason: 'region numbers in a fixed-width column line up on their last digit in either direction',
  },
];

/**
 * Inline elements with a logical margin or padding in running text that are
 * not isolated, each with the reason the text around them runs in the page's
 * direction.
 */
const IN_PAGE_DIRECTION: { file: string; found: string; reason: string }[] = [
  {
    file: 'components/layout/ShortcutToast.tsx',
    found: 'me-1.5',
    reason: 'the key comes before the translated hint, which runs in the page direction',
  },
  {
    file: 'components/strips/CouncilMeetingsStrip.tsx',
    found: 'ms-2',
    reason: 'the count follows the day heading, which is written in the UI language',
  },
  {
    file: 'components/strips/WaterLevelStrip.tsx',
    found: 'ms-1.5',
    reason: 'the tidal badge holds translated text, so it runs in the page direction beside the station name',
  },
  {
    file: 'components/map/layers/water.ts',
    found: 'margin-inline-start:4px',
    reason: 'the off-season badge is an inline-block with translated text, placed as one character in the page direction',
  },
  {
    file: 'components/map/layers/emergencies.ts',
    found: 'margin-inline-start:4px',
    reason: 'the indoor/outdoor badge follows the translated title',
  },
  {
    file: 'components/map/layers/air-quality.ts',
    found: '<a href=',
    reason: 'the link holds only an inline-block icon, placed as one character in the page direction after the station name',
  },
];

/** Elements that flow inline, so the bidi algorithm places them among the text. */
const INLINE_TAGS = new Set(['a', 'abbr', 'b', 'bdi', 'button', 'code', 'em', 'i', 'img', 'kbd', 'label', 'mark', 'small', 'span', 'strong', 'sub', 'sup', 'svg', 'time', 'Ltr']);

/** Utilities that take an element out of the line. */
const NOT_INLINE = /^(?:block|flex|grid|table|contents|absolute|fixed)$/;

/** A margin or padding on the inline axis. */
const INLINE_SIDE = /^(?:m[se]|p[se])-/;

/** The same on an inline element in popup HTML. */
const POPUP_INLINE_SIDE = /<(?:a|b|bdi|em|small|span|strong)\b[^>]*?(?:margin|padding)-inline-(?:start|end)[^;"]*/g;

/** Every non-test .ts/.tsx file under src. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'test-fixtures' ? [] : sourceFiles(path);
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name) || entry.name === 'test-setup.ts') return [];
    return [path];
  });
}

const relPath = (path: string) => relative(SRC, path).split(sep).join('/');

/** The utility itself, without its variants (sm:, dark:, @xs:) and a leading - or !. */
const utility = (token: string) => token.split(':').pop()!.replace(/^[!-]+/, '').replace(/!$/, '');

interface Scan {
  /** Every string literal and template part. */
  strings: string[];
  /** Keys of object literals passed as a JSX `style`. */
  styleKeys: string[];
  /** The class strings of elements with dir="auto". */
  ownDirectionClasses: string[];
  /** Inline elements with a logical margin or padding that sit among other inline content, in JSX or popup HTML. */
  inRunningText: { element: string; isolated: boolean }[];
}

type JsxTag = ts.JsxElement | ts.JsxSelfClosingElement;

function scanSource(path: string, text: string): Scan {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const result: Scan = { strings: [], styleKeys: [], ownDirectionClasses: [], inRunningText: [] };

  const opening = (node: JsxTag) => (ts.isJsxElement(node) ? node.openingElement : node);
  const tagOf = (node: JsxTag) => opening(node).tagName.getText(source);
  const attrOf = (node: JsxTag, name: string) =>
    opening(node).attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText(source) === name) as ts.JsxAttribute | undefined;
  const classesOf = (node: JsxTag) => attrOf(node, 'className')?.initializer?.getText(source) ?? '';
  const utilitiesOf = (node: JsxTag) => classesOf(node).split(/[\s"'`{}]+/).map(utility).filter(Boolean);
  const isInline = (node: JsxTag) => INLINE_TAGS.has(tagOf(node)) && !utilitiesOf(node).some((u) => NOT_INLINE.test(u));

  /** The element or fragment whose children hold this node, and the child that does. */
  const flowParent = (node: ts.Node): { parent: ts.JsxElement | ts.JsxFragment; child: ts.Node } | undefined => {
    let child = node;
    for (let cur = node.parent; cur; child = cur, cur = cur.parent) {
      if (ts.isJsxAttribute(cur)) return undefined; // passed as a prop, not laid out here
      if (ts.isJsxElement(cur) || ts.isJsxFragment(cur)) return { parent: cur, child };
    }
    return undefined;
  };

  /** Whether an ancestor isolates the run this element sits in, so its direction is the run's. */
  const isolated = (node: ts.Node) => {
    for (let cur = node.parent; cur; cur = cur.parent) {
      if (ts.isJsxElement(cur) && (['bdi', 'Ltr'].includes(tagOf(cur)) || attrOf(cur, 'dir'))) return true;
    }
    return false;
  };

  /** Whether popup markup is passed through `ltr()`, which wraps it in <bdi dir="ltr">. */
  const insideLtr = (node: ts.Node) => {
    for (let cur = node.parent; cur; cur = cur.parent) {
      if (ts.isCallExpression(cur) && cur.expression.getText(source) === 'ltr') return true;
    }
    return false;
  };

  const inRunningText = (node: JsxTag) => {
    if (!isInline(node) || !utilitiesOf(node).some((u) => INLINE_SIDE.test(u))) return false;
    const flow = flowParent(node);
    if (!flow) return false;
    const { parent, child } = flow;
    // A flex or grid container orders its items by its own direction, not by bidi.
    if (ts.isJsxElement(parent) && utilitiesOf(parent).some((u) => /^(?:inline-)?(?:flex|grid)$/.test(u))) return false;
    return parent.children.some((c) => c !== child && (
      ts.isJsxText(c) ? c.text.trim() !== ''
        : ts.isJsxExpression(c) ? !!c.expression
          : ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c) ? isInline(c)
            : true
    ));
  };

  const visit = (node: ts.Node) => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      result.strings.push(node.text);
    }
    if (ts.isJsxAttribute(node) && node.name.getText(source) === 'style') {
      const expr = node.initializer && ts.isJsxExpression(node.initializer) ? node.initializer.expression : undefined;
      if (expr && ts.isObjectLiteralExpression(expr)) {
        for (const prop of expr.properties) if (prop.name) result.styleKeys.push(prop.name.getText(source));
      }
    }
    if (ts.isJsxAttributes(node)) {
      const attr = (name: string) => node.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText(source) === name) as ts.JsxAttribute | undefined;
      const dir = attr('dir')?.initializer;
      const className = attr('className')?.initializer;
      if (dir && ts.isStringLiteral(dir) && dir.text === 'auto' && className) result.ownDirectionClasses.push(className.getText(source));
    }
    if ((ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) && inRunningText(node)) {
      result.inRunningText.push({ element: `<${tagOf(node)} className=${classesOf(node)}>`, isolated: isolated(node) });
    }
    if (ts.isTemplateExpression(node) || ts.isStringLiteralLike(node)) {
      // The literal parts only: markup built inside a ${…} is its own node.
      const html = ts.isTemplateExpression(node)
        ? node.head.text + node.templateSpans.map((s) => `\${}${s.literal.text}`).join('')
        : node.text;
      for (const match of html.matchAll(POPUP_INLINE_SIDE)) {
        result.inRunningText.push({ element: match[0], isolated: insideLtr(node) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return result;
}

const scan = (path: string) => scanSource(path, readFileSync(path, 'utf8'));

/** Every physical side in one file: class tokens, CSS in strings and style-object keys. */
function physicalSides({ strings, styleKeys }: Scan): string[] {
  return [
    ...strings.flatMap((s) => s.split(/\s+/).map(utility).filter((u) => PHYSICAL_CLASS.test(u))),
    ...strings.flatMap((s) => [...s.matchAll(PHYSICAL_CSS)].map((m) => m[0].replace(/^[\s;"']/, '').trim())),
    ...styleKeys.filter((k) => PHYSICAL_STYLE_KEY.test(k)).map((k) => `style.${k}`),
  ];
}

const FILES = sourceFiles(SRC).map((path) => ({ file: relPath(path), scan: scan(path) }));

describe('logical sides in the web source', () => {
  const found = FILES.flatMap(({ file, scan }) => physicalSides(scan).map((side) => `${file}: ${side}`));
  const allowed = DELIBERATELY_PHYSICAL.map((d) => `${d.file}: ${d.found}`);

  it('has no physical left or right side except the deliberate ones', () => {
    expect(found.filter((f) => !allowed.includes(f))).toEqual([]);
  });

  it('lists only deliberate sides that are still there', () => {
    expect(allowed.filter((a) => !found.includes(a))).toEqual([]);
  });

  it('scans the files that had physical sides', () => {
    // A guard on the guard: if the walk stopped finding files, the first test
    // would pass on nothing.
    expect(FILES.map((f) => f.file)).toEqual(expect.arrayContaining([
      'components/strips/PoliticalStrip.tsx',
      'components/sidebar/MobileLayerDrawer.tsx',
      'components/map/layers/transit.ts',
    ]));
  });

  it('puts no logical side on an element that runs in its own direction (dir="auto")', () => {
    // There ms-auto or text-end follow the text's direction, not the page's:
    // a German name in an Arabic row would be pushed the wrong way.
    const offenders = FILES.flatMap(({ file, scan }) => scan.ownDirectionClasses
      .filter((classes) => classes.split(/[\s"'`{}]+/).some((token) => LOGICAL_CLASS.test(utility(token))))
      .map((classes) => `${file}: ${classes}`));
    expect(offenders).toEqual([]);
    expect(FILES.some(({ scan }) => scan.ownDirectionClasses.length > 0)).toBe(true);
  });

  it('isolates the run around a logical margin on an inline element in running text', () => {
    const listed = (entry: string) => IN_PAGE_DIRECTION.some((a) => entry.startsWith(`${a.file}: `) && entry.includes(a.found));
    const unisolated = FILES.flatMap(({ file, scan }) => scan.inRunningText
      .filter((e) => !e.isolated)
      .map((e) => `${file}: ${e.element}`));
    expect(unisolated.filter((e) => !listed(e))).toEqual([]);
    expect(IN_PAGE_DIRECTION.filter((a) => !unisolated.some((e) => e.startsWith(`${a.file}: `) && e.includes(a.found)))).toEqual([]);
    // A guard on the guard: the sites this rule was written for are found, isolated.
    const isolatedIn = (file: string) => FILES.find((f) => f.file === file)!.scan.inRunningText.filter((e) => e.isolated);
    expect(isolatedIn('components/strips/BathingStrip.tsx').map((e) => e.element)).toEqual(['<span className="ms-1.5">']);
    expect(isolatedIn('components/strips/AirQualityStrip.tsx').map((e) => e.element)).toEqual([
      '<span className="font-normal text-muted ms-0.5">',
    ]);
    expect(isolatedIn('components/map/layers/air-quality.ts').map((e) => e.element)).toEqual([
      expect.stringContaining('margin-inline-end:4px'),
    ]);
  });

  describe('tells an isolated run from one that is not', () => {
    const inRunningText = (jsx: string) => scanSource('snippet.tsx', `const x = (${jsx});`).inRunningText;

    it('flags a number and its unit in the page direction, and a German name and its value', () => {
      expect(inRunningText('<span>{value}<span className="ms-0.5">µg/m³</span></span>')).toEqual([
        { element: '<span className="ms-0.5">', isolated: false },
      ]);
      expect(inRunningText('<div className="truncate">{name}{temp != null && <span className="ms-1.5">{temp}°C</span>}</div>')).toEqual([
        { element: '<span className="ms-1.5">', isolated: false },
      ]);
    });

    it('accepts the same runs inside <Ltr>, a <bdi> or an element with dir', () => {
      expect(inRunningText('<span><Ltr>{value}<span className="ms-0.5">µg/m³</span></Ltr></span>')).toEqual([
        { element: '<span className="ms-0.5">', isolated: true },
      ]);
      expect(inRunningText('<span dir="auto" className="truncate">{name}<span className="ms-1.5">{temp}°C</span></span>')).toEqual([
        { element: '<span className="ms-1.5">', isolated: true },
      ]);
      expect(inRunningText('<p><bdi>{name}<span className="ms-1">x</span></bdi></p>')).toEqual([
        { element: '<span className="ms-1">', isolated: true },
      ]);
    });

    it('leaves out flex rows, block elements and an element with nothing beside it', () => {
      expect(inRunningText('<div className="flex gap-1">{name}<span className="ms-auto">x</span></div>')).toEqual([]);
      expect(inRunningText('<div>{name}<div className="ms-2">x</div></div>')).toEqual([]);
      expect(inRunningText('<div>{name}<span className="block ms-2">x</span></div>')).toEqual([]);
      expect(inRunningText('<div><span className="ms-2">x</span></div>')).toEqual([]);
    });

    it('does the same for popup HTML, where ltr() isolates the run', () => {
      const swatch = '<span style="width:8px;margin-inline-end:4px"></span><strong>${aqi}</strong>';
      expect(inRunningText(`\`AQI: ${swatch}\``)).toEqual([
        { element: '<span style="width:8px;margin-inline-end:4px', isolated: false },
      ]);
      expect(inRunningText(`\`AQI: \${ltr(\`${swatch}\`)}\``)).toEqual([
        { element: '<span style="width:8px;margin-inline-end:4px', isolated: true },
      ]);
      expect(inRunningText('`<div style="padding-inline-start:8px">${detail}</div>`')).toEqual([]);
    });
  });

  it('mirrors the physical sides that come from CSS it does not own', () => {
    // MapLibre's popup close button and the drawer button's breathing scale
    // are placed physically; globals.css flips them for right-to-left pages.
    const css = readFileSync(join(SRC, 'globals.css'), 'utf8');
    expect(css).toMatch(/\[dir='rtl'\] \.maplibregl-popup-close-button \{\s*right: auto;\s*left: 0;\s*\}/);
    expect(css).toMatch(/\[dir='rtl'\] \.animate-drawer-breathe \{\s*transform-origin: right center;\s*\}/);
  });

  it('uses only logical utilities that Tailwind generates', async () => {
    const candidates = [...new Set(FILES.flatMap(({ scan }) =>
      scan.strings.flatMap((s) => s.split(/\s+/)).filter((token) => LOGICAL_CLASS.test(utility(token))),
    ))];
    expect(candidates.length).toBeGreaterThan(10);

    const compiler = await compile(readFileSync(join(SRC, 'globals.css'), 'utf8'), {
      base: SRC,
      loadStylesheet: async (id, base) => {
        const path = require.resolve(id === 'tailwindcss' ? 'tailwindcss/index.css' : id, { paths: [base] });
        return { path, base: dirname(path), content: readFileSync(path, 'utf8') };
      },
    });
    const css = compiler.build(candidates);
    const escape = (cls: string) => cls.replace(/[^\w-]/g, (ch) => `\\${ch}`);
    expect(candidates.filter((cls) => !css.includes(`.${escape(cls)}`))).toEqual([]);
  });
});
