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
 * a <bdi>, <Ltr>, <SourceText>), or be listed below because the text around
 * it is translated and runs in the page's direction.
 *
 * German text from a feed or an official source, and numbers with a unit or
 * a sign, each have one way in (i18n.md → Right-to-left): <SourceText> in JSX
 * and sourceText() in popup HTML for the text, the lib/format-value.ts
 * formatters for the values. The last rules here hold the code to them: no
 * other dir="auto" or bare <bdi>, no feed field rendered outside an isolated
 * run, and no unit typed after a value.
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

/**
 * Files that mark text as running in its own direction some other way than
 * <SourceText> or sourceText(), each with its reason.
 */
const OWN_DIRECTION_IDIOM: { file: string; reason: string }[] = [
  { file: 'components/SourceText.tsx', reason: 'the source-text primitive itself' },
  { file: 'components/map/popups.ts', reason: 'sourceText(), its counterpart for popup HTML' },
  { file: 'components/alerts/NinaBanner.tsx', reason: 'not moved to SourceText yet; each German part already sits in its own <bdi>' },
  { file: 'components/layout/NewsMarquee.tsx', reason: 'not moved to SourceText yet; each German part already sits in its own <bdi>' },
];

/** Properties that hold German text from a feed or an official source. */
const SOURCE_FIELDS = new Set([
  'committee', 'description', 'detail', 'district', 'headline', 'instruction', 'location',
  'message', 'name', 'sourceName', 'station', 'title', 'venue', 'waterBody',
]);

/** Source fields a component renders outside an isolated run, each with its reason. */
const SOURCE_FIELD_IN_PAGE_DIRECTION: { file: string; found: string; reason: string }[] = [
  {
    file: 'components/layout/Shell.tsx',
    found: '{city.name}',
    reason: 'the city name comes from the app config and is written the same in every language',
  },
];

/** A unit typed straight after a value (`{temp}°C`, `{percent}%`) instead of coming from format-value. */
const TYPED_UNIT = /^ ?(?:%|°C?|‰|µg\/m³|(?:mm|cm|km\/h|m³\/s|dB|gc\/L)\b)/;

/** A number and its % or ° typed as JSX text ("(100%)"). */
const TYPED_NUMBER_WITH_UNIT = /\d ?(?:%|°)/;

/** Popup HTML that marks text as running in its own direction: dir="auto", or a <bdi> without dir. */
const POPUP_OWN_DIRECTION = /dir="auto"|<bdi(?![^>]*\bdir=)[^>]*>/g;

/** Elements that isolate the run they hold. */
const ISOLATING_TAGS = ['bdi', 'Ltr', 'SourceText'];

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
  /** The class strings of elements with dir="auto", <SourceText> among them. */
  ownDirectionClasses: string[];
  /** Inline elements with a logical margin or padding that sit among other inline content, in JSX or popup HTML. */
  inRunningText: { element: string; isolated: boolean }[];
  /** Elements and popup HTML that mark text as running in its own direction without <SourceText> or sourceText(). */
  ownDirectionIdiom: string[];
  /** Source fields rendered as JSX children outside an isolated run. */
  unisolatedSourceFields: string[];
  /** Units typed straight after a JSX value. */
  typedUnits: string[];
}

type JsxTag = ts.JsxElement | ts.JsxSelfClosingElement;

