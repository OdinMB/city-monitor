/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { parseAppointmentDates, deriveStatus } from './ingest-appointments.js';

const SAMPLE_HTML = `
<table class="calendar-month-table">
  <tr>
    <td class="nichtbuchbar">1</td>
    <td class="buchbar">
      <a href="/terminvereinbarung/termin/time/1741564800/">3</a>
    </td>
    <td class="buchbar">
      <a href="/terminvereinbarung/termin/time/1741651200/">4</a>
    </td>
    <td class="nichtbuchbar">5</td>
  </tr>
</table>
<table class="calendar-month-table">
  <tr>
    <td class="buchbar">
      <a href="/terminvereinbarung/termin/time/1743379200/">1</a>
    </td>
  </tr>
</table>
`;

const EMPTY_HTML = `
<table class="calendar-month-table">
  <tr>
    <td class="nichtbuchbar">1</td>
    <td class="nichtbuchbar">2</td>
  </tr>
</table>
`;

describe('parseAppointmentDates', () => {
  it('extracts dates from td.buchbar a elements', () => {
    const dates = parseAppointmentDates(SAMPLE_HTML);
    expect(dates).toHaveLength(3);
    // Timestamps are Unix seconds — verify they convert to valid dates
    dates.forEach((d) => {
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it('returns sorted unique dates', () => {
    const dates = parseAppointmentDates(SAMPLE_HTML);
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] >= dates[i - 1]).toBe(true);
    }
  });

  it('returns empty array for HTML with no bookable slots', () => {
    const dates = parseAppointmentDates(EMPTY_HTML);
    expect(dates).toHaveLength(0);
  });

  it('returns empty array for empty string', () => {
    const dates = parseAppointmentDates('');
    expect(dates).toHaveLength(0);
  });

  it('deduplicates dates from same day', () => {
    const html = `
      <td class="buchbar"><a href="/terminvereinbarung/termin/time/1741564800/">3</a></td>
      <td class="buchbar"><a href="/terminvereinbarung/termin/time/1741564800/">3</a></td>
    `;
    const dates = parseAppointmentDates(html);
    expect(dates).toHaveLength(1);
  });
});

describe('deriveStatus', () => {
  it('returns "available" for 5+ days', () => {
    expect(deriveStatus(5)).toBe('available');
    expect(deriveStatus(38)).toBe('available');
  });

  it('returns "scarce" for 1-4 days', () => {
    expect(deriveStatus(1)).toBe('scarce');
    expect(deriveStatus(4)).toBe('scarce');
  });

  it('returns "none" for 0 days', () => {
    expect(deriveStatus(0)).toBe('none');
  });
});
