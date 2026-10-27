import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseDateTimeDE, formatDateDE, parsePharmaciesFromHtml, extractFormTokens, createPharmacyIngestion } from './ingest-pharmacies.js';
import { createCache } from '../lib/cache.js';
import { CK } from '../lib/cache-keys.js';

describe('parseDateTimeDE', () => {
  it('parses date and time into ISO string', () => {
    expect(parseDateTimeDE('01.03.2026', '18:00')).toBe('2026-03-01T18:00:00');
  });

  it('defaults to 00:00 when time is empty', () => {
    expect(parseDateTimeDE('25.12.2026', '')).toBe('2026-12-25T00:00:00');
  });
});

describe('formatDateDE', () => {
  it('formats a Date into DD.MM.YYYY string', () => {
    const date = new Date(2026, 2, 1); // March 1, 2026
    expect(formatDateDE(date)).toBe('01.03.2026');
  });

  it('pads single-digit days and months with leading zero', () => {
    const date = new Date(2026, 0, 5); // January 5, 2026
    expect(formatDateDE(date)).toBe('05.01.2026');
  });
});

// ---------------------------------------------------------------------------
// HTML fixtures
// ---------------------------------------------------------------------------

const SINGLE_PHARMACY_HTML = `
<ul class="list-group">
<li class="list-group-item"
    data-id="100075"
    data-latitude="52.5236486"
    data-longitude="13.3868064">
    <div class="d-flex justify-content-between align-items-center">
        <h2 class="name">Galenus-Apotheke</h2>
        <div class="distanz badge badge-light"><span class="d-none d-sm-inline">Entfernung: </span>0.95 km</div>
    </div>
    <div class="mb-2">
        <p>
            Notdienst vom 17.03.2026 um 09:00 Uhr bis 18.03.2026 um 09:00 Uhr.
        </p>
    </div>
    <div class="row">
        <div class="col-md-4">
            <p>
                <span class="strasse">Reinhardtstr. 5</span><br>
                <span class="plz">10117</span> <span class="ort">Berlin</span><br>
            </p>
        </div>
        <div class="col-md-4">
            <p>
                <span>Tel: </span><a href="tel:+49 30 2827871">+49 30 2827871</a>
            </p>
        </div>
    </div>
</li>
</ul>
`;

const MULTI_PHARMACY_HTML = `
<ul class="list-group">
<li class="list-group-item"
    data-id="100075"
    data-latitude="52.5236486"
    data-longitude="13.3868064">
    <div class="d-flex justify-content-between align-items-center">
        <h2 class="name">Galenus-Apotheke</h2>
        <div class="distanz badge badge-light"><span class="d-none d-sm-inline">Entfernung: </span>0.95 km</div>
    </div>
    <div class="mb-2">
        <p>
            Notdienst vom 17.03.2026 um 09:00 Uhr bis 18.03.2026 um 09:00 Uhr.
        </p>
    </div>
    <div class="row">
        <div class="col-md-4">
            <p>
                <span class="strasse">Reinhardtstr. 5</span><br>
                <span class="plz">10117</span> <span class="ort">Berlin</span><br>
            </p>
        </div>
        <div class="col-md-4">
            <p>
                <span>Tel: </span><a href="tel:+49 30 2827871">+49 30 2827871</a>
            </p>
        </div>
    </div>
</li>
<li class="list-group-item"
    data-id="200099"
    data-latitude="52.4912345"
    data-longitude="13.4234567">
    <div class="d-flex justify-content-between align-items-center">
        <h2 class="name">Stern-Apotheke</h2>
        <div class="distanz badge badge-light"><span class="d-none d-sm-inline">Entfernung: </span>3.21 km</div>
    </div>
    <div class="mb-2">
        <p>
            Notdienst vom 17.03.2026 um 09:00 Uhr bis 18.03.2026 um 09:00 Uhr.
        </p>
    </div>
    <div class="row">
        <div class="col-md-4">
            <p>
                <span class="strasse">Hauptstr. 42</span><br>
                <span class="plz">10827</span> <span class="ort">Berlin</span><br>
            </p>
        </div>
        <div class="col-md-4">
            <p>
                <span>Tel: </span><a href="tel:+49 30 7654321">+49 30 7654321</a>
            </p>
        </div>
    </div>
</li>
</ul>
`;

