const PARTY_COLORS: Record<string, string> = {
  'SPD': '#E3000F',
  'CDU': '#000000',
  'CSU': '#008AC5',
  'Grüne': '#64A12D',
  'FDP': '#FFED00',
  'Die Linke': '#BE3075',
  'BSW': '#732048',
  'AfD': '#009EE0',
  'Freie Wähler': '#F7A800',
  'Parteilos': '#808080',
};

export function getPartyColor(party: string): string {
  return PARTY_COLORS[party] ?? '#808080';
}

/**
 * Find the party with the most representatives in a district.
 */
export function getMajorityParty(representatives: { party: string }[]): string | undefined {
  const counts = new Map<string, number>();
  for (const r of representatives) {
    counts.set(r.party, (counts.get(r.party) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [party, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = party;
    }
  }
  return best;
}
