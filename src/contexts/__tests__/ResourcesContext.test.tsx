/**
 * ResourcesContext — unit tests for the singleton provider and hook.
 *
 * Covers:
 *   1. useResourcesContext throws when used outside <ResourcesProvider>
 *   2. Provider exposes resources after a successful listResources call
 *   3. Provider exposes error when listResources fails
 *   4. Realtime INSERT delta is applied and the updated list is exposed
 *   5. reload() triggers a second fetch and updates state
 *   6. Realtime UPDATE that flips status away from 'available' is filtered out
 *   7. Provider removes the Supabase channel on unmount
 *
 * Mocking strategy (jest.mock factory restriction):
 *   - @/lib/supabase: factory only uses jest.fn(); the real channel mock is
 *     wired in beforeEach via requireMock so the factory stays self-contained.
 *   - @/lib/resources: listResources is a jest.fn(); resolved value set per test.
 *   - @/lib/resourcesRealtime: real implementation (pure, no side effects).
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { ResourcesProvider, useResourcesContext } from '../ResourcesContext';
import type { ResourceRow } from '@/types/database';

// ─── Module mocks (factories must be self-contained — no outer variables) ─────

jest.mock('@/lib/supabase', () => {
  const channelObj = {
    on: jest.fn(),
    subscribe: jest.fn(),
  };
  // on() chains back to channelObj; subscribe() returns channelObj.
  // Actual listener capture happens in beforeEach via requireMock.
  channelObj.on.mockReturnValue(channelObj);
  channelObj.subscribe.mockReturnValue(channelObj);

  return {
    supabase: {
      channel: jest.fn().mockReturnValue(channelObj),
      removeChannel: jest.fn().mockResolvedValue(undefined),
    },
  };
});

jest.mock('@/lib/resources', () => ({
  listResources: jest.fn(),
}));

// ─── Typed access to mocked modules ──────────────────────────────────────────

type FakeChannel = {
  on: jest.Mock;
  subscribe: jest.Mock;
};

type FakeSupabase = {
  supabase: {
    channel: jest.Mock;
    removeChannel: jest.Mock;
  };
};

type FakeResources = {
  listResources: jest.Mock;
};

// Listener captured from the channel.on() call so tests can fire fake payloads.
let capturedListener: ((payload: unknown) => void) | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeRow = (overrides: Partial<ResourceRow> = {}): ResourceRow =>
  ({
    id: 'r1',
    name: 'Baby formula',
    description: null,
    status: 'available',
    postal_prefix: 'V6A',
    created_at: '2026-05-25T00:00:00Z',
    updated_at: '2026-05-25T00:00:00Z',
    user_id: 'u1',
    category: null,
    status_changed_at: null,
    image_path: null,
    ...overrides,
  }) as ResourceRow;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ResourcesProvider>{children}</ResourcesProvider>
);

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  capturedListener = null;

  const { supabase } = jest.requireMock<FakeSupabase>('@/lib/supabase');

  // Rebuild channel mock fresh for each test.
  const fakeChannel: FakeChannel = {
    on: jest
      .fn()
      .mockImplementation((_type: string, _filter: unknown, handler: (p: unknown) => void) => {
        capturedListener = handler;
        return fakeChannel;
      }),
    subscribe: jest.fn().mockReturnValue(undefined),
  };

  supabase.channel.mockReturnValue(fakeChannel);
  supabase.removeChannel.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.clearAllMocks();
});

// ─── Test 1 — guard ───────────────────────────────────────────────────────────

describe('useResourcesContext — guard', () => {
  it('throws a clear error when called outside <ResourcesProvider>', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useResourcesContext())).toThrow(
      /useResourcesContext must be called inside <ResourcesProvider>/,
    );
    spy.mockRestore();
  });
});

// ─── Test 2 — successful fetch ────────────────────────────────────────────────

describe('ResourcesProvider — initial fetch success', () => {
  it('exposes loaded resources after listResources resolves', async () => {
    const row = makeRow();
    const { listResources } = jest.requireMock<FakeResources>('@/lib/resources');
    listResources.mockResolvedValueOnce({ data: [row], error: null });

    const { result } = renderHook(() => useResourcesContext(), { wrapper });

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.resources).toEqual([row]);
    expect(result.current.error).toBeNull();
  });
});

// ─── Test 3 — fetch error ─────────────────────────────────────────────────────

describe('ResourcesProvider — initial fetch error', () => {
  it('exposes error message when listResources fails', async () => {
    const { listResources } = jest.requireMock<FakeResources>('@/lib/resources');
    listResources.mockResolvedValueOnce({
      data: null,
      error: { message: 'Network failure' },
    });

    const { result } = renderHook(() => useResourcesContext(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Network failure');
    expect(result.current.resources).toEqual([]);
  });
});

// ─── Test 4 — realtime INSERT ─────────────────────────────────────────────────

describe('ResourcesProvider — realtime INSERT delta', () => {
  it('adds a new resource when an INSERT event arrives via the subscription', async () => {
    const existing = makeRow({ id: 'r1', name: 'Rice' });
    const incoming = makeRow({ id: 'r2', name: 'Formula' });

    const { listResources } = jest.requireMock<FakeResources>('@/lib/resources');
    listResources.mockResolvedValueOnce({ data: [existing], error: null });

    const { result } = renderHook(() => useResourcesContext(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.resources).toHaveLength(1);

    act(() => {
      capturedListener?.({ type: 'INSERT', new: incoming, old: {} });
    });

    await waitFor(() => expect(result.current.resources).toHaveLength(2));
    expect(result.current.resources.map((r) => r.id)).toContain('r2');
  });
});

// ─── Test 5 — reload ──────────────────────────────────────────────────────────

describe('ResourcesProvider — reload()', () => {
  it('re-fetches and updates the resources list', async () => {
    const first = makeRow({ id: 'r1', name: 'First' });
    const second = makeRow({ id: 'r2', name: 'Second' });

    const { listResources } = jest.requireMock<FakeResources>('@/lib/resources');
    listResources
      .mockResolvedValueOnce({ data: [first], error: null })
      .mockResolvedValueOnce({ data: [first, second], error: null });

    const { result } = renderHook(() => useResourcesContext(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.resources).toHaveLength(1);

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.resources).toHaveLength(2);
    expect(listResources).toHaveBeenCalledTimes(2);
  });
});

// ─── Test 6 — realtime UPDATE filter ─────────────────────────────────────────

describe('ResourcesProvider — realtime UPDATE filter', () => {
  it('removes a resource when its status flips to reserved via a realtime UPDATE', async () => {
    const row = makeRow({ id: 'r1', status: 'available' });

    const { listResources } = jest.requireMock<FakeResources>('@/lib/resources');
    listResources.mockResolvedValueOnce({ data: [row], error: null });

    const { result } = renderHook(() => useResourcesContext(), { wrapper });

    await waitFor(() => expect(result.current.resources).toHaveLength(1));

    act(() => {
      capturedListener?.({
        type: 'UPDATE',
        new: { ...row, status: 'reserved' },
        old: row,
      });
    });

    await waitFor(() => expect(result.current.resources).toHaveLength(0));
  });
});

// ─── Test 7 — cleanup ─────────────────────────────────────────────────────────

describe('ResourcesProvider — cleanup', () => {
  it('removes the Supabase channel when the provider unmounts', async () => {
    const { listResources } = jest.requireMock<FakeResources>('@/lib/resources');
    listResources.mockResolvedValueOnce({ data: [], error: null });

    const { supabase } = jest.requireMock<FakeSupabase>('@/lib/supabase');

    const { unmount } = renderHook(() => useResourcesContext(), { wrapper });

    await waitFor(() => {
      expect(supabase.channel).toHaveBeenCalled();
    });

    unmount();

    expect(supabase.removeChannel).toHaveBeenCalled();
  });
});
