/**
 * Tests for pure map helpers — Phase 3.2 Resource Map.
 *
 * Covers region defaults, zoom clamping, bounding-box computation,
 * and region comparison. No React, no native deps, pure math.
 */

import {
  clampRegionZoom,
  DEFAULT_REGION,
  LAUNCH_CITY_CENTROIDS,
  MIN_DELTA,
  regionForDescriptors,
  regionsAreClose,
  BUCKET_FILL_COLORS_LIGHT,
  BUCKET_FILL_COLORS_DARK,
  type MapRegion,
} from '@/lib/mapHelpers';
import type { FsaDescriptor } from '@/lib/fsaAggregation';

// ============================================================================
// DEFAULT_REGION
// ============================================================================

describe('DEFAULT_REGION', () => {
  it('is centered on Kelowna, BC', () => {
    expect(DEFAULT_REGION.latitude).toBeCloseTo(49.888, 2);
    expect(DEFAULT_REGION.longitude).toBeCloseTo(-119.496, 2);
  });

  it('has reasonable delta for a city-wide view', () => {
    expect(DEFAULT_REGION.latitudeDelta).toBeGreaterThan(0.05);
    expect(DEFAULT_REGION.latitudeDelta).toBeLessThan(1);
    expect(DEFAULT_REGION.longitudeDelta).toBeGreaterThan(0.05);
    expect(DEFAULT_REGION.longitudeDelta).toBeLessThan(1);
  });
});

// ============================================================================
// clampRegionZoom
// ============================================================================

describe('clampRegionZoom', () => {
  it('returns the same region when delta is above the floor', () => {
    const region: MapRegion = {
      latitude: 49.888,
      longitude: -119.496,
      latitudeDelta: 0.1,
      longitudeDelta: 0.1,
    };
    const clamped = clampRegionZoom(region);
    expect(clamped).toEqual(region);
  });

  it('clamps latitudeDelta to MIN_DELTA when zoomed in too far', () => {
    const region: MapRegion = {
      latitude: 49.888,
      longitude: -119.496,
      latitudeDelta: 0.005,
      longitudeDelta: 0.1,
    };
    const clamped = clampRegionZoom(region);
    expect(clamped.latitudeDelta).toBe(MIN_DELTA);
    expect(clamped.longitudeDelta).toBe(0.1);
  });

  it('clamps longitudeDelta to MIN_DELTA when zoomed in too far', () => {
    const region: MapRegion = {
      latitude: 49.888,
      longitude: -119.496,
      latitudeDelta: 0.1,
      longitudeDelta: 0.005,
    };
    const clamped = clampRegionZoom(region);
    expect(clamped.latitudeDelta).toBe(0.1);
    expect(clamped.longitudeDelta).toBe(MIN_DELTA);
  });

  it('clamps both deltas when both are too small', () => {
    const region: MapRegion = {
      latitude: 43.65,
      longitude: -79.38,
      latitudeDelta: 0.001,
      longitudeDelta: 0.001,
    };
    const clamped = clampRegionZoom(region);
    expect(clamped.latitudeDelta).toBe(MIN_DELTA);
    expect(clamped.longitudeDelta).toBe(MIN_DELTA);
  });

  it('does not mutate the input region', () => {
    const region: MapRegion = {
      latitude: 49.888,
      longitude: -119.496,
      latitudeDelta: 0.005,
      longitudeDelta: 0.005,
    };
    const copy = { ...region };
    clampRegionZoom(region);
    expect(region).toEqual(copy);
  });
});

// ============================================================================
// regionForDescriptors
// ============================================================================

describe('regionForDescriptors', () => {
  const makeDescriptor = (fsa: string): FsaDescriptor => ({
    fsa,
    count: 3,
    bucket: 'medium',
    dominantCategory: 'food',
    categories: ['food'],
    city: 'Toronto',
  });

  it('returns DEFAULT_REGION for empty descriptors', () => {
    expect(regionForDescriptors([], LAUNCH_CITY_CENTROIDS)).toEqual(DEFAULT_REGION);
  });

  it('returns DEFAULT_REGION when no descriptor FSAs have known centroids', () => {
    const descriptors = [makeDescriptor('ZZZ')];
    expect(regionForDescriptors(descriptors, LAUNCH_CITY_CENTROIDS)).toEqual(DEFAULT_REGION);
  });

  it('centers on a single known FSA centroid', () => {
    const descriptors = [makeDescriptor('M5V')];
    const region = regionForDescriptors(descriptors, LAUNCH_CITY_CENTROIDS);
    expect(region.latitude).toBeCloseTo(43.641, 2);
    expect(region.longitude).toBeCloseTo(-79.395, 2);
  });

  it('computes a bounding region for multiple FSAs', () => {
    const descriptors = [makeDescriptor('M5V'), makeDescriptor('M4W')];
    const region = regionForDescriptors(descriptors, LAUNCH_CITY_CENTROIDS);
    // Center should be between the two FSA centroids
    const m5v = LAUNCH_CITY_CENTROIDS.get('M5V')!;
    const m4w = LAUNCH_CITY_CENTROIDS.get('M4W')!;
    const expectedLat = (m5v.lat + m4w.lat) / 2;
    const expectedLng = (m5v.lng + m4w.lng) / 2;
    expect(region.latitude).toBeCloseTo(expectedLat, 2);
    expect(region.longitude).toBeCloseTo(expectedLng, 2);
  });

  it('enforces minimum delta on the bounding region', () => {
    // Single point should still have MIN_DELTA
    const descriptors = [makeDescriptor('V6B')];
    const region = regionForDescriptors(descriptors, LAUNCH_CITY_CENTROIDS);
    expect(region.latitudeDelta).toBeGreaterThanOrEqual(MIN_DELTA);
    expect(region.longitudeDelta).toBeGreaterThanOrEqual(MIN_DELTA);
  });

  it('ignores descriptors with unknown FSA codes', () => {
    const descriptors = [makeDescriptor('M5V'), makeDescriptor('ZZZ')];
    const region = regionForDescriptors(descriptors, LAUNCH_CITY_CENTROIDS);
    // Should still center on M5V (ZZZ is ignored)
    expect(region.latitude).toBeCloseTo(43.641, 2);
  });
});

