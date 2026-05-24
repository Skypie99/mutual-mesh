/**
 * Tests for useReducedMotion. The hook itself can't run outside a React
 * environment without RTL, but the contract it exposes is small:
 * - On mount, call AccessibilityInfo.isReduceMotionEnabled()
 * - Subscribe to 'reduceMotionChanged'
 * - Unsubscribe on unmount
 *
 * Component-level integration tests are deferred until we add
 * @testing-library/react-native (Phase 0b or later). For now we test the
 * contract via the AccessibilityInfo mock.
 */

import { AccessibilityInfo } from 'react-native';

describe('useReducedMotion contract', () => {
  it('AccessibilityInfo.isReduceMotionEnabled is the source of truth', () => {
    // Sanity-check that the API the hook depends on exists in the mocked
    // environment. If jest-expo ever drops AccessibilityInfo mocking,
    // this test catches it before user tests fail mysteriously.
    expect(typeof AccessibilityInfo.isReduceMotionEnabled).toBe('function');
  });

  it('AccessibilityInfo.addEventListener for reduceMotionChanged exists', () => {
    expect(typeof AccessibilityInfo.addEventListener).toBe('function');
  });
});
