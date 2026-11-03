import { beforeEach, describe, expect, it } from 'vitest';
import { useCommandCenter, type DataLayer } from './useCommandCenter.js';

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
