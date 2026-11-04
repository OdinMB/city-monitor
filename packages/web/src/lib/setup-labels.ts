import type { TFunction } from 'i18next';
import { isStandardSectionKey, type PresetId, type ResolvedSection, type TileId } from './tile-setups.js';
import type { NamedSetup } from './setup-state.js';

/** The words a setup shows: its name, each tile's title (its heading, the hidden tray, the move controls) and each section's name. */

/** A preset's name, or the visitor's name for theirs ("My setup" when they left it blank). */
export function setupLabel(t: TFunction, setup: PresetId | Pick<NamedSetup, 'name'>): string {
  if (typeof setup === 'string') return t(`setup.preset.${setup}`);
  return setup.name.trim() || t('setup.custom');
}

const TILE_TITLE_KEYS: Record<TileId, string> = {
  briefing: 'panel.news.briefing',
  news: 'panel.news.title',
  weather: 'panel.weather.title',
  airQuality: 'panel.airQuality.title',
  transit: 'panel.transit.title',
  liftOutages: 'panel.liftOutages.title',
  pollen: 'panel.pollen.title',
  floodStatus: 'panel.floodStatus.title',
  events: 'panel.events.title',
  appointments: 'panel.appointments.title',
  bathing: 'panel.bathing.title',
  crisis: 'panel.crisis.title',
  wastewater: 'panel.wastewater.title',
  electricity: 'panel.electricity.title',
  waterLevels: 'panel.waterLevels.title',
  support: 'support.title',
  councilMeetings: 'panel.councilMeetings.title',
  political: 'sidebar.layers.political',
  laborMarket: 'panel.laborMarket.title',
  population: 'panel.population.title',
  budget: 'panel.budget.title',
  feuerwehr: 'panel.feuerwehr.title',
  soilMoisture: 'panel.soilMoisture.title',
};

/** Tiles with a title of the city's own where it has one (`title_hamburg`). */
const CITY_TITLED: ReadonlySet<TileId> = new Set(['councilMeetings']);

export function tileTitle(t: TFunction, id: TileId, cityId: string): string {
  return CITY_TITLED.has(id) ? t(TILE_TITLE_KEYS[id], { context: cityId }) : t(TILE_TITLE_KEYS[id]);
}

/** The visitor's name for a section, else its standard name. */
export function sectionLabel(t: TFunction, section: Pick<ResolvedSection, 'id' | 'name'>): string {
  const name = section.name?.trim();
  if (name) return name;
  return isStandardSectionKey(section.id) ? t(`setup.section.${section.id}`) : t('setup.untitledSection');
}