const NO_PHONE_HTML = `
<ul class="list-group">
<li class="list-group-item"
    data-id="300001"
    data-latitude="52.5100000"
    data-longitude="13.4000000">
    <div class="d-flex justify-content-between align-items-center">
        <h2 class="name">Apotheke Ohne Telefon</h2>
        <div class="distanz badge badge-light"><span class="d-none d-sm-inline">Entfernung: </span>1.50 km</div>
    </div>
    <div class="mb-2">
        <p>
            Notdienst vom 17.03.2026 um 09:00 Uhr bis 18.03.2026 um 09:00 Uhr.
        </p>
    </div>
    <div class="row">
        <div class="col-md-4">
            <p>
                <span class="strasse">Musterstr. 1</span><br>
                <span class="plz">10999</span> <span class="ort">Berlin</span><br>
            </p>
        </div>
    </div>
</li>
</ul>
`;

const NO_DISTANCE_HTML = `
<ul class="list-group">
<li class="list-group-item"
    data-id="300002"
    data-latitude="52.5100000"
    data-longitude="13.4000000">
    <div class="d-flex justify-content-between align-items-center">
        <h2 class="name">Apotheke Ohne Distanz</h2>
    </div>
    <div class="mb-2">
        <p>
            Notdienst vom 17.03.2026 um 09:00 Uhr bis 18.03.2026 um 09:00 Uhr.
        </p>
    </div>
    <div class="row">
        <div class="col-md-4">
            <p>
                <span class="strasse">Teststr. 7</span><br>
                <span class="plz">10115</span> <span class="ort">Berlin</span><br>
            </p>
        </div>
        <div class="col-md-4">
            <p>
                <span>Tel: </span><a href="tel:+49 30 1111111">+49 30 1111111</a>
            </p>
        </div>
    </div>
</li>
</ul>
`;

const NO_LATLON_HTML = `
<ul class="list-group">
<li class="list-group-item"
    data-id="400001">
    <div class="d-flex justify-content-between align-items-center">
        <h2 class="name">Phantom-Apotheke</h2>
    </div>
    <div class="mb-2">
        <p>
            Notdienst vom 17.03.2026 um 09:00 Uhr bis 18.03.2026 um 09:00 Uhr.
        </p>
    </div>
    <div class="row">
        <div class="col-md-4">
            <p>
                <span class="strasse">Nirgendwo 1</span><br>
                <span class="plz">10000</span> <span class="ort">Berlin</span><br>
            </p>
        </div>
    </div>
</li>
</ul>
`;

const FORM_HTML = `
<html>
<body>
<form role="search" novalidate="novalidate" method="post" name="search" id="pharmacy-searchform" action="/notdienstsuche?tx_aponetpharmacy_search%5Baction%5D=search&amp;tx_aponetpharmacy_search%5Bcontroller%5D=Search&amp;cHash=d60644fbe4920abed16b25ce29f3b7c8">
<input type="hidden" name="tx_aponetpharmacy_search[__referrer][@extension]" value="AponetPharmacy" />
<input type="hidden" name="tx_aponetpharmacy_search[__referrer][@controller]" value="Search" />
<input type="hidden" name="tx_aponetpharmacy_search[__referrer][@action]" value="search" />
<input type="hidden" name="tx_aponetpharmacy_search[__referrer][arguments]" value="YTowOnt97c054add4f9ce143ac91353826af0fc124a20a14" />
<input type="hidden" name="tx_aponetpharmacy_search[__referrer][@request]" value="{&quot;@extension&quot;:&quot;AponetPharmacy&quot;,&quot;@controller&quot;:&quot;Search&quot;,&quot;@action&quot;:&quot;search&quot;}a1b1054f18eb2249fa8766750e421766ae68f8dd" />
<input type="hidden" name="tx_aponetpharmacy_search[__trustedProperties]" value="{&quot;search&quot;:{&quot;plzort&quot;:1,&quot;date&quot;:1,&quot;street&quot;:1,&quot;radius&quot;:1}}5e869cf2e190b391161359fdc8e3b39698b0911c" />
<input type="text" name="tx_aponetpharmacy_search[search][plzort]" />
</form>
</body>
</html>
`;

// ---------------------------------------------------------------------------
// parsePharmaciesFromHtml
// ---------------------------------------------------------------------------