function scanSource(path: string, text: string): Scan {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const result: Scan = {
    strings: [], styleKeys: [], ownDirectionClasses: [], inRunningText: [],
    ownDirectionIdiom: [], unisolatedSourceFields: [], typedUnits: [],
  };

  const opening = (node: JsxTag) => (ts.isJsxElement(node) ? node.openingElement : node);
  const tagOf = (node: JsxTag) => opening(node).tagName.getText(source);
  const attrOf = (node: JsxTag, name: string) =>
    opening(node).attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText(source) === name) as ts.JsxAttribute | undefined;
  /** An attribute's value when it is a plain string. */
  const stringAttrOf = (node: JsxTag, name: string) => {
    const value = attrOf(node, name)?.initializer;
    return value && ts.isStringLiteral(value) ? value.text : undefined;
  };
  /** The element the tag renders: <SourceText> renders its `as`, a <bdi> by default. */
  const renderedTag = (node: JsxTag) => (tagOf(node) === 'SourceText' ? stringAttrOf(node, 'as') ?? 'bdi' : tagOf(node));
  const classesOf = (node: JsxTag) => attrOf(node, 'className')?.initializer?.getText(source) ?? '';
  const utilitiesOf = (node: JsxTag) => classesOf(node).split(/[\s"'`{}]+/).map(utility).filter(Boolean);
  const isInline = (node: JsxTag) => INLINE_TAGS.has(renderedTag(node)) && !utilitiesOf(node).some((u) => NOT_INLINE.test(u));

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
      if (ts.isJsxElement(cur) && (ISOLATING_TAGS.includes(tagOf(cur)) || attrOf(cur, 'dir'))) return true;
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
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = tagOf(node);
      const dir = stringAttrOf(node, 'dir');
      if ((dir === 'auto' || tag === 'SourceText') && attrOf(node, 'className')) result.ownDirectionClasses.push(classesOf(node));
      if (dir === 'auto' || (tag === 'bdi' && !attrOf(node, 'dir'))) result.ownDirectionIdiom.push(`<${tag}${dir ? ` dir="${dir}"` : ''}>`);
      if (inRunningText(node)) result.inRunningText.push({ element: `<${tag} className=${classesOf(node)}>`, isolated: isolated(node) });
    }
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
      node.children.forEach((child, i) => {
        const next = node.children[i + 1];
        const unit = next && ts.isJsxText(next) ? TYPED_UNIT.exec(next.text) : null;
        if (ts.isJsxExpression(child) && child.expression && unit) {
          result.typedUnits.push(`{${child.expression.getText(source)}}${unit[0]}`);
        }
        if (ts.isJsxText(child) && TYPED_NUMBER_WITH_UNIT.test(child.text)) result.typedUnits.push(child.text.trim());
      });
    }
    if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      const expr = node.expression;
      if (ts.isPropertyAccessExpression(expr) && SOURCE_FIELDS.has(expr.name.text) && !isolated(node)) {
        result.unisolatedSourceFields.push(`{${expr.getText(source)}}`);
      }
    }
    if (ts.isTemplateExpression(node) || ts.isStringLiteralLike(node)) {
      // The literal parts only: markup built inside a ${…} is its own node.
      const html = ts.isTemplateExpression(node)
        ? node.head.text + node.templateSpans.map((s) => `\${}${s.literal.text}`).join('')
        : node.text;
      for (const match of html.matchAll(POPUP_INLINE_SIDE)) {
        result.inRunningText.push({ element: match[0], isolated: insideLtr(node) });
      }
      for (const match of html.matchAll(POPUP_OWN_DIRECTION)) result.ownDirectionIdiom.push(match[0]);
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

  it('marks text that runs in its own direction only with SourceText or sourceText()', () => {
    const listed = (entry: string) => OWN_DIRECTION_IDIOM.some((a) => entry.startsWith(`${a.file}: `));
    const found = FILES.flatMap(({ file, scan }) => scan.ownDirectionIdiom.map((e) => `${file}: ${e}`));
    expect(found.filter((e) => !listed(e))).toEqual([]);
    expect(OWN_DIRECTION_IDIOM.filter((a) => !found.some((e) => e.startsWith(`${a.file}: `)))).toEqual([]);
  });

  it('renders feed and official text in a component only inside an isolated run', () => {
    const listed = (entry: string) => SOURCE_FIELD_IN_PAGE_DIRECTION.some((a) => entry === `${a.file}: ${a.found}`);
    const found = FILES.filter(({ file }) => file.startsWith('components/'))
      .flatMap(({ file, scan }) => scan.unisolatedSourceFields.map((e) => `${file}: ${e}`));
    expect(found.filter((e) => !listed(e))).toEqual([]);
    expect(SOURCE_FIELD_IN_PAGE_DIRECTION.filter((a) => !found.includes(`${a.file}: ${a.found}`))).toEqual([]);
  });

  it('takes a value with a unit from format-value instead of typing the unit after it', () => {
    // A typed unit is left out of the value's run: in Arabic the % or ° of
    // "{n}%" moves to the number's other side, and a minus with it.
    expect(FILES.flatMap(({ file, scan }) => scan.typedUnits.map((e) => `${file}: ${e}`))).toEqual([]);
  });

  describe('tells the one source-text idiom and format-value from the alternatives', () => {
    const scanOf = (jsx: string) => scanSource('snippet.tsx', `const x = (${jsx});`);

    it('flags dir="auto" and a bare <bdi>, not SourceText or a <bdi> with its own dir', () => {
      expect(scanOf('<p><span dir="auto">{a.title}</span><bdi>{a.station}</bdi></p>').ownDirectionIdiom).toEqual([
        '<span dir="auto">', '<bdi>',
      ]);
      expect(scanOf('<p><SourceText>{a.title}</SourceText><Ltr>{a.phone}</Ltr><bdi dir="ltr">{n}</bdi></p>').ownDirectionIdiom).toEqual([]);
      expect(scanSource('popup.ts', 'const h = `<bdi>${a}</bdi><b dir="auto">${b}</b><bdi dir="ltr">${c}</bdi>`;').ownDirectionIdiom).toEqual([
        '<bdi>', 'dir="auto"',
      ]);
    });

    it('flags a source field outside an isolated run, not inside one or in an attribute', () => {
      expect(scanOf('<p>{alert.headline}</p>').unisolatedSourceFields).toEqual(['{alert.headline}']);
      expect(scanOf('<p><SourceText as="span" className="truncate">{alert.headline}</SourceText></p>').unisolatedSourceFields).toEqual([]);
      expect(scanOf('<p title={alert.headline}>{t(alert.labelKey)} {alert.count}</p>').unisolatedSourceFields).toEqual([]);
    });

    it('flags a unit typed after a value, not a formatted value or translated words', () => {
      expect(scanOf('<span>{spot.waterTemp}°C</span>').typedUnits).toEqual(['{spot.waterTemp}°C']);
      expect(scanOf('<span>{percent}%</span>').typedUnits).toEqual(['{percent}%']);
      expect(scanOf('<span>{level} cm</span>').typedUnits).toEqual(['{level} cm']);
      expect(scanOf('<title>{name}: {amount} (100%)</title>').typedUnits).toEqual(['(100%)']);
      expect(scanOf('<span>{formatDegrees(temp)} {count} {t("more")}</span>').typedUnits).toEqual([]);
    });

    it('reads SourceText as the element it renders, and as isolating its run', () => {
      // Inline as a <bdi> or <span>, so a logical margin on it sits among the text …
      expect(scanOf('<p>{label}<SourceText className="ms-2">{a.name}</SourceText></p>').inRunningText).toEqual([
        { element: '<SourceText className="ms-2">', isolated: false },
      ]);
      // … a block as a <div> or <p>, so it does not.
      expect(scanOf('<p>{label}<SourceText as="div" className="ms-2">{a.name}</SourceText></p>').inRunningText).toEqual([]);
      expect(scanOf('<SourceText as="span" className="truncate">{a.name}<span className="ms-1.5">x</span></SourceText>').inRunningText).toEqual([
        { element: '<span className="ms-1.5">', isolated: true },
      ]);
      expect(scanOf('<SourceText as="span" className="ms-auto truncate">{a.name}</SourceText>').ownDirectionClasses).toEqual([
        '"ms-auto truncate"',
      ]);
    });
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
