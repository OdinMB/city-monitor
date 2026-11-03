/**
 * Interactive city map using MapLibre GL with CARTO tiles.
 *
 * Reference: .worldmonitor/public/map-styles/ — bundled CARTO map styles
 * Does NOT port worldmonitor's DeckGLMap component.
 */

import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre v6 ships its worker as a separate ES module. `?worker&url` has Vite
// bundle it into one self-contained file; plain `?url` would drop the shared
// chunk it imports and no tiles would load in production builds.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useCityConfig } from '../../hooks/useCityConfig.js';
import { useTheme } from '../../hooks/useTheme.js';
import { useTransit } from '../../hooks/useTransit.js';
import { useNewsDigest } from '../../hooks/useNewsDigest.js';
import { useSafety } from '../../hooks/useSafety.js';
import { useNina } from '../../hooks/useNina.js';
import { usePharmacies } from '../../hooks/usePharmacies.js';
import { useAeds } from '../../hooks/useAeds.js';
import { useTrafficIncidents } from '../../hooks/useTraffic.js';
import { useConstruction } from '../../hooks/useConstruction.js';
import { usePolitical } from '../../hooks/usePolitical.js';
import { useElectionGeojson, useElectionResults } from '../../hooks/useElectionResults.js';
import { useAirQualityGrid } from '../../hooks/useAirQualityGrid.js';
import { useAirQualityStations } from '../../hooks/useAirQualityStations.js';
import { withoutRelayedStations } from '../../lib/aqi.js';
import { useWaterLevels } from '../../hooks/useWaterLevels.js';
import { useBathing } from '../../hooks/useBathing.js';
import { useSocialAtlas } from '../../hooks/useSocialAtlas.js';
import { usePopulation } from '../../hooks/usePopulation.js';
import { useNoiseSensors } from '../../hooks/useNoiseSensors.js';
import { useBikeSharing } from '../../hooks/useBikeSharing.js';
import { useCitizenReports } from '../../hooks/useCitizenReports.js';
import { useTrafficAccidents } from '../../hooks/useTrafficAccidents.js';
import { useCommandCenter } from '../../hooks/useCommandCenter.js';
import { useIsDesktop, useIsTouchPhone } from '../../hooks/useMediaQuery.js';
import { cityLayers, effectiveChoice, effectiveNoiseLayer, effectiveSubLayers } from '../../lib/map-layers.js';
import { registerAllMapIcons } from '../../lib/map-icons.js';

import { DARK_STYLE, LIGHT_STYLE, EMPTY_AQ, EMPTY_UBA, EMPTY_WL, DISTRICT_URLS, POLITICAL_MARKER_LAYER, type SocialAtlasMetric, type PopulationMetric } from './constants.js';
import { simplifyMap, setTrafficRoadVisibility, setWaterAreaVisibility, setWeatherOverlay, setNoiseOverlay, setRentMapOverlay, loadStyle, zoomedInBounds } from './base.js';
import { showMapPopup, scheduleHoverClose } from './popups.js';
import { gestureHintLocale, setCooperativeGestures } from './gestures.js';
import { addDistrictLayer, addDistrictSource, removeDistrictLayers, ensureDistrictLabelsBelow, applyPoliticalStyling, setupDistrictHover, updatePoliticalMarkers, removePoliticalMarkers, buildPoliticalPopupHtml } from './layers/political.js';
import { filterNewsForMap, updateNewsMarkers, updateSafetyMarkers } from './layers/news-safety.js';
import { updateTransitMarkers } from './layers/transit.js';
import { updateWarningPolygons } from './layers/warnings.js';
import { updatePharmacyMarkers, updateAedMarkers } from './layers/emergencies.js';
import { updateTrafficLayers, updateConstructionLayers } from './layers/traffic.js';
import { updateAqGridLayer, updateUbaStationLayer } from './layers/air-quality.js';
import { updateWaterLevelMarkers, updateBathingMarkers } from './layers/water.js';
import { updateSocialAtlasLayer, updatePopulationLayer } from './layers/choropleth.js';
import { socialAtlasOf } from '../../lib/social-atlas.js';
import { updateNoiseSensorMarkers } from './layers/noise-sensors.js';
import { updateBikeSharingMarkers } from './layers/bike-sharing.js';
import { updateCitizenReportMarkers } from './layers/citizen-reports.js';
import { updateTrafficAccidentLayer } from './layers/traffic-accidents.js';
import { updateElectionLayer } from './layers/elections.js';

maplibregl.setWorkerUrl(maplibreWorkerUrl);

/** Symbol layer IDs that should animate in after fly-in */
const MARKER_LAYERS = [
  'transit-marker-icon',
  'news-marker-icon',
  'safety-marker-icon',
  'wl-marker-icon',
  'bathing-marker-icon',
  'aq-marker-icon',
  'aq-uba-icon',
  'noise-sensor-icon',
  'pharmacy-marker-icon',
  'aed-marker-icon',
  'construction-points',
  'political-markers',
];

