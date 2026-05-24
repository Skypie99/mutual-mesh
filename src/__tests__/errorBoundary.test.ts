import { ErrorBoundary } from '@/components/ErrorBoundary';

/**
 * Tests the pure static method on ErrorBoundary. Full integration
 * (catching a rendered child's throw) requires @testing-library/react-native
 * which we haven't installed — deferred to Phase 0b.
 */
describe('ErrorBoundary.getDerivedStateFromError', () => {
  it('returns state object with the error', () => {
    const err = new Error('boom');
    const next = ErrorBoundary.getDerivedStateFromError(err);
    expect(next.error).toBe(err);
  });

  it('preserves the error reference (no clone)', () => {
    const err = new Error('preserve me');
    err.stack = 'fake-stack';
    const next = ErrorBoundary.getDerivedStateFromError(err);
    expect(next.error?.stack).toBe('fake-stack');
  });
});
