/**
 * The crisis-services directory of each city, keyed by city ID. A city shows
 * the Crisis Services tile only when it has an entry here and lists the
 * `crisis` feature (config/index.test.ts keeps the two in step).
 *
 * Every entry's `url` is the official page its number, name and hours were
 * checked against; `checkedOn` is the day they were. Check every city's
 * numbers again once a year (.context/new-data-sources.md, freshness
 * inventory) and set `checkedOn` when you do.
 */

export type CrisisCategory = 'emergency' | 'crisis' | 'violence' | 'children' | 'drugs' | 'lgbtq';

export interface CrisisService {
  category: CrisisCategory;
  /** Key under `panel.crisis.service`. */
  nameKey: string;
  /** The service's own German name, shown on hover as a native tooltip. */
  germanName: string;
  phone: string;
  /** The service's official page, where the number and hours were checked. */
  url: string;
  /** Key under `panel.crisis`; none where no single number has fixed hours. */
  hoursKey?: string;
}

export interface KrisendienstSite {
  districts: string[];
  phone: string;
}

/** A regional service with one number per district, shown on a second tab. */
export interface LocalCrisisService {
  name: string;
  url: string;
  /** The number named in the note, answered from every region. */
  onCall: string;
  sites: KrisendienstSite[];
}

export interface CrisisDirectory {
  /** YYYY-MM-DD: the day the entries were checked against their official pages. */
  checkedOn: string;
  emergency: CrisisService[];
  services: CrisisService[];
  /** Key under `panel.crisis.note`: hours too long for a badge, and what to call outside them. */
  noteKey?: string;
  local?: LocalCrisisService;
}

/* ── Nationwide services ───────────────────────────────── */

/** Checked 2026-11-01 on https://www.telefonseelsorge.de/telefon/ ("Tag und Nacht"; also 0800 111 0 222 and 116 123). */
const TELEFONSEELSORGE: CrisisService = { category: 'crisis', nameKey: 'telefonSeelsorge', germanName: 'TelefonSeelsorge', phone: '0800 111 0 111', url: 'https://www.telefonseelsorge.de/telefon/', hoursKey: 'hours24_7' };

/** Checked 2026-11-01 on https://www.hilfetelefon.de/. */
const HILFETELEFON: CrisisService = { category: 'violence', nameKey: 'hilfetelefon', germanName: 'Hilfetelefon Gewalt gegen Frauen', phone: '116 016', url: 'https://www.hilfetelefon.de/', hoursKey: 'hours24_7' };

/** Checked 2026-11-01 on https://www.nummergegenkummer.de/ ("Montags bis samstags von 14-20 Uhr"). */
const NUMMER_GEGEN_KUMMER: CrisisService = { category: 'children', nameKey: 'kinderJugendtelefon', germanName: 'Kinder- und Jugendtelefon (Nummer gegen Kummer)', phone: '116 111', url: 'https://www.nummergegenkummer.de/', hoursKey: 'hoursMoSa' };

const fireAmbulance = (url: string): CrisisService =>
  ({ category: 'emergency', nameKey: 'fireAmbulance', germanName: 'Feuerwehr und Rettungsdienst', phone: '112', url });
const police = (url: string): CrisisService =>
  ({ category: 'emergency', nameKey: 'police', germanName: 'Polizei', phone: '110', url });

/* ── Berlin ────────────────────────────────────────────── */

const KRISENDIENST_URL = 'https://www.berliner-krisendienst.de/ich-brauche-hilfe/';

/**
 * The Krisendienst's number for all regions: its on-call service at night and
 * on weekends and holidays, information and referral on weekday daytimes (as
 * is each region's own number). Its official page lists no central number.
 */
const KRISENDIENST_ON_CALL = '030 390 63-10';

/**
 * Checked by the maintainer on 2026-10-27 against the services' official
 * pages. The 112/110, TelefonSeelsorge, Hilfetelefon, Kindernotdienst and
 * Jugendnotdienst entries were not separately re-checked that day; they stand
 * as researched the same day from search excerpts.
 */
