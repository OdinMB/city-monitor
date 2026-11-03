import type { HospitalTier } from '@city-monitor/shared';

/** Marker colour per emergency tier: the higher the tier, the deeper the red; no tier grey. */
export const HOSPITAL_TIER_COLORS: Record<HospitalTier, string> = {
  comprehensive: '#7f1d1d',
  extended: '#dc2626',
  basic: '#f97316',
  emergency: '#ea580c',
  limited: '#f59e0b',
  specialised: '#7c3aed',
  none: '#6b7280',
};

/** The tiers in the order the legend lists them. */
export const HOSPITAL_TIERS: readonly HospitalTier[] = ['comprehensive', 'extended', 'basic', 'emergency', 'limited', 'specialised', 'none'];
