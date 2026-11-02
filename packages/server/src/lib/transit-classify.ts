import type { TransitAlert } from '@city-monitor/shared';

/**
 * German keyword classification of a transit message, shared by every transit
 * provider (VBB departures, Geofox announcements). See .context/transit.md.
 */
export function classifyDisruption(summary: string): TransitAlert['type'] {
  const lower = summary.toLowerCase();
  if (lower.includes('ausfall') || lower.includes('cancel')) return 'cancellation';
  if (lower.includes('bauarbeit') || lower.includes('planned') || lower.includes('sperrung')) return 'planned-work';
  if (lower.includes('verspätung') || lower.includes('delay')) return 'delay';
  return 'disruption';
}

export function classifySeverity(summary: string): TransitAlert['severity'] {
  const lower = summary.toLowerCase();
  if (lower.includes('ausfall') || lower.includes('cancel') || lower.includes('sperrung')) return 'high';
  if (lower.includes('störung') || lower.includes('disruption')) return 'high';
  if (lower.includes('verspätung') || lower.includes('delay')) return 'medium';
  return 'low';
}

export function extractStops(summary: string): string[] {
  // Pattern 1: "zwischen X und Y"
  const zwischen = summary.match(/zwischen\s+(.+?)\s+und\s+(.+?)(?:\.|$)/i);
  if (zwischen) {
    return [zwischen[1].trim(), zwischen[2].trim()].filter(Boolean);
  }
  // Pattern 2: "X – Y" or "X - Y" (em-dash or hyphen range)
  const dash = summary.match(/:\s*(.+?)\s+[–-]\s+(.+?)(?:\.|,|$)/);
  if (dash) {
    return [dash[1].trim(), dash[2].trim()].filter(Boolean);
  }
  return [];
}
