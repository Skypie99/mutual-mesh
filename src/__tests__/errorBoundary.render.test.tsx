/**
 * ErrorBoundary — full render tests (Cycle 7 Gary).
 *
 * Extends the static getDerivedStateFromError tests in errorBoundary.test.ts
 * with live render tests using @testing-library/react-native (confirmed
 * installed in node_modules/@testing-library/react-native).
 *
 * Tests:
 *   1. Children render normally when no error is thrown.
 *   2. Default fallback renders on child throw (accessibilityRole="alert",
 *      "Something went wrong" heading, error message text).
 *   3. Custom fallback renders when `fallback` prop is provided.
 *   4. componentDidCatch fires (checked via console.warn spy).
 *   5. logError is called with the thrown error (fire-and-forget, D8).
 *
 * logError is mocked so no network calls are made in tests.
 * console.warn is spied on to verify the dev-visible line fires.
 *
 * Note: React's error boundary mechanism invokes console.error internally
 * when an error is caught. We suppress those expected logs to keep test
 * output clean.
 */
import React from 'react';
import { Text } from 'react-native';
import { render, screen, act } from '@testing-library/react-native';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// ─── Module mocks ────────────────────────────────────────────────────────────

jest.mock('@/lib/errorReporting', () => ({
  logError: jest.fn().mockResolvedValue(undefined),
}));

import { logError } from '@/lib/errorReporting';
const mockLogError = logError as jest.Mock;

// ─── Fixture components ───────────────────────────────────────────────────────

/** A well-behaved child that always renders. */
function GoodChild() {
  return <Text testID="good-child">All good</Text>;
}

/** A child that throws on render (simulates a crash). */
function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('boom in child');
  }
  return <Text testID="throwing-child-ok">No throw</Text>;
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

let consoleWarnSpy: jest.SpyInstance;
let consoleErrorSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  // Suppress React's own "The above error occurred in the <ThrowingChild>"
  // console.error so test output stays clean. This is expected noise from
  // the error boundary mechanism — not a test failure.
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleWarnSpy.mockRestore();
  consoleErrorSpy.mockRestore();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ErrorBoundary — no error (happy path)', () => {
  it('renders children normally when nothing is thrown', () => {
    render(
      <ErrorBoundary>
        <GoodChild />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('good-child')).toBeTruthy();
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });

  it('does NOT call logError when there is no error', () => {
    render(
      <ErrorBoundary>
        <GoodChild />
      </ErrorBoundary>,
    );
    expect(mockLogError).not.toHaveBeenCalled();
  });
});

describe('ErrorBoundary — default fallback on child throw', () => {
  it('renders the fallback UI when a child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });

  it('hides the child content when error is caught', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.queryByTestId('throwing-child-ok')).toBeNull();
  });

  it('fallback container has accessibilityRole="alert" (via UNSAFE_getAllByProps)', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow />
      </ErrorBoundary>,
    );
    // RNTL's getByRole() does not always resolve accessibilityRole="alert" in
    // older React Native/RNTL versions. Use UNSAFE_getAllByProps to assert the
    // attribute is present without depending on the role-mapping layer.
    const alertViews = screen.UNSAFE_getAllByProps({ accessibilityRole: 'alert' });
    expect(alertViews.length).toBeGreaterThan(0);
  });

  it('calls logError with the thrown error', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow />
      </ErrorBoundary>,
    );
    expect(mockLogError).toHaveBeenCalledWith(expect.any(Error), 'error');
  });

  it('calls console.warn with "[ErrorBoundary]" prefix', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow />
      </ErrorBoundary>,
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[ErrorBoundary]',
      expect.any(Error),
      expect.anything(),
    );
  });
});

describe('ErrorBoundary — custom fallback prop', () => {
  it('renders the custom fallback when provided', () => {
    render(
      <ErrorBoundary
        fallback={(error) => <Text testID="custom-fallback">Custom: {error.message}</Text>}
      >
        <ThrowingChild shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('custom-fallback')).toBeTruthy();
    expect(screen.getByText('Custom: boom in child')).toBeTruthy();
  });

  it('does NOT render the default "Something went wrong" heading with a custom fallback', () => {
    render(
      <ErrorBoundary
        fallback={() => <Text testID="custom-fallback">My fallback</Text>}
      >
        <ThrowingChild shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });

  it('passes a reset function to the custom fallback', async () => {
    let capturedReset: (() => void) | null = null;
    render(
      <ErrorBoundary
        fallback={(_err, reset) => {
          capturedReset = reset;
          return <Text testID="custom-fallback">fallback</Text>;
        }}
      >
        <ThrowingChild shouldThrow />
      </ErrorBoundary>,
    );
    expect(capturedReset).toBeInstanceOf(Function);
    // Calling reset clears the error state (re-renders children)
    await act(async () => {
      capturedReset!();
    });
    // After reset the boundary no longer has an error stored
    // (children would re-throw, but we verify the reset ran without crashing)
  });
});

describe('ErrorBoundary.getDerivedStateFromError — static method (regression guard)', () => {
  it('returns state with the error set', () => {
    const err = new Error('static test');
    const state = ErrorBoundary.getDerivedStateFromError(err);
    expect(state.error).toBe(err);
  });
});
