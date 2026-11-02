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

  it('opens Berlin without the water layer', () => {
    useCommandCenter.getState().enterCity('berlin');
    expect(useCommandCenter.getState().activeLayers.has('water')).toBe(false);
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
