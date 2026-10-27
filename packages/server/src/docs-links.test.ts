import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The contributor docs (CONTRIBUTING.md, the pull request template and the
 * issue forms) link into .context/ and to each other's headings. These tests
 * fail when a linked file or heading is renamed or removed, so a newcomer
 * following a link lands where it says. The pull request template and the
 * issue forms are shown outside the repository, so they link with absolute
 * github.com URLs, which are checked against the checkout too.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const REPO_URL = 'https://github.com/OdinMB/city-monitor/';
const ISSUE_TEMPLATES = '.github/ISSUE_TEMPLATE';

const CHECKED_FILES = [
  'CONTRIBUTING.md',
  'README.md',
  '.github/pull_request_template.md',
  ...readdirSync(join(ROOT, '.context')).filter((f) => f.endsWith('.md')).map((f) => `.context/${f}`),
  ...(existsSync(join(ROOT, ISSUE_TEMPLATES)) ? readdirSync(join(ROOT, ISSUE_TEMPLATES)).map((f) => `${ISSUE_TEMPLATES}/${f}`) : []),
];

/** GitHub's anchor for a heading: lower case, punctuation dropped, each space a hyphen. */
function slug(heading: string): string {
  return heading
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/ /g, '-');
}

/** Markdown lines outside fenced code blocks. */
function proseLines(markdown: string): string[] {
  let fenced = false;
  return markdown.split('\n').filter((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return false;
    }
    return !fenced;
  });
}

/** Every anchor a Markdown file's headings get, with GitHub's -1, -2 for repeats. */
function anchors(markdown: string): Set<string> {
  const seen = new Map<string, number>();
  const result = new Set<string>();
  for (const line of proseLines(markdown)) {
    const heading = line.match(/^#{1,6}\s+(.*?)\s*#*\s*$/);
    if (!heading) continue;
    const base = slug(heading[1]);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    result.add(n === 0 ? base : `${base}-${n}`);
  }
  return result;
}

interface Link {
  /** Repo-relative path of the target, or null for an anchor in the same file. */
  path: string | null;
  anchor: string | null;
  text: string;
}

function splitAnchor(target: string): { path: string; anchor: string | null } {
  const i = target.indexOf('#');
  return i === -1 ? { path: target, anchor: null } : { path: target.slice(0, i), anchor: target.slice(i + 1) };
}

/** Links into this repository: relative Markdown links, and absolute github.com links to it. */
function repoLinks(file: string, content: string): Link[] {
  const links: Link[] = [];
  const text = file.endsWith('.md') ? proseLines(content).join('\n').replace(/`[^`\n]*`/g, '``') : content;

  for (const m of text.matchAll(/https:\/\/github\.com\/OdinMB\/city-monitor\/[^\s)"'<>]+/g)) {
    // A bare URL at the end of a sentence carries its punctuation.
    const url = m[0].replace(/[.,;:]+$/, '');
    const rest = url.slice(REPO_URL.length);
    const blob = rest.match(/^blob\/main\/(.+)$/);
    const template = rest.match(/^issues\/new\?template=([\w.-]+)$/);
    if (blob) {
      const { path, anchor } = splitAnchor(blob[1]);
      links.push({ path, anchor, text: url });
    } else if (template) {
      links.push({ path: `${ISSUE_TEMPLATES}/${template[1]}`, anchor: null, text: url });
    }
  }

  if (file.endsWith('.md')) {
    for (const m of text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = m[1];
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
      const { path, anchor } = splitAnchor(target);
      links.push({
        path: path === '' ? null : relative(ROOT, resolve(ROOT, dirname(file), path)).split(sep).join('/'),
        anchor,
        text: target,
      });
    }
  }
  return links;
}

const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

/** Links in `file` (its text is `content`) whose target file or heading does not exist. */
function brokenLinks(file: string, content = read(file)): string[] {
  const broken: string[] = [];
  for (const link of repoLinks(file, content)) {
    const target = link.path ?? file;
    if (link.path !== null && !existsSync(join(ROOT, target))) {
      broken.push(`${link.text}: no file ${target}`);
      continue;
    }
    if (link.anchor && target.endsWith('.md') && !anchors(link.path === null ? content : read(target)).has(link.anchor)) {
      broken.push(`${link.text}: no heading #${link.anchor} in ${target}`);
    }
  }
  return broken;
}

