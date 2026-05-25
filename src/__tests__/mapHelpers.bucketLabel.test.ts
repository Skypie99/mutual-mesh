/**
 * Tests for bucketLabel() — Phase 3.2 Map View helper.
 *
 * Covers Gary recommendation (Shamus QA 2026-05-25):
 *   - All four FsaCountBucket values return the correct label string
 *   - No label leaks a raw count (privacy AC-4: buckets not counts)
 *   - Exhaustiveness: every bucket has a non-empty label
 */

import { bucketLabel } from '@/lib/mapHelpers';
import type { FsaCountBucket } from '@/lib/fsaAggregation';

const ALL_BUCKETS: FsaCountBucket[] = ['none', 'light', 'medium', 'heavy'];

describe('bucketLabel()', () => {
  it("maps 'none' → 'No resources'", () => {
    expect(bucketLabel('none')).toBe('No resources');
  });

  it("maps 'light' → 'A few resources available'", () => {
    expect(bucketLabel('light')).toBe('A few resources available');
  });

  it("maps 'medium' → 'Several resources available'", () => {
    expect(bucketLabel('medium')).toBe('Several resources available');
  });

  it("maps 'heavy' → 'Many resources available'", () => {
    expect(bucketLabel('heavy')).toBe('Many resources available');
  });

  it('no label contains a digit (AC-4: buckets not counts)', () => {
    for (const bucket of ALL_BUCKETS) {
      expect(bucketLabel(bucket)).not.toMatch(/\d/);
    }
  });

  it('every bucket has a non-empty label (exhaustiveness guard)', () => {
    for (const bucket of ALL_BUCKETS) {
      expect(bucketLabel(bucket).length).toBeGreaterThan(0);
    }
  });
});
