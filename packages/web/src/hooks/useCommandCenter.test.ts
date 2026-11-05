import { beforeEach, describe, expect, it } from 'vitest';
import { defaultMapState, isCategoryOn, useCommandCenter, type DataLayer } from './useCommandCenter.js';

const initial = useCommandCenter.getState();

describe('useCommandCenter enterCity', () => {
  beforeEach(() => {
    useCommandCenter.setState(initial, true);
  });

  it('opens Hamburg with the water layer on top of the shared defaults', () => {
    useCommandCenter.getState().enterCity('hamburg');
    expect([...useCommandCenter.getState().activeLayers].sort()).toEqual(
      ['traffic', 'warnings', 'water', 'weather'],
    );
  });

  it('opens Hamburg’s water layer with river gauges only, not bathing quality', () => {
    useCommandCenter.getState().enterCity('hamburg');
    expect([...useCommandCenter.getState().waterSubLayers]).toEqual(['levels']);
  });

  it('opens Berlin without the water layer, and with every water sub-layer ready', () => {
    useCommandCenter.getState().enterCity('hamburg');
    useCommandCenter.getState().enterCity('berlin');
    expect(useCommandCenter.getState().activeLayers.has('water')).toBe(false);
    expect([...useCommandCenter.getState().waterSubLayers].sort()).toEqual(['bathing', 'levels', 'temperature']);
  });

  it('keeps the visitor’s layers when the same city is entered again', () => {
    useCommandCenter.getState().enterCity('hamburg');
    useCommandCenter.setState({ activeLayers: new Set<DataLayer>(['noise']) });
    useCommandCenter.getState().enterCity('hamburg');
    expect([...useCommandCenter.getState().activeLayers]).toEqual(['noise']);
  });

  it('resets to the new city’s defaults on a switch', () => {
    useCommandCenter.getState().enterCity('berlin');
    useCommandCenter.setState({ activeLayers: new Set<DataLayer>(['noise']) });
    useCommandCenter.getState().enterCity('hamburg');
    expect(useCommandCenter.getState().activeLayers.has('water')).toBe(true);
    expect(useCommandCenter.getState().activeLayers.has('noise')).toBe(false);
  });

  it('keeps single view to one layer', () => {
    useCommandCenter.setState({ singleView: true });
    useCommandCenter.getState().enterCity('hamburg');
    expect(useCommandCenter.getState().activeLayers.size).toBe(1);
  });
});

describe('useCommandCenter saved map state', () => {
  beforeEach(() => {
    useCommandCenter.setState(initial, true);
  });
  const state = () => useCommandCenter.getState();

  it('opens a city with its saved state in place of the city’s defaults', () => {
    state().enterCity('berlin');
    state().enterCity('hamburg', { activeLayers: new Set<DataLayer>(['noise']), politicalLayer: 'elections', noiseLayer: null });
    expect([...state().activeLayers]).toEqual(['noise']);
    expect(state().politicalLayer).toBe('elections');
    expect(state().noiseLayer).toBeNull();
    // What the saved state leaves out comes from the city's defaults
    expect([...state().waterSubLayers]).toEqual(['levels']);
  });

  it('starts a city without a saved state from its defaults, not the last city’s choices', () => {
    state().enterCity('berlin');
    state().setPoliticalLayer('elections');
    state().enterCity('hamburg');
    expect(state().politicalLayer).toBe(defaultMapState('hamburg').politicalLayer);
  });

  it('keeps the visitor’s state when the same city is entered again, saved state or not', () => {
    state().enterCity('hamburg');
    state().setPoliticalLayer('elections');
    state().enterCity('hamburg', { politicalLayer: 'bundestag' });
    expect(state().politicalLayer).toBe('elections');
  });

  it('applies a state on the same city too (a shared link, back to the visitor’s own)', () => {
    state().enterCity('hamburg');
    state().applyMapState('hamburg', { activeLayers: new Set<DataLayer>(['crime']) });
    expect([...state().activeLayers]).toEqual(['crime']);
    state().applyMapState('hamburg', {});
    expect(state().activeLayers).toEqual(defaultMapState('hamburg').activeLayers);
  });

  it('keeps single view to one category whatever the saved layers', () => {
    state().applyMapState('berlin', { singleView: true, activeLayers: new Set<DataLayer>(['parking', 'traffic', 'weather']) });
    expect([...state().activeLayers].sort()).toEqual(['parking', 'traffic']);
  });
});