describe('parsePharmaciesFromHtml', () => {
  it('parses a single pharmacy entry with all fields', () => {
    const result = parsePharmaciesFromHtml(SINGLE_PHARMACY_HTML, 'berlin');

    expect(result).toHaveLength(1);
    const p = result[0];
    expect(p.id).toBe('apo-berlin-0');
    expect(p.name).toBe('Galenus-Apotheke');
    expect(p.address).toBe('Reinhardtstr. 5, 10117 Berlin');
    expect(p.phone).toBe('+49 30 2827871');
    expect(p.location).toEqual({ lat: 52.5236486, lon: 13.3868064 });
    expect(p.validFrom).toBe('2026-03-17T09:00:00');
    expect(p.validUntil).toBe('2026-03-18T09:00:00');
    expect(p.distance).toBeCloseTo(0.95);
  });

  it('parses multiple pharmacy entries', () => {
    const result = parsePharmaciesFromHtml(MULTI_PHARMACY_HTML, 'berlin');

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Galenus-Apotheke');
    expect(result[1].name).toBe('Stern-Apotheke');
    expect(result[1].id).toBe('apo-berlin-1');
    expect(result[1].address).toBe('Hauptstr. 42, 10827 Berlin');
    expect(result[1].distance).toBeCloseTo(3.21);
  });

  it('handles missing phone', () => {
    const result = parsePharmaciesFromHtml(NO_PHONE_HTML, 'berlin');

    expect(result).toHaveLength(1);
    expect(result[0].phone).toBeUndefined();
  });

  it('handles missing distance', () => {
    const result = parsePharmaciesFromHtml(NO_DISTANCE_HTML, 'berlin');

    expect(result).toHaveLength(1);
    expect(result[0].distance).toBeUndefined();
  });

  it('skips entries without lat/lon', () => {
    const result = parsePharmaciesFromHtml(NO_LATLON_HTML, 'berlin');

    expect(result).toHaveLength(0);
  });

  it('returns empty array for HTML without pharmacy entries', () => {
    const result = parsePharmaciesFromHtml('<html><body>No results</body></html>', 'berlin');

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// extractFormTokens
// ---------------------------------------------------------------------------

describe('extractFormTokens', () => {
  it('extracts cHash and hidden fields from realistic form HTML', () => {
    const tokens = extractFormTokens(FORM_HTML);

    expect(tokens).not.toBeNull();
    expect(tokens!.actionPath).toBe('/notdienstsuche?tx_aponetpharmacy_search%5Baction%5D=search&tx_aponetpharmacy_search%5Bcontroller%5D=Search&cHash=d60644fbe4920abed16b25ce29f3b7c8');
    expect(tokens!.hiddenFields).toEqual({
      'tx_aponetpharmacy_search[__referrer][@extension]': 'AponetPharmacy',
      'tx_aponetpharmacy_search[__referrer][@controller]': 'Search',
      'tx_aponetpharmacy_search[__referrer][@action]': 'search',
      'tx_aponetpharmacy_search[__referrer][arguments]': 'YTowOnt97c054add4f9ce143ac91353826af0fc124a20a14',
      'tx_aponetpharmacy_search[__referrer][@request]': '{"@extension":"AponetPharmacy","@controller":"Search","@action":"search"}a1b1054f18eb2249fa8766750e421766ae68f8dd',
      'tx_aponetpharmacy_search[__trustedProperties]': '{"search":{"plzort":1,"date":1,"street":1,"radius":1}}5e869cf2e190b391161359fdc8e3b39698b0911c',
    });
  });

  it('returns null when form not found', () => {
    const tokens = extractFormTokens('<html><body>No form here</body></html>');

    expect(tokens).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createPharmacyIngestion
// ---------------------------------------------------------------------------

describe('createPharmacyIngestion', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  /** Answers the search page with FORM_HTML and each search with one pharmacy; returns the postcodes searched. */
  function mockAponet(): string[] {
    const searched: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      if (init?.method !== 'POST') return new Response(FORM_HTML, { status: 200 });
      searched.push(new URLSearchParams(String(init.body)).get('tx_aponetpharmacy_search[search][plzort]') ?? '');
      return new Response(SINGLE_PHARMACY_HTML, { status: 200 });
    });
    return searched;
  }

  it('searches around central Berlin when only Berlin is active', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
    const searched = mockAponet();
    const cache = createCache();

    await createPharmacyIngestion(cache)();

    expect(searched).toEqual(['10115']);
    expect(cache.get(CK.pharmacies('berlin'))).toHaveLength(1);
  });

  it('searches around central Köln when Köln is active', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin,koeln');
    const searched = mockAponet();
    const cache = createCache();

    await createPharmacyIngestion(cache)();

    expect(searched).toEqual(['10115', '50667']);
    expect(cache.get(CK.pharmacies('koeln'))).toHaveLength(1);
  });
});