const BERLIN: CrisisDirectory = {
  checkedOn: '2026-10-27',
  emergency: [
    fireAmbulance('https://www.berliner-feuerwehr.de/'),
    police('https://www.berlin.de/polizei/'),
  ],
  services: [
    TELEFONSEELSORGE,
    { category: 'crisis', nameKey: 'krisendienst', germanName: 'Berliner Krisendienst', phone: KRISENDIENST_ON_CALL, url: KRISENDIENST_URL },
    { category: 'violence', nameKey: 'bigHotline', germanName: 'BIG Hotline', phone: '030 611 03 00', url: 'https://www.big-hotline.de/', hoursKey: 'hours24_7' },
    HILFETELEFON,
    { category: 'children', nameKey: 'kindernotdienst', germanName: 'Kindernotdienst', phone: '030 61 00 61', url: 'https://www.berlin.de/notdienst-kinderschutz/', hoursKey: 'hours24_7' },
    { category: 'children', nameKey: 'jugendnotdienst', germanName: 'Jugendnotdienst', phone: '030 61 00 62', url: 'https://www.berlin.de/notdienst-kinderschutz/jugendnotdienst/', hoursKey: 'hours24_7' },
    NUMMER_GEGEN_KUMMER,
    { category: 'drugs', nameKey: 'drogennotdienst', germanName: 'Drogennotdienst', phone: '030 192 37', url: 'https://drogennotdienst.de/', hoursKey: 'hours24_7' },
    { category: 'lgbtq', nameKey: 'maneo', germanName: 'Maneo', phone: '030 216 33 36', url: 'https://maneo.de/en/home/', hoursKey: 'hoursDaily17_19' },
    { category: 'lgbtq', nameKey: 'schwulenberatung', germanName: 'Schwulenberatung Berlin', phone: '030 446 688-111', url: 'https://schwulenberatungberlin.de/kontakt/', hoursKey: 'hoursMoFr9_19' },
  ],
  local: {
    name: 'Berliner Krisendienst',
    url: KRISENDIENST_URL,
    onCall: KRISENDIENST_ON_CALL,
    // The regional sites and the districts each one serves.
    sites: [
      { districts: ['Mitte', 'Friedrichshain-Kreuzberg'], phone: '030 390 63-10' },
      { districts: ['Charlottenburg-Wilmersdorf'], phone: '030 390 63-20' },
      { districts: ['Spandau'], phone: '030 390 63-30' },
      { districts: ['Pankow'], phone: '030 390 63-40' },
      { districts: ['Reinickendorf'], phone: '030 390 63-50' },
      { districts: ['Steglitz-Zehlendorf', 'Tempelhof-Schöneberg'], phone: '030 390 63-60' },
      { districts: ['Lichtenberg', 'Marzahn-Hellersdorf'], phone: '030 390 63-70' },
      { districts: ['Treptow-Köpenick'], phone: '030 390 63-80' },
      { districts: ['Neukölln'], phone: '030 390 63-90' },
    ],
  },
};

/* ── Hamburg ───────────────────────────────────────────── */

/**
 * Checked 2026-11-01 with curl on each entry's official page. Hamburg has no
 * 24/7 city crisis line: the Krisentelefon answers evenings, nights, weekends
 * and holidays only ("Montag - Donnerstag 17:00 - 23:30 Uhr, Freitag 17:00 -
 * Samstag 07:30 Uhr, Samstag 10:00 - Sonntag 07:30 Uhr, Sonn- und Feiertags
 * 10:00 - 23:30 Uhr"), so the note gives the hours. The child-protection line
 * is the one hamburg.de's Kinderschutz page gives ("040 428 15 32 00 - rund um
 * die Uhr"); that page does not name the Kinder- und Jugendnotdienst behind it.
 */
