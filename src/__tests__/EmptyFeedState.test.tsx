/**
 * EmptyFeedState — component tests.
 *
 * Tests the two render cases and CTA callbacks.
 * Presentational-only — no Supabase, no AsyncStorage, no navigation mocks needed.
 *
 * Uses @testing-library/react-native (installed in Phase 4 Gary coverage audit).
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { EmptyFeedState } from '@/components/EmptyFeedState';

// ─── Case A: no filters active, empty feed ───────────────────────────────────

describe('EmptyFeedState — filtersActive=false (no resources exist)', () => {
  const onAddResource = jest.fn();
  const onClearFilters = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    render(
      <EmptyFeedState
        filtersActive={false}
        onAddResource={onAddResource}
        onClearFilters={onClearFilters}
      />,
    );
  });

  it('renders the "Nothing here yet" heading', () => {
    expect(screen.getByText('Nothing here yet')).toBeTruthy();
  });

  it('renders the "Be the first" community subtext', () => {
    expect(
      screen.getByText('Be the first to share a resource with your community.'),
    ).toBeTruthy();
  });

  it('renders the "Share a resource" CTA button', () => {
    expect(screen.getByText('Share a resource')).toBeTruthy();
  });

  it('does NOT render the "No resources match your filters" heading', () => {
    expect(screen.queryByText('No resources match your filters')).toBeNull();
  });

  it('calls onAddResource when the CTA is pressed', () => {
    fireEvent.press(screen.getByText('Share a resource'));
    expect(onAddResource).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onClearFilters when the CTA is pressed', () => {
    fireEvent.press(screen.getByText('Share a resource'));
    expect(onClearFilters).not.toHaveBeenCalled();
  });
});

// ─── Case B: filters active, zero results ────────────────────────────────────

describe('EmptyFeedState — filtersActive=true (filters return no matches)', () => {
  const onAddResource = jest.fn();
  const onClearFilters = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    render(
      <EmptyFeedState
        filtersActive
        onAddResource={onAddResource}
        onClearFilters={onClearFilters}
      />,
    );
  });

  it('renders the "No resources match your filters" heading', () => {
    expect(screen.getByText('No resources match your filters')).toBeTruthy();
  });

  it('renders the filter-adjust subtext', () => {
    expect(
      screen.getByText('Try adjusting or clearing your filters.'),
    ).toBeTruthy();
  });

  it('renders the "Clear filters" CTA button', () => {
    expect(screen.getByText('Clear filters')).toBeTruthy();
  });

  it('does NOT render the "Nothing here yet" heading', () => {
    expect(screen.queryByText('Nothing here yet')).toBeNull();
  });

  it('calls onClearFilters when the CTA is pressed', () => {
    fireEvent.press(screen.getByText('Clear filters'));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onAddResource when the CTA is pressed', () => {
    fireEvent.press(screen.getByText('Clear filters'));
    expect(onAddResource).not.toHaveBeenCalled();
  });
});