describe('useCommandCenter categories', () => {
  beforeEach(() => {
    useCommandCenter.setState(initial, true);
  });
  const active = () => [...useCommandCenter.getState().activeLayers].sort();

  it('switches a category on with the layers given and off with all of its layers', () => {
    useCommandCenter.setState({ activeLayers: new Set<DataLayer>(['weather']) });
    useCommandCenter.getState().toggleCategory('environment', ['air-quality']);
    expect(active()).toEqual(['air-quality', 'weather']);
    useCommandCenter.getState().toggleLayer('noise');
    expect(active()).toEqual(['air-quality', 'noise', 'weather']);
    useCommandCenter.getState().toggleCategory('environment', ['air-quality']);
    expect(active()).toEqual(['weather']);
  });

  it('shows one category in single view, with as many of its layers as chosen', () => {
    useCommandCenter.setState({ singleView: true, activeLayers: new Set<DataLayer>(['weather']) });
    useCommandCenter.getState().toggleCategory('social', ['social']);
    useCommandCenter.getState().toggleLayer('crime');
    expect(active()).toEqual(['crime', 'social']);
    useCommandCenter.getState().toggleCategory('traffic', ['traffic']);
    expect(active()).toEqual(['traffic']);
  });

  it('keeps the first category shown when single view is switched on', () => {
    useCommandCenter.setState({ activeLayers: new Set<DataLayer>(['traffic', 'parking', 'weather']) });
    useCommandCenter.getState().toggleSingleView();
    expect(active()).toEqual(['parking', 'traffic']);
  });

  it('keeps a group on with its backdrop when its last layer goes, until its own switch turns it off', () => {
    const on = (c: Parameters<typeof isCategoryOn>[0]) => isCategoryOn(c, useCommandCenter.getState().activeLayers, useCommandCenter.getState().openEmpty);
    useCommandCenter.setState({ activeLayers: new Set<DataLayer>(['traffic', 'weather']), trafficSubLayers: new Set(['public-transport', 'incidents']) });
    useCommandCenter.getState().toggleTrafficSubLayer('public-transport');
    useCommandCenter.getState().toggleTrafficSubLayer('incidents');
    expect(active()).toEqual(['weather']);
    expect(on('traffic')).toBe(true);
    // A marker layer of the category brings it back to an ordinary category
    useCommandCenter.getState().toggleLayer('parking');
    expect([...useCommandCenter.getState().openEmpty]).toEqual([]);
    useCommandCenter.getState().toggleLayer('parking');
    expect(on('traffic')).toBe(true);
    useCommandCenter.getState().toggleCategory('traffic', ['traffic']);
    expect(on('traffic')).toBe(false);
    expect(active()).toEqual(['weather']);
    // Environment the same, through its layers
    useCommandCenter.getState().toggleCategory('environment', ['air-quality']);
    useCommandCenter.getState().toggleLayer('air-quality');
    expect(on('environment')).toBe(true);
    // A single-layer category just goes
    useCommandCenter.getState().toggleLayer('weather');
    expect(on('weather')).toBe(false);
  });

  it('keeps only one category, with or without layers, in single view', () => {
    const open = () => [...useCommandCenter.getState().openEmpty];
    useCommandCenter.setState({ activeLayers: new Set<DataLayer>(['air-quality']) });
    useCommandCenter.getState().toggleLayer('air-quality');
    expect(open()).toEqual(['environment']);
    useCommandCenter.getState().toggleSingleView();
    expect(open()).toEqual(['environment']);
    useCommandCenter.getState().toggleCategory('traffic', ['traffic']);
    expect(open()).toEqual([]);
    expect(active()).toEqual(['traffic']);
  });

  it('treats the traffic sub-layers as entries of the category: the last one off switches traffic off', () => {
    useCommandCenter.setState({ activeLayers: new Set<DataLayer>(['traffic', 'parking']), trafficSubLayers: new Set(['incidents']) });
    useCommandCenter.getState().toggleTrafficSubLayer('incidents');
    expect(active()).toEqual(['parking']);
    useCommandCenter.getState().toggleTrafficSubLayer('roadworks');
    expect(active()).toEqual(['parking', 'traffic']);
    expect([...useCommandCenter.getState().trafficSubLayers]).toEqual(['roadworks']);
  });

  it('shows open and in-progress citizen reports until closed ones are asked for, and keeps one status', () => {
    expect([...useCommandCenter.getState().reportStatuses].sort()).toEqual(['in_progress', 'open']);
    useCommandCenter.getState().toggleReportStatus('closed');
    expect(useCommandCenter.getState().reportStatuses.has('closed')).toBe(true);
    useCommandCenter.getState().toggleReportStatus('open');
    useCommandCenter.getState().toggleReportStatus('in_progress');
    useCommandCenter.getState().toggleReportStatus('closed');
    expect([...useCommandCenter.getState().reportStatuses]).toEqual(['closed']);
  });
});