describe('heading anchors', () => {
  it('match the anchors GitHub gives these headings', () => {
    expect(slug('Right-to-left (Arabic)')).toBe('right-to-left-arabic');
    expect(slug('Jobs (26, defined in app.ts)')).toBe('jobs-26-defined-in-appts');
    expect(slug('WAQI terms: shown live, not archived, credited')).toBe('waqi-terms-shown-live-not-archived-credited');
    expect(slug('In-Memory Cache (`packages/server/src/lib/cache.ts`)')).toBe('in-memory-cache-packagesserversrclibcachets');
    expect(slug('A – B')).toBe('a--b');
  });

  it('number repeated headings and skip fenced code', () => {
    const md = ['# Notes', '```bash', '# not a heading', '```', '## Notes', '## Other'].join('\n');
    expect([...anchors(md)]).toEqual(['notes', 'notes-1', 'other']);
  });
});

describe('contributor doc links', () => {
  it('include the contributor guide, the pull request template and both issue forms', () => {
    expect(CHECKED_FILES).toEqual(expect.arrayContaining([
      'CONTRIBUTING.md',
      '.github/pull_request_template.md',
      `${ISSUE_TEMPLATES}/bug_report.yml`,
      `${ISSUE_TEMPLATES}/data_source.yml`,
      `${ISSUE_TEMPLATES}/config.yml`,
    ]));
  });

  it('send CONTRIBUTING.md readers into .context/', () => {
    const targets = repoLinks('CONTRIBUTING.md', read('CONTRIBUTING.md')).map((l) => l.path);
    expect(targets.filter((p) => p?.startsWith('.context/')).length).toBeGreaterThan(10);
  });

  it('find relative, same-file and github.com links, but not ones in code', () => {
    expect(repoLinks('.context/x.md', '[a](../README.md) [b](#here) `[c](ignored.md)` [d](https://example.com/x)')).toEqual([
      { path: 'README.md', anchor: null, text: '../README.md' },
      { path: null, anchor: 'here', text: '#here' },
    ]);
    expect(repoLinks('x.yml', [
      `url: ${REPO_URL}blob/main/CONTRIBUTING.md#a-b`,
      `url: ${REPO_URL}issues/new?template=bug_report.yml`,
      `See ${REPO_URL}blob/main/README.md, or ${REPO_URL}blob/main/LICENSE.`,
    ].join('\n'))).toEqual([
      { path: 'CONTRIBUTING.md', anchor: 'a-b', text: `${REPO_URL}blob/main/CONTRIBUTING.md#a-b` },
      { path: `${ISSUE_TEMPLATES}/bug_report.yml`, anchor: null, text: `${REPO_URL}issues/new?template=bug_report.yml` },
      { path: 'README.md', anchor: null, text: `${REPO_URL}blob/main/README.md` },
      { path: 'LICENSE', anchor: null, text: `${REPO_URL}blob/main/LICENSE` },
    ]);
  });

  it('flag a missing file, a missing heading and a missing issue form', () => {
    const md = [
      '# Here',
      '[ok](.context/testing.md#running-tests) [ok](#here)',
      '[gone](.context/none.md) [gone](.context/testing.md#nowhere) [gone](#nowhere)',
      `[gone](${REPO_URL}issues/new?template=none.yml)`,
    ].join('\n');
    expect(brokenLinks('CONTRIBUTING.md', md)).toEqual([
      `${REPO_URL}issues/new?template=none.yml: no file ${ISSUE_TEMPLATES}/none.yml`,
      '.context/none.md: no file .context/none.md',
      '.context/testing.md#nowhere: no heading #nowhere in .context/testing.md',
      '#nowhere: no heading #nowhere in CONTRIBUTING.md',
    ]);
  });

  it.each(CHECKED_FILES)('%s links only to files and headings that exist', (file) => {
    expect(brokenLinks(file)).toEqual([]);
  });
});
