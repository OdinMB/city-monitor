/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Fragment, useMemo } from 'react';

/** Reverse a string (Unicode-safe) to deter naïve scrapers */
const r = (s: string) => [...s].reverse().join('');

const EMAIL_USER = 'tcatnoc';
const EMAIL_DOMAIN = 'ppa.rotinomytic';

const ADDRESS_LINES = [
  'niebnehlh\u00FCM nidO',
  '05 eellannnoS',
  'nilreB 54021',
];

export function ObfuscatedEmail({ className }: { className?: string }) {
  const addr = useMemo(() => `${r(EMAIL_USER)}@${r(EMAIL_DOMAIN)}`, []);

  return (
    <a href={`mailto:${addr}`} className={className}>
      {addr}
    </a>
  );
}

export function ObfuscatedAddress() {
  const lines = useMemo(() => ADDRESS_LINES.map(r), []);

  return (
    <address className="not-italic text-sm leading-relaxed">
      {lines.map((line, i) => (
        <Fragment key={i}>
          {line}
          {i < lines.length - 1 && <br />}
        </Fragment>
      ))}
    </address>
  );
}