/** Animate marker layers from invisible to fully visible with stagger */
function animateMarkerEntrance(map: maplibregl.Map) {
  const duration = 500; // ms
  const stagger = 100; // ms between layer groups

  for (let i = 0; i < MARKER_LAYERS.length; i++) {
    const layerId = MARKER_LAYERS[i];
    if (!map.getLayer(layerId)) continue;

    // Set initial opacity to 0
    try {
      map.setPaintProperty(layerId, 'icon-opacity', 0);
    } catch {
      continue; // layer type might not support icon-opacity
    }

    // Animate opacity from 0 → 1
    const delay = i * stagger;
    const startTime = performance.now() + delay;

    const animate = () => {
      if (!map.getLayer(layerId)) return;
      const elapsed = performance.now() - startTime;
      if (elapsed < 0) {
        requestAnimationFrame(animate);
        return;
      }
      const progress = Math.min(elapsed / duration, 1);
      // ease-out quad
      const eased = 1 - (1 - progress) * (1 - progress);
      try {
        map.setPaintProperty(layerId, 'icon-opacity', eased);
      } catch {
        return;
      }
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }
}

/**
 * Opening zoom in the phone layout (below `sm`), where the map is a short band
 * a few hundred pixels across. Fitting the whole city there opens near the
 * minimum zoom, so phones open on the city's centre at roughly the inner-city
 * scale instead (Berlin: about the Ringbahn). Desktop still fits the bounds.
 */
const PHONE_OPENING_ZOOM = 11;

/**
 * How far past the fitted whole-city view a desktop map opens. Fitting the
 * bounds shows the city's empty outskirts at the edges; half a zoom step in
 * keeps the built-up city filling the map.
 */
const FITTED_OPENING_ZOOM_IN = 0.5;

/** Opening view for a new map: the city centre on phones, the whole city otherwise. */
function initialMapView(
  mapConfig: { center: [number, number]; zoom: number; bounds?: [[number, number], [number, number]] },
  isPhoneLayout: boolean,
): Pick<maplibregl.MapOptions, 'center' | 'zoom' | 'bounds' | 'fitBoundsOptions'> {
  if (isPhoneLayout) return { center: mapConfig.center, zoom: PHONE_OPENING_ZOOM };
  if (!mapConfig.bounds) return { center: mapConfig.center, zoom: mapConfig.zoom };
  return { bounds: zoomedInBounds(mapConfig.bounds, FITTED_OPENING_ZOOM_IN), fitBoundsOptions: { padding: 20 } };
}

function asError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

export function CityMap() {
  const city = useCityConfig();
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const isTouchPhone = useIsTouchPhone();
  // Read once when the map is created; a later resize keeps the user's view.
  const isPhoneLayoutRef = useRef(!useIsDesktop());
  // A base-map style that fails to load rejects a promise, which no error
  // boundary sees; it is kept here and thrown during render (see the end).
  const [styleError, setStyleError] = useState<Error | null>(null);
  const catLabel = useCallback((cat: string) => t(`category.${cat}`, cat), [t]);
  // The layer state is shared and outlives a switch to another city, so the
  // map draws only what this city has, and asks the API for nothing else.
  const available = useMemo(() => cityLayers(city), [city]);
  const { data: transitAlerts } = useTransit(city.id, available.traffic.includes('public-transport'));
  const { data: newsDigest } = useNewsDigest(city.id, available.news.includes('news'));
  const { data: safetyReports } = useSafety(city.id, available.news.includes('police'));
  const { data: ninaWarnings } = useNina(city.id);
  const { data: pharmacyList } = usePharmacies(city.id, available.emergencies.includes('pharmacies'));
  const { data: aedList } = useAeds(city.id, available.emergencies.includes('aeds'));
  const { data: trafficIncidents } = useTrafficIncidents(city.id);
  const { data: constructionSites } = useConstruction(city.id, available.traffic.includes('roadworks'));
  const { data: aqGrid } = useAirQualityGrid(city.id);
  const { data: ubaStations } = useAirQualityStations(city.id, city.features.includes('airQualityStations'));
  const { data: noiseSensorData } = useNoiseSensors(city.id, available.noiseLive);
  const { data: waterLevelData } = useWaterLevels(city.id);
  const { data: bathingData } = useBathing(city.id, available.water.includes('bathing'));
  const selectedLayers = useCommandCenter((s) => s.activeLayers);
  const activeLayers = useMemo(
    () => new Set([...selectedLayers].filter((layer) => available.layers.has(layer))),
    [selectedLayers, available],
  );
  // Lazy: fetched only while the layer is on (a fortnight of reports is too large for bootstrap)
  const reportsActive = activeLayers.has('reports');
  const { data: citizenReportData } = useCitizenReports(city.id, reportsActive);
  const selectedNews = useCommandCenter((s) => s.newsSubLayers);
  const newsSubLayers = useMemo(() => effectiveSubLayers(selectedNews, available.news), [selectedNews, available]);
  const selectedEmergencies = useCommandCenter((s) => s.emergencySubLayers);
  const emergencySubLayers = useMemo(() => effectiveSubLayers(selectedEmergencies, available.emergencies), [selectedEmergencies, available]);
  // Falls back to 'bundestag' for a layer only political cities have; unused while the layer is off.
  const politicalLayer = effectiveChoice(useCommandCenter((s) => s.politicalLayer), available.political) ?? 'bundestag';
  // The representatives' views colour the district outlines; the election view draws its own areas.
  const electionsActive = activeLayers.has('political') && politicalLayer === 'elections';
  const politicalActive = activeLayers.has('political') && !electionsActive;
  const selectedTraffic = useCommandCenter((s) => s.trafficSubLayers);
  const trafficSubLayers = useMemo(() => effectiveSubLayers(selectedTraffic, available.traffic), [selectedTraffic, available]);
  const trafficActive = activeLayers.has('traffic') && trafficSubLayers.has('incidents');
  const constructionActive = activeLayers.has('traffic') && trafficSubLayers.has('roadworks');
  const roadsActive = trafficActive || constructionActive;
  const weatherActive = activeLayers.has('weather');
  const noiseLayerSel = effectiveNoiseLayer(useCommandCenter((s) => s.noiseLayer), available);
  const noiseLiveData = useCommandCenter((s) => s.noiseLiveData) && available.noiseLive;
  const noiseActive = activeLayers.has('noise');
  const noiseWmsActive = noiseActive && noiseLayerSel !== null;
  // The WMS layer to request; unused while no noise map is shown.
  const noiseWmsLayer = noiseLayerSel ?? 'road';
  const socialLayer = effectiveChoice(useCommandCenter((s) => s.socialLayer), available.social);
  const socialActive = activeLayers.has('social');
  const rentMapActive = socialActive && socialLayer === 'rent';
  const socialAtlasActive = socialActive && socialLayer !== undefined && socialLayer !== 'rent';
  const socialAtlasMetric: SocialAtlasMetric =
    socialLayer === 'single-parent' ? 'singleParent'
    : socialLayer === 'welfare' ? 'welfare'
    : socialLayer === 'child-poverty' ? 'childPoverty'
    : 'unemployment';
  // The city's own indicator labels and colour ramps
  const socialAtlas = socialAtlasOf(city.id);
  const populationLayerSel = useCommandCenter((s) => s.populationLayer);
  const populationActive = activeLayers.has('population');
  const populationMetric: PopulationMetric =
    populationLayerSel === 'pop-elderly' ? 'elderlyPct'
    : populationLayerSel === 'pop-foreign' ? 'foreignPct'
    : 'density';
  const waterActive = activeLayers.has('water');
  const selectedWater = useCommandCenter((s) => s.waterSubLayers);
  const waterSubLayers = useMemo(() => effectiveSubLayers(selectedWater, available.water), [selectedWater, available]);
  const { data: socialAtlasData } = useSocialAtlas(city.id, socialAtlasActive);
  const { data: populationData } = usePopulation(city.id, populationActive);
  // Lazy: Berlin's stations are about 150 KB, fetched only while the layer is on
  const bikeSharingActive = activeLayers.has('bike-sharing');
  const { data: bikeSharingData } = useBikeSharing(city.id, bikeSharingActive);
  // Lazy: Berlin's year of accidents is about 470 KB, fetched only while the layer is on
  const accidentsActive = activeLayers.has('accidents');
  const accidentFilter = useCommandCenter((s) => s.accidentFilter);
  const { data: accidentData } = useTrafficAccidents(city.id, accidentsActive);
  // Lazy: the polygons (Berlin ~110 KB) and results only while the election view is on
  const { data: electionGeoJsonResp } = useElectionGeojson(city.id, electionsActive);
  const { data: electionResultsResp } = useElectionResults(city.id, electionsActive);
  const electionGeoJson = electionsActive ? (electionGeoJsonResp?.data ?? null) : null;
  const electionResults = electionResultsResp?.data ?? null;
  const { data: bezirkeData } = usePolitical(city.id, 'bezirke', available.political.includes('bezirke'));
  const { data: bundestagData } = usePolitical(city.id, 'bundestag', available.political.includes('bundestag'));
  const { data: stateBezirkeData } = usePolitical(city.id, 'state-bezirke', available.political.includes('landesparlament'));
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const isDark = theme === 'dark';
  const mapConfig = city.map;

  const transitItems = useMemo(
    () => (activeLayers.has('traffic') && trafficSubLayers.has('public-transport')) ? (transitAlerts ?? []) : [],
    [activeLayers, trafficSubLayers, transitAlerts],
  );
  const newsActive = activeLayers.has('news');
  const newsItems = useMemo(
    () => (newsActive && newsSubLayers.has('news'))
      ? filterNewsForMap(newsDigest?.items ?? [], city.coordinates, city.boundingBox)
      : [],
    [newsActive, newsSubLayers, newsDigest?.items, city.coordinates, city.boundingBox],
  );
  const safetyItems = useMemo(
    () => (newsActive && newsSubLayers.has('police')) ? (safetyReports ?? []) : [],
    [newsActive, newsSubLayers, safetyReports],
  );
  const warningItems = useMemo(
    () => activeLayers.has('warnings') ? (ninaWarnings ?? []) : [],
    [activeLayers, ninaWarnings],
  );
  const emergencyActive = activeLayers.has('emergencies');
  const pharmacyItems = useMemo(
    () => (emergencyActive && emergencySubLayers.has('pharmacies')) ? (pharmacyList ?? []) : [],
    [emergencyActive, emergencySubLayers, pharmacyList],
  );
  const aedItems = useMemo(
    () => (emergencyActive && emergencySubLayers.has('aeds')) ? (aedList ?? []) : [],
    [emergencyActive, emergencySubLayers, aedList],
  );
  const trafficItems = useMemo(
    () => trafficActive ? (trafficIncidents ?? []) : [],
    [trafficActive, trafficIncidents],
  );
  const constructionItems = useMemo(
    () => constructionActive ? (constructionSites ?? []) : [],
    [constructionActive, constructionSites],
  );
  const aqActive = activeLayers.has('air-quality');
  const ubaItems = aqActive ? (ubaStations ?? EMPTY_UBA) : EMPTY_UBA;
  // An official station shown from UBA is not drawn a second time from WAQI
  const aqGridItems = useMemo(
    () => aqActive ? withoutRelayedStations(aqGrid ?? EMPTY_AQ, ubaItems) : EMPTY_AQ,
    [aqActive, aqGrid, ubaItems],
  );
  const lang = i18n.language;
  const noiseSensorItems = useMemo(
    () => (noiseActive && noiseLiveData) ? (noiseSensorData?.data ?? []) : [],
    [noiseActive, noiseLiveData, noiseSensorData?.data],
  );
  const waterLevelItems = (waterActive && waterSubLayers.has('levels')) ? (waterLevelData?.stations ?? EMPTY_WL) : EMPTY_WL;
  const bathingItems = useMemo(
    () => (waterActive && waterSubLayers.has('bathing')) ? (bathingData ?? []) : [],
    [waterActive, waterSubLayers, bathingData],
  );
  const citizenReportItems = useMemo(
    () => reportsActive ? (citizenReportData?.data?.reports ?? []) : [],
    [reportsActive, citizenReportData?.data?.reports],
  );
  const socialAtlasGeoJson = socialAtlasActive ? (socialAtlasData ?? null) : null;
  const populationGeoJson = populationActive ? (populationData ?? null) : null;
  const bikeSharingItems = bikeSharingActive ? (bikeSharingData?.data ?? null) : null;
  const accidentItems = accidentsActive ? (accidentData?.data ?? null) : null;

  // Keep current values in refs so the style.load handler always reads fresh values
  const isDarkRef = useRef(isDark);
  isDarkRef.current = isDark;
  const cityIdRef = useRef(city.id);
  cityIdRef.current = city.id;
  const cityCoordRef = useRef(city.coordinates);
  cityCoordRef.current = city.coordinates;
  const catLabelRef = useRef(catLabel);
  catLabelRef.current = catLabel;
  const isTouchPhoneRef = useRef(isTouchPhone);
  isTouchPhoneRef.current = isTouchPhone;
  const tRef = useRef(t);
  tRef.current = t;
  const transitItemsRef = useRef(transitItems);
  transitItemsRef.current = transitItems;
  const newsItemsRef = useRef(newsItems);
  newsItemsRef.current = newsItems;
  const safetyItemsRef = useRef(safetyItems);
  safetyItemsRef.current = safetyItems;
  const warningItemsRef = useRef(warningItems);
  warningItemsRef.current = warningItems;
  const pharmacyItemsRef = useRef(pharmacyItems);
  pharmacyItemsRef.current = pharmacyItems;
  const aedItemsRef = useRef(aedItems);
  aedItemsRef.current = aedItems;
  const trafficItemsRef = useRef(trafficItems);
  trafficItemsRef.current = trafficItems;
  const constructionItemsRef = useRef(constructionItems);
  constructionItemsRef.current = constructionItems;
  const aqGridItemsRef = useRef(aqGridItems);
  aqGridItemsRef.current = aqGridItems;
  const ubaItemsRef = useRef(ubaItems);
  ubaItemsRef.current = ubaItems;
  const langRef = useRef(lang);
  langRef.current = lang;
  const timeZoneRef = useRef(city.timezone);
  timeZoneRef.current = city.timezone;
  const noiseSensorItemsRef = useRef(noiseSensorItems);
  noiseSensorItemsRef.current = noiseSensorItems;
  const bikeSharingItemsRef = useRef(bikeSharingItems);
  bikeSharingItemsRef.current = bikeSharingItems;
  const accidentItemsRef = useRef(accidentItems);
  accidentItemsRef.current = accidentItems;
  const accidentFilterRef = useRef(accidentFilter);
  accidentFilterRef.current = accidentFilter;
  const waterLevelItemsRef = useRef(waterLevelItems);
  waterLevelItemsRef.current = waterLevelItems;
  const bathingItemsRef = useRef(bathingItems);
  bathingItemsRef.current = bathingItems;
  const citizenReportItemsRef = useRef(citizenReportItems);
  citizenReportItemsRef.current = citizenReportItems;
  const socialAtlasGeoJsonRef = useRef(socialAtlasGeoJson);
  socialAtlasGeoJsonRef.current = socialAtlasGeoJson;
  const socialAtlasMetricRef = useRef(socialAtlasMetric);
  socialAtlasMetricRef.current = socialAtlasMetric;
  const socialAtlasRef = useRef(socialAtlas);
  socialAtlasRef.current = socialAtlas;
  const populationGeoJsonRef = useRef(populationGeoJson);
  populationGeoJsonRef.current = populationGeoJson;
  const electionGeoJsonRef = useRef(electionGeoJson);
  electionGeoJsonRef.current = electionGeoJson;
  const electionResultsRef = useRef(electionResults);
  electionResultsRef.current = electionResults;
  const populationMetricRef = useRef(populationMetric);
  populationMetricRef.current = populationMetric;
  const roadsActiveRef = useRef(roadsActive);
  roadsActiveRef.current = roadsActive;
  const weatherActiveRef = useRef(weatherActive);
  weatherActiveRef.current = weatherActive;
  const noiseWmsActiveRef = useRef(noiseWmsActive);
  noiseWmsActiveRef.current = noiseWmsActive;
  const effectiveNoiseLayerRef = useRef(noiseWmsLayer);
  effectiveNoiseLayerRef.current = noiseWmsLayer;
  const rentMapActiveRef = useRef(rentMapActive);
  rentMapActiveRef.current = rentMapActive;
  const waterActiveRef = useRef(waterActive);
  waterActiveRef.current = waterActive;
  const politicalActiveRef = useRef(politicalActive);
  politicalActiveRef.current = politicalActive;
  const politicalLayerRef = useRef(politicalLayer);
  politicalLayerRef.current = politicalLayer;

  const mapReadyRef = useRef(false);

  // Create map once
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    const bounds = mapConfig.bounds as maplibregl.LngLatBoundsLike;
    const styleUrl = isDarkRef.current ? DARK_STYLE : LIGHT_STYLE;

    loadStyle(styleUrl).then((style) => {
      if (cancelled || !containerRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style,
        ...initialMapView(mapConfig, isPhoneLayoutRef.current),
        minZoom: mapConfig.minZoom ?? 9,
        maxZoom: mapConfig.maxZoom ?? 16,
        maxBounds: bounds,
        attributionControl: false,
        // Touch phones: one finger scrolls the page, two move the map
        cooperativeGestures: isTouchPhoneRef.current,
        locale: gestureHintLocale(tRef.current),
      });

      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      map.addControl(
        new maplibregl.AttributionControl({ compact: true }),
        'top-right',
      );

      map.on('load', () => {
        simplifyMap(map);
        setTrafficRoadVisibility(map, roadsActiveRef.current, isDarkRef.current);
        setWaterAreaVisibility(map, waterActiveRef.current, isDarkRef.current);
        registerAllMapIcons(map, isDarkRef.current);
        addDistrictLayer(map, cityIdRef.current, isDarkRef.current);
        setupDistrictHover(map);

        // Render data layers immediately and animate markers in
        mapReadyRef.current = true;
        updateTrafficLayers(map, trafficItemsRef.current, isDarkRef.current);
        updateConstructionLayers(map, constructionItemsRef.current, isDarkRef.current);
        updateTransitMarkers(map, transitItemsRef.current ?? [], isDarkRef.current);
        updateNewsMarkers(map, newsItemsRef.current, isDarkRef.current, cityCoordRef.current, catLabelRef.current);
        updateSafetyMarkers(map, safetyItemsRef.current, isDarkRef.current);
        updateWarningPolygons(map, warningItemsRef.current, isDarkRef.current);
        updatePharmacyMarkers(map, pharmacyItemsRef.current, isDarkRef.current);
        updateAedMarkers(map, aedItemsRef.current, isDarkRef.current);
        updateAqGridLayer(map, aqGridItemsRef.current, isDarkRef.current, cityIdRef.current);
        updateUbaStationLayer(map, ubaItemsRef.current, isDarkRef.current, langRef.current, timeZoneRef.current);
        updateNoiseSensorMarkers(map, noiseSensorItemsRef.current, isDarkRef.current);
        updateBikeSharingMarkers(map, bikeSharingItemsRef.current, isDarkRef.current);
        updateTrafficAccidentLayer(map, accidentItemsRef.current, accidentFilterRef.current, isDarkRef.current);
        updateWaterLevelMarkers(map, waterLevelItemsRef.current, isDarkRef.current);
        updateBathingMarkers(map, bathingItemsRef.current, isDarkRef.current);
        updateCitizenReportMarkers(map, citizenReportItemsRef.current, isDarkRef.current, cityIdRef.current);
        updateSocialAtlasLayer(map, socialAtlasGeoJsonRef.current, socialAtlasMetricRef.current, isDarkRef.current, socialAtlasRef.current);
        updatePopulationLayer(map, populationGeoJsonRef.current, populationMetricRef.current, isDarkRef.current);
        updateElectionLayer(map, electionGeoJsonRef.current, electionResultsRef.current, isDarkRef.current);
        setWeatherOverlay(map, weatherActiveRef.current);
        setNoiseOverlay(map, noiseWmsActiveRef.current, cityIdRef.current, effectiveNoiseLayerRef.current);
        setRentMapOverlay(map, rentMapActiveRef.current, cityIdRef.current);

        // Ensure district labels render below all marker icons
        ensureDistrictLabelsBelow(map);

        // Animate marker layers: fade in opacity over 500ms
        animateMarkerEntrance(map);

        // Collapse the attribution control (MapLibre opens it by default)
        containerRef.current
          ?.querySelector('.maplibregl-ctrl-attrib')
          ?.classList.remove('maplibregl-compact-show');
      });

      mapRef.current = map;
    }).catch((err: unknown) => {
      if (!cancelled) setStyleError(asError(err));
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        mapReadyRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Theme / city change — swap style, re-simplify, re-add districts + markers
  const isFirstRender = useRef(true);
  useEffect(() => {
    // Skip on mount — the initial style is set in the constructor above
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const map = mapRef.current;
    if (!map) return;
    const styleUrl = isDark ? DARK_STYLE : LIGHT_STYLE;
    loadStyle(styleUrl)
      .then((style) => map.setStyle(style))
      .catch((err: unknown) => setStyleError(asError(err)));
    map.once('style.load', () => {
      simplifyMap(map);
      setTrafficRoadVisibility(map, roadsActiveRef.current, isDark);
      setWaterAreaVisibility(map, waterActiveRef.current, isDark);
      registerAllMapIcons(map, isDark);

      // Restore the correct political/district GeoJSON after style swap
      if (politicalActiveRef.current) {
        const resolved = DISTRICT_URLS[city.id];
        if (resolved) {
          fetch(resolved.url)
            .then((r) => r.json())
            .then((geojson: GeoJSON.FeatureCollection) => {
              if (map.getSource('districts')) return; // already added
              addDistrictSource(map, geojson, resolved.nameField, isDark);
              activeNameFieldRef.current = resolved.nameField;
              politicalGeoFeaturesRef.current = geojson.features;
              const freshData = politicalDataRef.current;
              if (freshData) applyPoliticalStyling(map, freshData, geojson.features, isDark, resolved.nameField);
            })
            .catch(() => { /* GeoJSON fetch failed — fall back to default districts */ addDistrictLayer(map, city.id, isDark); });
        } else {
          addDistrictLayer(map, city.id, isDark);
        }
      } else {
        addDistrictLayer(map, city.id, isDark);
      }

      updateTrafficLayers(map, trafficItemsRef.current, isDark);
      updateConstructionLayers(map, constructionItemsRef.current, isDark);
      updateTransitMarkers(map, transitItemsRef.current ?? [], isDark);
      updateNewsMarkers(map, newsItemsRef.current, isDark, cityCoordRef.current, catLabelRef.current);
      updateSafetyMarkers(map, safetyItemsRef.current, isDark);
      updateWarningPolygons(map, warningItemsRef.current, isDark);
      updatePharmacyMarkers(map, pharmacyItemsRef.current, isDark);
      updateAedMarkers(map, aedItemsRef.current, isDark);
      updateAqGridLayer(map, aqGridItemsRef.current, isDark, cityIdRef.current);
      updateUbaStationLayer(map, ubaItemsRef.current, isDark, langRef.current, timeZoneRef.current);
      updateNoiseSensorMarkers(map, noiseSensorItemsRef.current, isDark);
      updateBikeSharingMarkers(map, bikeSharingItemsRef.current, isDark);
      updateTrafficAccidentLayer(map, accidentItemsRef.current, accidentFilterRef.current, isDark);
      updateWaterLevelMarkers(map, waterLevelItemsRef.current, isDark);
      updateBathingMarkers(map, bathingItemsRef.current, isDark);
      updateCitizenReportMarkers(map, citizenReportItemsRef.current, isDark, cityIdRef.current);
      updateSocialAtlasLayer(map, socialAtlasGeoJsonRef.current, socialAtlasMetricRef.current, isDark, socialAtlasRef.current);
      updatePopulationLayer(map, populationGeoJsonRef.current, populationMetricRef.current, isDark);
      updateElectionLayer(map, electionGeoJsonRef.current, electionResultsRef.current, isDark);
      setWeatherOverlay(map, weatherActiveRef.current);
      setNoiseOverlay(map, noiseWmsActiveRef.current, cityIdRef.current, effectiveNoiseLayerRef.current);
      setRentMapOverlay(map, rentMapActiveRef.current, cityIdRef.current);
      ensureDistrictLabelsBelow(map);
    });
  }, [isDark, city.id]);

  // Follow a phone turning (the phone breakpoint) and a language switch (the
  // hint's words). The constructor above set both for the first style load.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setCooperativeGestures(map, isTouchPhone, gestureHintLocale(t));
  }, [isTouchPhone, t]);

  // Show/hide weather precipitation overlay when layer is toggled
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => setWeatherOverlay(map, weatherActive);
    if (map.isStyleLoaded()) {
      apply();
      return;
    }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
  }, [weatherActive]);

  // Show/hide the city's Wohnlagenkarte (rent map) overlay when layer is toggled
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => setRentMapOverlay(map, rentMapActive, city.id);
    if (map.isStyleLoaded()) {
      apply();
      return;
    }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
  }, [rentMapActive, city.id]);

  // Show/hide noise WMS overlay when layer or sub-layer changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => setNoiseOverlay(map, noiseWmsActive, city.id, noiseWmsLayer);
    if (map.isStyleLoaded()) {
      apply();
      return;
    }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
  }, [noiseWmsActive, noiseWmsLayer, city.id]);

  // Keep district labels below marker layers whenever marker data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    const apply = () => ensureDistrictLabelsBelow(map);
    if (map.isStyleLoaded()) { apply(); return; }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
  }, [transitItems, newsItems, safetyItems, warningItems, pharmacyItems, aedItems, trafficItems, constructionItems, aqGridItems, noiseSensorItems, bikeSharingItems, accidentItems, waterLevelItems, bathingItems, citizenReportItems]);

  // Update transit markers when alerts or layer toggle changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => updateTransitMarkers(map, transitItems, isDarkRef.current);
    if (map.isStyleLoaded()) { apply(); return; }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
  }, [transitItems]);

  // Update news markers when data or layer toggle changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => updateNewsMarkers(map, newsItems, isDarkRef.current, cityCoordRef.current, catLabelRef.current);
    if (map.isStyleLoaded()) { apply(); return; }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
  }, [newsItems]);

  // Update safety markers when data or layer toggle changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => updateSafetyMarkers(map, safetyItems, isDarkRef.current);
    if (map.isStyleLoaded()) { apply(); return; }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
  }, [safetyItems]);

  // Update NINA warning polygons
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => updateWarningPolygons(map, warningItems, isDarkRef.current);
    if (map.isStyleLoaded()) { apply(); return; }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
  }, [warningItems]);

  // Update emergency markers (pharmacies + AEDs) — combined into a single effect
  // to ensure both update atomically when the emergency layer toggles on.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      updatePharmacyMarkers(map, pharmacyItems, isDarkRef.current);
      updateAedMarkers(map, aedItems, isDarkRef.current);
    };
    if (map.isStyleLoaded()) { apply(); return; }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emergencyActive, emergencySubLayers, pharmacyList, aedList]);

  // Update traffic incident layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => updateTrafficLayers(map, trafficItems, isDarkRef.current);
    if (map.isStyleLoaded()) { apply(); return; }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
  }, [trafficItems]);

  // Update construction layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => updateConstructionLayers(map, constructionItems, isDarkRef.current);
    if (map.isStyleLoaded()) { apply(); return; }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
  }, [constructionItems]);

  // Show/hide major road layers when traffic or construction data layer is toggled
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => setTrafficRoadVisibility(map, roadsActive, isDarkRef.current);
    if (map.isStyleLoaded()) {
      apply();
      return;
    }
    // Style not loaded yet — defer until idle, but clean up on re-render/unmount
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
  }, [roadsActive]);

  // Show/hide water area layers when water-levels data layer is toggled
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => setWaterAreaVisibility(map, waterActive, isDarkRef.current);
    if (map.isStyleLoaded()) {
      apply();
      return;
    }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
  }, [waterActive]);

  // Update air quality grid circles
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => updateAqGridLayer(map, aqGridItems, isDarkRef.current, cityIdRef.current);
    if (map.isStyleLoaded()) { apply(); return; }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };

  }, [aqGridItems]);

  // Update the official (UBA) station badges; they spell out the class name, so also on a language change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => updateUbaStationLayer(map, ubaItems, isDarkRef.current, lang, timeZoneRef.current);
    if (map.isStyleLoaded()) { apply(); return; }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
  }, [ubaItems, lang]);

  // Update noise sensor markers (Berlin only — backend returns empty for cities without config)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => updateNoiseSensorMarkers(map, noiseSensorItems, isDarkRef.current);
    if (map.isStyleLoaded()) { apply(); return; }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
  }, [noiseSensorItems]);

  // Update bike-sharing stations (lazy: data only while the layer is on)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => updateBikeSharingMarkers(map, bikeSharingItems, isDarkRef.current);
    if (map.isStyleLoaded()) { apply(); return; }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
  }, [bikeSharingItems]);

  // Update the accident layer (lazy: data only while the layer is on) and its filter
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => updateTrafficAccidentLayer(map, accidentItems, accidentFilter, isDarkRef.current);
    if (map.isStyleLoaded()) { apply(); return; }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
  }, [accidentItems, accidentFilter]);

  // Update water level markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => updateWaterLevelMarkers(map, waterLevelItems, isDarkRef.current);
    if (map.isStyleLoaded()) { apply(); return; }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };

  }, [waterLevelItems]);

  // Update bathing water markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => updateBathingMarkers(map, bathingItems, isDarkRef.current);
    if (map.isStyleLoaded()) { apply(); return; }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
  }, [bathingItems]);

  // Update citizen report markers (lazy — fetched only while the reports layer is on)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => updateCitizenReportMarkers(map, citizenReportItems, isDarkRef.current, cityIdRef.current);
    if (map.isStyleLoaded()) { apply(); return; }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
  }, [citizenReportItems]);

  // Update social atlas choropleth (lazy — geojson only available when layer is toggled on)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => updateSocialAtlasLayer(map, socialAtlasGeoJson, socialAtlasMetric, isDarkRef.current, socialAtlas);
    if (map.isStyleLoaded()) { apply(); return; }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };

  }, [socialAtlasGeoJson, socialAtlasMetric, socialAtlas]);

  // Update population choropleth (lazy — geojson only available when a pop-* sub-layer is active)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => updatePopulationLayer(map, populationGeoJson, populationMetric, isDarkRef.current);
    if (map.isStyleLoaded()) { apply(); return; }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };

  }, [populationGeoJson, populationMetric]);

  // Update the election view's areas (lazy — polygons only while the view is on)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => updateElectionLayer(map, electionGeoJson, electionResults, isDarkRef.current);
    if (map.isStyleLoaded()) { apply(); return; }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
  }, [electionGeoJson, electionResults]);

  // Political layer: swap GeoJSON source + apply/reset styling
  const politicalData = politicalLayer === 'bundestag'
    ? bundestagData
    : politicalLayer === 'bezirke'
      ? bezirkeData
      : stateBezirkeData;
  const politicalDataRef = useRef(politicalData);
  politicalDataRef.current = politicalData;
  const activeNameFieldRef = useRef('name');
  const politicalGeoFeaturesRef = useRef<GeoJSON.Feature[]>([]);
  const politicalWasActiveRef = useRef(false);

  // Effect 1: swap GeoJSON source when political layer changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Cleanup: only runs when political was previously active (avoids calling
    // map.getLayer() before the style is parsed on the very first render).
    // Skips the isStyleLoaded() guard because other effects in the same render
    // cycle may have added sources, temporarily making isStyleLoaded() false.
    if (!politicalActive) {
      if (politicalWasActiveRef.current) {
        removePoliticalMarkers(map);
        politicalGeoFeaturesRef.current = [];
        addDistrictLayer(map, cityIdRef.current, isDarkRef.current);
        activeNameFieldRef.current = DISTRICT_URLS[cityIdRef.current]?.nameField ?? 'name';
        politicalWasActiveRef.current = false;
      }
      return;
    }

    // Creation path requires the style to be fully loaded
    if (!map.isStyleLoaded()) return;

    politicalWasActiveRef.current = true;

    // All political sub-layers use the same Bezirke boundaries
    const resolved = DISTRICT_URLS[cityIdRef.current];
    if (!resolved) return;

    activeNameFieldRef.current = resolved.nameField;
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(resolved.url, { signal: controller.signal });
        const geojson: GeoJSON.FeatureCollection = await res.json();
        if (controller.signal.aborted) return;

        // Remove existing layers/source (including markers)
        removePoliticalMarkers(map);
        removeDistrictLayers(map);

        addDistrictSource(map, geojson, resolved.nameField, isDarkRef.current);

        // Store GeoJSON features for marker creation
        politicalGeoFeaturesRef.current = geojson.features;

        // Apply party colors + markers if data is already available
        const freshData = politicalDataRef.current;
        if (freshData) {
          applyPoliticalStyling(map, freshData, geojson.features, isDarkRef.current, resolved.nameField);
          updatePoliticalMarkers(map, freshData, geojson.features, politicalLayer as 'bezirke' | 'bundestag' | 'landesparlament', resolved.nameField, isDarkRef.current);
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') return;
        // Swap failure is non-critical — falls back to default district layer
      }
    })();

    return () => { controller.abort(); };
  }, [politicalActive, politicalLayer]);

  // Effect 2: apply party colors + markers when political data arrives/changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !politicalActive || !politicalData || politicalLayer === 'elections') return;
    applyPoliticalStyling(map, politicalData, politicalGeoFeaturesRef.current, isDarkRef.current, activeNameFieldRef.current);
    if (politicalGeoFeaturesRef.current.length) {
      updatePoliticalMarkers(map, politicalData, politicalGeoFeaturesRef.current, politicalLayer, activeNameFieldRef.current, isDarkRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [politicalData]);

  // Political popup on district click
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handler = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      if (!politicalActive || !e.features?.length) return;
      const data = politicalDataRef.current;
      if (!data?.length) return;
      const nameField = activeNameFieldRef.current;
      const name = e.features[0].properties?.[nameField] ?? '';
      if (!name) return;
      const html = buildPoliticalPopupHtml(name, data);
      showMapPopup(map, e.lngLat, html, { maxWidth: '320px', sticky: true });
    };

    map.on('click', 'district-fill', handler);
    return () => { map.off('click', 'district-fill', handler); };
  }, [politicalActive]);

  // Political marker popup on hover/click (registered once, uses refs for fresh data)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const getPopupHtml = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      if (!e.features?.length) return null;
      const name = e.features[0].properties?.name as string | undefined;
      if (!name) return null;
      const data = politicalDataRef.current;
      if (!data?.length) return null;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
      return { html: buildPoliticalPopupHtml(name, data), coords };
    };

    const onEnter = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      const result = getPopupHtml(e);
      if (!result) return;
      map.getCanvas().style.cursor = 'pointer';
      showMapPopup(map, result.coords, result.html, { maxWidth: '320px', sticky: false });
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = '';
      scheduleHoverClose();
    };
    const onClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      const result = getPopupHtml(e);
      if (!result) return;
      showMapPopup(map, result.coords, result.html, { maxWidth: '320px', sticky: true });
    };

    map.on('mouseenter', POLITICAL_MARKER_LAYER, onEnter);
    map.on('mouseleave', POLITICAL_MARKER_LAYER, onLeave);
    map.on('click', POLITICAL_MARKER_LAYER, onClick);
    return () => {
      map.off('mouseenter', POLITICAL_MARKER_LAYER, onEnter);
      map.off('mouseleave', POLITICAL_MARKER_LAYER, onLeave);
      map.off('click', POLITICAL_MARKER_LAYER, onClick);
    };
  }, []);

  // Hands a failed style load to the map's error boundary (MapErrorFallback,
  // whose Retry mounts the map again and so loads the style again).
  if (styleError) throw styleError;

  // isolate: MapLibre's gesture hint sits at z-index 99999; this keeps it
  // under the sticky top bar and the layer drawer when they overlap the map.
  return (
    <div className="relative isolate w-full h-full min-h-[300px]">
      <div
        ref={containerRef}
        data-testid="map-container"
        className="w-full h-full"
      />
    </div>
  );
}
