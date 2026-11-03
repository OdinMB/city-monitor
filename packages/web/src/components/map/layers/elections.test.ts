import { describe, it, expect, afterEach } from 'vitest';
import i18n from 'i18next';
import type { ElectionAreaResult } from '../../../lib/api.js';
import { electionPopupHtml, electionTitle, leadersOf } from './elections';

function parse(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
}

const AREA: ElectionAreaResult = {
  id: '0101', name: 'Mitte <i>1</i>', turnout: 68.25, otherPct: 7.5, leader: 'Grüne',
  shares: [{ party: 'CDU', pct: 20 }, { party: 'Grüne', pct: 31.5 }, { party: 'Zero', pct: 0 }, { party: 'SPD', pct: 21 }],
};
const ELECTION = { election: 'abgeordnetenhaus', date: '2026-09-20' } as const;

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('electionPopupHtml', () => {
  it('lists the area\'s parties strongest first, leaves out those without votes, and gives the others and turnout', () => {
    const el = parse(electionPopupHtml(AREA, ELECTION));
    const rows = [...el.querySelectorAll('tr')].map((tr) => tr.textContent!.replace(/\s+/g, ' ').trim());
    expect(rows).toEqual(['Grüne31.5 %', 'SPD21.0 %', 'CDU20.0 %', `${i18n.t('panel.elections.others')}7.5 %`]);
    const text = el.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain(`${i18n.t('panel.elections.turnout')}: 68.3 %`);
    expect(text).toContain(electionTitle(ELECTION));
  });

  it('escapes the names from the source', () => {
    const el = parse(electionPopupHtml(AREA, ELECTION));
    expect(el.querySelector('i')).toBeNull();
    expect(el.textContent).toContain('Mitte <i>1</i>');
  });

  it('writes the numbers in the UI language', async () => {
    await i18n.changeLanguage('de');
    expect(parse(electionPopupHtml(AREA, ELECTION)).textContent).toContain('31,5 %');
  });
});

describe('leadersOf', () => {
  it('counts the areas each party leads, most first, ties by name', () => {
    const area = (leader: string | null) => ({ ...AREA, leader });
    expect(leadersOf({ areas: [area('SPD'), area('CDU'), area('SPD'), area(null), area('AfD')] }))
      .toEqual([['SPD', 2], ['AfD', 1], ['CDU', 1]]);
  });
});
