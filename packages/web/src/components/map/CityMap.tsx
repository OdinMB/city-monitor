/**
 * Interactive city map using MapLibre GL with CARTO tiles.
 *
 * Reference: .worldmonitor/public/map-styles/ — bundled CARTO map styles
 * Does NOT port worldmonitor's DeckGLMap component.
 */

import { useRef, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
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
import { useAirQualityGrid } from '../../hooks/useAirQualityGrid.js';
import { useWaterLevels } from '../../hooks/useWaterLevels.js';
import { useBathing } from '../../hooks/useBathing.js';
import { useSocialAtlas } from '../../hooks/useSocialAtlas.js';
import { usePopulation } from '../../hooks/usePopulation.js';
import { useNoiseSensors } from '../../hooks/useNoiseSensors.js';
import { useCommandCenter } from '../../hooks/useCommandCenter.js';
import { registerAllMapIcons } from '../../lib/map-icons.js';

import { DARK_STYLE, LIGHT_STYLE, EMPTY_AQ, EMPTY_WL, DISTRICT_URLS, POLITICAL_MARKER_LAYER, type SocialAtlasMetric, type PopulationMetric } from './constants.js';
import { simplifyMap, setTrafficRoadVisibility, setWaterAreaVisibility, setWeatherOverlay, setNoiseOverlay, setRentMapOverlay } from './base.js';
import { showMapPopup, scheduleHoverClose } from './popups.js';
import { addDistrictLayer, applyPoliticalStyling, setupDistrictHover, updatePoliticalMarkers, removePoliticalMarkers, buildPoliticalPopupHtml } from './layers/political.js';
import { filterNewsForMap, updateNewsMarkers, updateSafetyMarkers } from './layers/news-safety.js';
import { updateTransitMarkers } from './layers/transit.js';
import { updateWarningPolygons } from './layers/warnings.js';
import { updatePharmacyMarkers, updateAedMarkers } from './layers/emergencies.js';
import { updateTrafficLayers, updateConstructionLayers } from './layers/traffic.js';
import { updateAqGridLayer } from './layers/air-quality.js';
import { updateWaterLevelMarkers, updateBathingMarkers } from './layers/water.js';
import { updateSocialAtlasLayer, updatePopulationLayer } from './layers/choropleth.js';
import { updateNoiseSensorMarkers } from './layers/noise-sensors.js';

export function CityMap() {
  const city = useCityConfig();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const catLabel = useCallback((cat: string) => t(`category.${cat}`, cat), [t]);
  const { data: transitAlerts } = useTransit(city.id);
  const { data: newsDigest } = useNewsDigest(city.id);
  const { data: safetyReports } = useSafety(city.id);
  const { data: ninaWarnings } = useNina(city.id);
  const { data: pharmacyList } = usePharmacies(city.id);
  const { data: aedList } = useAeds(city.id);
  const { data: trafficIncidents } = useTrafficIncidents(city.id);
  const { data: constructionSites } = useConstruction(city.id);
  const { data: aqGrid } = useAirQualityGrid(city.id);
  const { data: noiseSensorData } = useNoiseSensors(city.id);
  const { data: waterLevelData } = useWaterLevels(city.id);
  const { data: bathingData } = useBathing(city.id);
  const politicalLayer = useCommandCenter((s) => s.politicalLayer);
  const activeLayers = useCommandCenter((s) => s.activeLayers);
  const newsSubLayers = useCommandCenter((s) => s.newsSubLayers);
  const emergencySubLayers = useCommandCenter((s) => s.emergencySubLayers);
  const politicalActive = activeLayers.has('political');
  const trafficSubLayers = useCommandCenter((s) => s.trafficSubLayers);
  const trafficActive = activeLayers.has('traffic') && trafficSubLayers.has('incidents');
  const constructionActive = activeLayers.has('traffic') && trafficSubLayers.has('roadworks');
  const roadsActive = trafficActive || constructionActive;
  const weatherActive = activeLayers.has('weather');
  const noiseLayerSel = useCommandCenter((s) => s.noiseLayer);
  const noiseActive = activeLayers.has('noise');
  // Hamburg has no 'total' layer — fall back to 'road'
  const effectiveNoiseLayer = (noiseLayerSel === 'total' && city.id !== 'berlin') ? 'road' : noiseLayerSel;
  const socialLayer = useCommandCenter((s) => s.socialLayer);
  const socialActive = activeLayers.has('social') && city.id === 'berlin';
  const rentMapActive = socialActive && socialLayer === 'rent';
  const socialAtlasActive = socialActive && socialLayer !== 'rent';
  const socialAtlasMetric: SocialAtlasMetric =
    socialLayer === 'single-parent' ? 'singleParent'
    : socialLayer === 'welfare' ? 'welfare'
    : socialLayer === 'child-poverty' ? 'childPoverty'
    : 'unemployment';
  const populationLayerSel = useCommandCenter((s) => s.populationLayer);
  const populationActive = activeLayers.has('population') && city.id === 'berlin';
  const populationMetric: PopulationMetric =
    populationLayerSel === 'pop-elderly' ? 'elderlyPct'
    : populationLayerSel === 'pop-foreign' ? 'foreignPct'
    : 'density';
  const waterActive = activeLayers.has('water');
  const waterSubLayers = useCommandCenter((s) => s.waterSubLayers);
  const { data: socialAtlasData } = useSocialAtlas(city.id, socialAtlasActive);
  const { data: populationData } = usePopulation(city.id, populationActive);
  const { data: bezirkeData } = usePolitical(city.id, 'bezirke');
  const { data: bundestagData } = usePolitical(city.id, 'bundestag');
  const { data: stateBezirkeData } = usePolitical(city.id, 'state-bezirke');
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
  const aqGridItems = activeLayers.has('air-quality') ? (aqGrid ?? EMPTY_AQ) : EMPTY_AQ;
  const noiseSensorItems = useMemo(
    () => noiseActive ? (noiseSensorData?.data ?? []) : [],
    [noiseActive, noiseSensorData?.data],
  );
  const waterLevelItems = (waterActive && waterSubLayers.has('levels')) ? (waterLevelData?.stations ?? EMPTY_WL) : EMPTY_WL;
  const bathingItems = useMemo(
    () => (waterActive && waterSubLayers.has('bathing')) ? (bathingData ?? []) : [],
    [waterActive, waterSubLayers, bathingData],
  );
  const socialAtlasGeoJson = socialAtlasActive ? (socialAtlasData ?? null) : null;
  const populationGeoJson = populationActive ? (populationData ?? null) : null;

  // Keep current values in refs so the style.load handler always reads fresh values
  const isDarkRef = useRef(isDark);
  isDarkRef.current = isDark;
  const cityIdRef = useRef(city.id);
  cityIdRef.current = city.id;
  const cityCoordRef = useRef(city.coordinates);
  cityCoordRef.current = city.coordinates;
  const catLabelRef = useRef(catLabel);
  catLabelRef.current = catLabel;
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
  const noiseSensorItemsRef = useRef(noiseSensorItems);
  noiseSensorItemsRef.current = noiseSensorItems;
  const waterLevelItemsRef = useRef(waterLevelItems);
  waterLevelItemsRef.current = waterLevelItems;
  const bathingItemsRef = useRef(bathingItems);
  bathingItemsRef.current = bathingItems;
  const socialAtlasGeoJsonRef = useRef(socialAtlasGeoJson);
  socialAtlasGeoJsonRef.current = socialAtlasGeoJson;
  const socialAtlasMetricRef = useRef(socialAtlasMetric);
  socialAtlasMetricRef.current = socialAtlasMetric;
  const populationGeoJsonRef = useRef(populationGeoJson);
  populationGeoJsonRef.current = populationGeoJson;
  const populationMetricRef = useRef(populationMetric);
  populationMetricRef.current = populationMetric;
  const roadsActiveRef = useRef(roadsActive);
  roadsActiveRef.current = roadsActive;
  const weatherActiveRef = useRef(weatherActive);
  weatherActiveRef.current = weatherActive;
  const noiseActiveRef = useRef(noiseActive);
  noiseActiveRef.current = noiseActive;
  const effectiveNoiseLayerRef = useRef(effectiveNoiseLayer);
  effectiveNoiseLayerRef.current = effectiveNoiseLayer;
  const rentMapActiveRef = useRef(rentMapActive);
  rentMapActiveRef.current = rentMapActive;
  const waterActiveRef = useRef(waterActive);
  waterActiveRef.current = waterActive;
  const politicalActiveRef = useRef(politicalActive);
  politicalActiveRef.current = politicalActive;
  const politicalLayerRef = useRef(politicalLayer);
  politicalLayerRef.current = politicalLayer;

  // Create map once
  useEffect(() => {
    if (!containerRef.current) return;

    const bounds = mapConfig.bounds as maplibregl.LngLatBoundsLike;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: isDarkRef.current ? DARK_STYLE : LIGHT_STYLE,
      bounds,
      fitBoundsOptions: { padding: 20 },
      minZoom: mapConfig.minZoom ?? 9,
      maxZoom: mapConfig.maxZoom ?? 16,
      maxBounds: bounds,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      'bottom-right',
    );

    map.on('load', () => {
      simplifyMap(map);
      setTrafficRoadVisibility(map, roadsActiveRef.current, isDarkRef.current);
      setWaterAreaVisibility(map, waterActiveRef.current, isDarkRef.current);
      registerAllMapIcons(map, isDarkRef.current);
      addDistrictLayer(map, cityIdRef.current, isDarkRef.current);
      setupDistrictHover(map);
      updateTrafficLayers(map, trafficItemsRef.current, isDarkRef.current);
      updateConstructionLayers(map, constructionItemsRef.current, isDarkRef.current);
      updateTransitMarkers(map, transitItemsRef.current ?? [], isDarkRef.current);
      updateNewsMarkers(map, newsItemsRef.current, isDarkRef.current, cityCoordRef.current, catLabelRef.current);
      updateSafetyMarkers(map, safetyItemsRef.current, isDarkRef.current);
      updateWarningPolygons(map, warningItemsRef.current, isDarkRef.current);
      updatePharmacyMarkers(map, pharmacyItemsRef.current, isDarkRef.current);
      updateAedMarkers(map, aedItemsRef.current, isDarkRef.current);
      updateAqGridLayer(map, aqGridItemsRef.current, isDarkRef.current);
      updateNoiseSensorMarkers(map, noiseSensorItemsRef.current, isDarkRef.current);
      updateWaterLevelMarkers(map, waterLevelItemsRef.current, isDarkRef.current);
      updateBathingMarkers(map, bathingItemsRef.current, isDarkRef.current);
      updateSocialAtlasLayer(map, socialAtlasGeoJsonRef.current, socialAtlasMetricRef.current, isDarkRef.current);
      updatePopulationLayer(map, populationGeoJsonRef.current, populationMetricRef.current, isDarkRef.current);
      setWeatherOverlay(map, weatherActiveRef.current);
      setNoiseOverlay(map, noiseActiveRef.current, cityIdRef.current, effectiveNoiseLayerRef.current);
      setRentMapOverlay(map, rentMapActiveRef.current);

      // Collapse the attribution control (MapLibre opens it by default)
      containerRef.current
        ?.querySelector('.maplibregl-ctrl-attrib')
        ?.classList.remove('maplibregl-compact-show');
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
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
    map.setStyle(isDark ? DARK_STYLE : LIGHT_STYLE);
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
              map.addSource('districts', { type: 'geojson', data: geojson, generateId: true });
              map.addLayer({
                id: 'district-fill', type: 'fill', source: 'districts',
                paint: {
                  'fill-color': isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                  'fill-opacity': 0.35,
                },
              });
              map.addLayer({
                id: 'district-line', type: 'line', source: 'districts',
                paint: { 'line-color': isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)', 'line-width': 1.5, 'line-dasharray': [4, 2] },
              });
              map.addLayer({
                id: 'district-label', type: 'symbol', source: 'districts',
                layout: { 'text-field': ['get', resolved.nameField], 'text-size': 14, 'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'], 'text-anchor': 'center', 'text-allow-overlap': false },
                paint: { 'text-color': isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.7)', 'text-halo-color': isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)', 'text-halo-width': 1.5 },
              });
              activeNameFieldRef.current = resolved.nameField;
              const freshData = politicalDataRef.current;
              if (freshData) applyPoliticalStyling(map, freshData, isDark, resolved.nameField);
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
      updateAqGridLayer(map, aqGridItemsRef.current, isDark);
      updateNoiseSensorMarkers(map, noiseSensorItemsRef.current, isDark);
      updateWaterLevelMarkers(map, waterLevelItemsRef.current, isDark);
      updateBathingMarkers(map, bathingItemsRef.current, isDark);
      updateSocialAtlasLayer(map, socialAtlasGeoJsonRef.current, socialAtlasMetricRef.current, isDark);
      updatePopulationLayer(map, populationGeoJsonRef.current, populationMetricRef.current, isDark);
      setWeatherOverlay(map, weatherActiveRef.current);
      setNoiseOverlay(map, noiseActiveRef.current, cityIdRef.current, effectiveNoiseLayerRef.current);
      setRentMapOverlay(map, rentMapActiveRef.current);
    });
  }, [isDark, city.id]);

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

  // Show/hide Berlin Wohnlagenkarte (rent map) overlay when layer is toggled
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => setRentMapOverlay(map, rentMapActive);
    if (map.isStyleLoaded()) {
      apply();
      return;
    }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
  }, [rentMapActive]);

  // Show/hide noise WMS overlay when layer or sub-layer changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => setNoiseOverlay(map, noiseActive, city.id, effectiveNoiseLayer);
    if (map.isStyleLoaded()) {
      apply();
      return;
    }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
  }, [noiseActive, effectiveNoiseLayer, city.id]);

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
    const apply = () => updateAqGridLayer(map, aqGridItems, isDarkRef.current);
    if (map.isStyleLoaded()) { apply(); return; }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };

  }, [aqGridItems]);

  // Update noise sensor markers (Berlin only — backend returns empty for cities without config)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => updateNoiseSensorMarkers(map, noiseSensorItems, isDarkRef.current);
    if (map.isStyleLoaded()) { apply(); return; }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };
  }, [noiseSensorItems]);

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

  // Update social atlas choropleth (lazy — geojson only available when layer is toggled on)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => updateSocialAtlasLayer(map, socialAtlasGeoJson, socialAtlasMetric, isDarkRef.current);
    if (map.isStyleLoaded()) { apply(); return; }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };

  }, [socialAtlasGeoJson, socialAtlasMetric]);

  // Update population choropleth (lazy — geojson only available when a pop-* sub-layer is active)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => updatePopulationLayer(map, populationGeoJson, populationMetric, isDarkRef.current);
    if (map.isStyleLoaded()) { apply(); return; }
    map.once('idle', apply);
    return () => { map.off('idle', apply); };

  }, [populationGeoJson, populationMetric]);

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
        for (const id of ['district-label', 'district-line', 'district-fill']) {
          if (map.getLayer(id)) map.removeLayer(id);
        }
        if (map.getSource('districts')) map.removeSource('districts');

        map.addSource('districts', { type: 'geojson', data: geojson, generateId: true });
        map.addLayer({
          id: 'district-fill',
          type: 'fill',
          source: 'districts',
          paint: {
            'fill-color': isDarkRef.current ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
            'fill-opacity': 0.35,
          },
        });
        map.addLayer({
          id: 'district-line',
          type: 'line',
          source: 'districts',
          paint: {
            'line-color': isDarkRef.current ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)',
            'line-width': 1.5,
            'line-dasharray': [4, 2],
          },
        });
        map.addLayer({
          id: 'district-label',
          type: 'symbol',
          source: 'districts',
          layout: {
            'text-field': ['get', resolved.nameField],
            'text-size': 14,
            'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
            'text-anchor': 'center',
            'text-allow-overlap': false,
          },
          paint: {
            'text-color': isDarkRef.current ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.7)',
            'text-halo-color': isDarkRef.current ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)',
            'text-halo-width': 1.5,
          },
        });

        // Store GeoJSON features for marker creation
        politicalGeoFeaturesRef.current = geojson.features;

        // Apply party colors + markers if data is already available
        const freshData = politicalDataRef.current;
        if (freshData) {
          applyPoliticalStyling(map, freshData, isDarkRef.current, resolved.nameField);
          updatePoliticalMarkers(map, freshData, geojson.features, politicalLayer as 'bezirke' | 'bundestag' | 'landesparlament', resolved.nameField, isDarkRef.current);
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') return;
        console.error('[political] GeoJSON swap error:', e);
      }
    })();

    return () => { controller.abort(); };
  }, [politicalActive, politicalLayer]);

  // Effect 2: apply party colors + markers when political data arrives/changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !politicalActive || !politicalData) return;
    applyPoliticalStyling(map, politicalData, isDarkRef.current, activeNameFieldRef.current);
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

  return (
    <div className="relative w-full h-full min-h-[300px]">
      <div
        ref={containerRef}
        data-testid="map-container"
        className="w-full h-full"
      />
    </div>
  );
}