const HAMBURG: CrisisDirectory = {
  checkedOn: '2026-11-01',
  emergency: [
    fireAmbulance('https://www.feuerwehr.hamburg/'),
    police('https://www.polizei.hamburg/'),
  ],
  services: [
    TELEFONSEELSORGE,
    { category: 'crisis', nameKey: 'krisentelefonHamburg', germanName: 'Hamburgisches Krisentelefon', phone: '040 42811 3000', url: 'https://www.hamburg.de/politik-und-verwaltung/bezirke/altona/themen/gesundheit/krisentelefon-61202', hoursKey: 'hoursEveningsWeekends' },
    HILFETELEFON,
    { category: 'children', nameKey: 'kinderschutzHamburg', germanName: 'Kinderschutz-Telefon (Hinsehen und handeln)', phone: '040 428 15 32 00', url: 'https://www.hamburg.de/politik-und-verwaltung/behoerden/bsfb/familie/kinderschutz', hoursKey: 'hours24_7' },
    NUMMER_GEGEN_KUMMER,
  ],
  noteKey: 'hamburg',
};

/* ── Köln ──────────────────────────────────────────────── */

/**
 * Checked 2026-11-01 with curl on each entry's official page. Köln has no city
 * crisis line; the Gesundheitsamt's Sozialpsychiatrischer Dienst answers its
 * central number in office hours ("Montag bis Donnerstag, 9 bis 15 Uhr,
 * Freitag, 9 bis 13 Uhr"; an older city leaflet said 8–16 and 8–12), so the
 * note gives them. koeln.polizei.nrw answered curl with 503 that day; it is
 * the Polizei Köln's own site.
 */
const KOELN: CrisisDirectory = {
  checkedOn: '2026-11-01',
  emergency: [
    fireAmbulance('https://www.stadt-koeln.de/politik-und-verwaltung/feuerwehr/'),
    police('https://koeln.polizei.nrw/'),
  ],
  services: [
    TELEFONSEELSORGE,
    { category: 'crisis', nameKey: 'spdKoeln', germanName: 'Sozialpsychiatrischer Dienst (Gesundheitsamt Köln)', phone: '0221 221-24710', url: 'https://www.stadt-koeln.de/service/adressen/sozialpsychiatrischer-dienst', hoursKey: 'hoursOffice' },
    HILFETELEFON,
    NUMMER_GEGEN_KUMMER,
  ],
  noteKey: 'koeln',
};

/* ── München ───────────────────────────────────────────── */

/**
 * Checked 2026-11-01 with curl on each entry's official page. The Krisendienst
 * Psychiatrie Oberbayern answers "täglich von 0 bis 24 Uhr", free of charge.
 */
const MUENCHEN: CrisisDirectory = {
  checkedOn: '2026-11-01',
  emergency: [
    fireAmbulance('https://stadt.muenchen.de/infos/feuerwehr-muenchen.html'),
    police('https://www.polizei.bayern.de/'),
  ],
  services: [
    TELEFONSEELSORGE,
    { category: 'crisis', nameKey: 'krisendienstOberbayern', germanName: 'Krisendienst Psychiatrie Oberbayern', phone: '0800 655 3000', url: 'https://www.bezirk-oberbayern.de/Soziales/Psychiatrie/Krisendienst-Psychiatrie', hoursKey: 'hours24_7' },
    HILFETELEFON,
    NUMMER_GEGEN_KUMMER,
  ],
};

const CRISIS_DIRECTORIES: Readonly<Record<string, CrisisDirectory>> = {
  berlin: BERLIN,
  hamburg: HAMBURG,
  koeln: KOELN,
  muenchen: MUENCHEN,
};

/** The city's crisis-services directory, or null where it has none. */
export function getCrisisDirectory(cityId: string): CrisisDirectory | null {
  return Object.hasOwn(CRISIS_DIRECTORIES, cityId) ? CRISIS_DIRECTORIES[cityId]! : null;
}
