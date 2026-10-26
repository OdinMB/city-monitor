import { describe, it, expect } from 'vitest';
import i18n from 'i18next';
import ar from './ar.json';
import de from './de.json';
import en from './en.json';
import tr from './tr.json';

/**
 * Count strings use i18next plural keys (`key_one`, `key_other`, …), picked
 * through Intl.PluralRules. Arabic has six CLDR plural categories, so an
 * Arabic count string needs all six or some numbers read wrongly.
 */

const BUNDLES: Record<string, unknown> = { ar, de, en, tr };
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const ARABIC_FORMS = ['zero', 'one', 'two', 'few', 'many', 'other'];

/**
 * Arabic count strings with no plural forms, because their wording does not
 * change with the number ("N more" with no counted noun), or because no
 * component shows them.
 */
const INVARIANT_AR = new Set([
  'panel.crisis.showMore',
  'panel.political.showMore',
  // Not read by any component.
  'panel.news.headlines_count',
  'panel.news.showMore',
  'panel.events.showMore',
  'panel.waterLevels.stationsHigh',
]);

function flatten(obj: unknown, prefix = ''): Record<string, string> {
  if (typeof obj === 'string') return { [prefix]: obj };
  return Object.assign({}, ...Object.entries(obj as Record<string, unknown>)
    .map(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k)));
}

const FLAT = Object.fromEntries(Object.entries(BUNDLES).map(([lng, b]) => [lng, flatten(b)]));
const PLURAL_BASES = [...new Set(
  Object.values(FLAT).flatMap((f) => Object.keys(f)).filter((k) => PLURAL_SUFFIX.test(k)).map((k) => k.replace(PLURAL_SUFFIX, '')),
)].sort();

describe('plural keys', () => {
  it('finds the pluralised keys', () => {
    expect(PLURAL_BASES).toEqual(expect.arrayContaining(['time.minutesAgo', 'panel.councilMeetings.agendaItems', 'mapPopup.delay']));
  });

  it.each(PLURAL_BASES)('%s has all six Arabic forms', (base) => {
    for (const form of ARABIC_FORMS) expect(FLAT.ar, `${base}_${form}`).toHaveProperty([`${base}_${form}`]);
  });

  it('gives every Arabic {{count}} string its plural forms', () => {
    const bare = Object.entries(FLAT.ar)
      .filter(([k, v]) => v.includes('{{count}}') && !PLURAL_SUFFIX.test(k) && !INVARIANT_AR.has(k))
      .map(([k]) => k);
    expect(bare).toEqual([]);
  });

  const COUNTS = [0, 1, 2, 3, 10, 11, 99, 100, 101, 102, 103, 111];
  it.each(['ar', 'de', 'en', 'tr'])('every plural key resolves in %s for any count', (lng) => {
    for (const base of PLURAL_BASES) {
      for (const count of COUNTS) {
        const text = i18n.t(base, { lng, count });
        expect(text, `${base} (${count})`).not.toBe(base);
        expect(text, `${base} (${count})`).not.toMatch(/\{\{|\}\}/);
      }
    }
  });
});

describe('Arabic count strings', () => {
  const ar = (key: string, count: number) => i18n.t(key, { lng: 'ar', count });

  it.each([
    ['time.minutesAgo', 1, 'منذ دقيقة'],
    ['time.minutesAgo', 2, 'منذ دقيقتين'],
    ['time.minutesAgo', 3, 'منذ 3 دقائق'],
    ['time.minutesAgo', 10, 'منذ 10 دقائق'],
    ['time.minutesAgo', 11, 'منذ 11 دقيقة'],
    ['time.minutesAgo', 59, 'منذ 59 دقيقة'],
    ['time.hoursAgo', 1, 'منذ ساعة'],
    ['time.hoursAgo', 2, 'منذ ساعتين'],
    ['time.hoursAgo', 5, 'منذ 5 ساعات'],
    ['time.hoursAgo', 23, 'منذ 23 ساعة'],
    ['time.daysAgo', 1, 'منذ يوم'],
    ['time.daysAgo', 2, 'منذ يومين'],
    ['time.daysAgo', 7, 'منذ 7 أيام'],
    ['time.daysAgo', 30, 'منذ 30 يومًا'],
    ['time.daysAgo', 100, 'منذ 100 يوم'],
    ['time.daysAgo', 103, 'منذ 103 أيام'],
    ['panel.appointments.inDays', 1, 'خلال يوم'],
    ['panel.appointments.inDays', 2, 'خلال يومين'],
    ['panel.appointments.inDays', 4, 'خلال 4 أيام'],
    ['panel.appointments.inDays', 14, 'خلال 14 يومًا'],
    ['panel.councilMeetings.agendaItems', 1, 'بند واحد في جدول الأعمال'],
    ['panel.councilMeetings.agendaItems', 2, 'بندان في جدول الأعمال'],
    ['panel.councilMeetings.agendaItems', 8, '8 بنود في جدول الأعمال'],
    ['panel.councilMeetings.agendaItems', 25, '25 بندًا في جدول الأعمال'],
    ['mapPopup.delay', 1, 'التأخير: نحو دقيقة واحدة'],
    ['mapPopup.delay', 2, 'التأخير: نحو دقيقتين'],
    ['mapPopup.delay', 5, 'التأخير: نحو 5 دقائق'],
    ['mapPopup.delay', 15, 'التأخير: نحو 15 دقيقة'],
    ['panel.political.representatives', 2, 'ممثلان'],
    ['panel.political.representatives', 9, '9 ممثلين'],
    ['panel.political.representatives', 29, '29 ممثلًا'],
    ['panel.political.districtMayors', 12, '12 رئيس حي'],
    ['panel.political.districtMayors', 3, '3 رؤساء أحياء'],
    ['panel.political.seats', 147, 'مقعدًا'],
    ['panel.political.seats', 105, 'مقاعد'],
  ] as const)('%s with %i', (key, count, expected) => {
    expect(ar(key, count)).toBe(expected);
  });
});

describe('other languages keep their count strings', () => {
  it.each([
    ['en', 'time.minutesAgo', 5, '5 min ago'],
    ['de', 'time.hoursAgo', 3, 'vor 3 Std.'],
    ['tr', 'time.daysAgo', 2, '2 gün önce'],
    ['en', 'panel.councilMeetings.agendaItems', 1, '1 agenda item'],
    ['en', 'panel.councilMeetings.agendaItems', 4, '4 agenda items'],
    ['de', 'panel.councilMeetings.agendaItems', 1, '1 Tagesordnungspunkt'],
    ['de', 'panel.councilMeetings.agendaItems', 4, '4 Tagesordnungspunkte'],
    ['tr', 'panel.councilMeetings.agendaItems', 4, '4 gündem maddesi'],
    ['en', 'mapPopup.delay', 5, 'Delay: ~5 min'],
    ['en', 'panel.political.representatives', 29, '29 representatives'],
    ['en', 'panel.political.districtMayors', 12, '12 district mayors'],
    ['en', 'panel.political.seats', 147, 'seats'],
    ['en', 'panel.political.showMore', 7, '+7 more…'],
    ['de', 'panel.political.showMore', 7, '+7 weitere…'],
    ['tr', 'panel.political.districtMayors', 12, '12 ilçe başkanı'],
  ] as const)('%s %s with %i', (lng, key, count, expected) => {
    expect(i18n.t(key, { lng, count })).toBe(expected);
  });
});