// ============================================================================
// regionsAreClose
// ============================================================================

describe('regionsAreClose', () => {
  const base: MapRegion = {
    latitude: 49.888,
    longitude: -119.496,
    latitudeDelta: 0.15,
    longitudeDelta: 0.15,
  };

  it('returns true for identical regions', () => {
    expect(regionsAreClose(base, { ...base })).toBe(true);
  });

  it('returns true for regions within threshold', () => {
    const close: MapRegion = {
      latitude: 49.8885,
      longitude: -119.4965,
      latitudeDelta: 0.1505,
      longitudeDelta: 0.1505,
    };
    expect(regionsAreClose(base, close)).toBe(true);
  });

  it('returns false for regions outside threshold', () => {
    const far: MapRegion = {
      latitude: 50.0,
      longitude: -119.0,
      latitudeDelta: 0.3,
      longitudeDelta: 0.3,
    };
    expect(regionsAreClose(base, far)).toBe(false);
  });

  it('supports custom threshold', () => {
    const slightlyOff: MapRegion = {
      ...base,
      latitude: base.latitude + 0.005,
    };
    expect(regionsAreClose(base, slightlyOff, 0.001)).toBe(false);
    expect(regionsAreClose(base, slightlyOff, 0.01)).toBe(true);
  });
});

// ============================================================================
// Color maps
// ============================================================================

describe('bucket fill colors', () => {
  it('has colors for all four buckets in light mode', () => {
    expect(BUCKET_FILL_COLORS_LIGHT.none).toBe('transparent');
    expect(BUCKET_FILL_COLORS_LIGHT.light).toContain('rgba');
    expect(BUCKET_FILL_COLORS_LIGHT.medium).toContain('rgba');
    expect(BUCKET_FILL_COLORS_LIGHT.heavy).toContain('rgba');
  });

  it('has colors for all four buckets in dark mode', () => {
    expect(BUCKET_FILL_COLORS_DARK.none).toBe('transparent');
    expect(BUCKET_FILL_COLORS_DARK.light).toContain('rgba');
    expect(BUCKET_FILL_COLORS_DARK.medium).toContain('rgba');
    expect(BUCKET_FILL_COLORS_DARK.heavy).toContain('rgba');
  });

  it('increases opacity from light to heavy', () => {
    // Extract opacity from rgba strings
    const extractOpacity = (rgba: string): number => {
      const match = rgba.match(/[\d.]+\)$/);
      return match ? parseFloat(match[0]) : 0;
    };

    const lightOpacity = extractOpacity(BUCKET_FILL_COLORS_LIGHT.light);
    const mediumOpacity = extractOpacity(BUCKET_FILL_COLORS_LIGHT.medium);
    const heavyOpacity = extractOpacity(BUCKET_FILL_COLORS_LIGHT.heavy);

    expect(lightOpacity).toBeLessThan(mediumOpacity);
    expect(mediumOpacity).toBeLessThan(heavyOpacity);
  });
});

// ============================================================================
// LAUNCH_CITY_CENTROIDS
// ============================================================================

describe('LAUNCH_CITY_CENTROIDS', () => {
  it('includes Kelowna FSAs', () => {
    expect(LAUNCH_CITY_CENTROIDS.has('V1Y')).toBe(true);
    expect(LAUNCH_CITY_CENTROIDS.has('V1V')).toBe(true);
  });

  it('includes Toronto FSAs for testing', () => {
    expect(LAUNCH_CITY_CENTROIDS.has('M5V')).toBe(true);
    expect(LAUNCH_CITY_CENTROIDS.has('M4W')).toBe(true);
  });

  it('all centroids have valid lat/lng', () => {
    for (const [fsa, coord] of LAUNCH_CITY_CENTROIDS) {
      expect(typeof coord.lat).toBe('number');
      expect(typeof coord.lng).toBe('number');
      expect(coord.lat).toBeGreaterThan(-90);
      expect(coord.lat).toBeLessThan(90);
      expect(coord.lng).toBeGreaterThan(-180);
      expect(coord.lng).toBeLessThan(180);
      // FSA codes are 3 chars
      expect(fsa).toHaveLength(3);
    }
  });
});
