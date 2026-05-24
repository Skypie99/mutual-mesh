import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Button } from './Button';
import { errorMessage } from '@/lib/errors';
import { logError } from '@/lib/errorReporting';

type Props = {
  children: ReactNode;
  /** Optional custom fallback. Receives the error and a reset fn. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
};

type State = {
  error: Error | null;
};

/**
 * ErrorBoundary — catches render-time errors in the children tree and shows
 * a friendly fallback instead of a blank screen.
 *
 * Errors logged to `console.warn` only (NO Sentry / third-party — per Jordan D8).
 * Reset button re-mounts the children tree.
 *
 * React Native does NOT have ErrorBoundary built-in; we provide the class.
 * Place ONE at the top of the navigator (App.tsx) for global fallback. Wrap
 * individual screens with their own boundary for scoped recovery.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Dev-visible console line — kept so a hot-reload session still surfaces
    // the original throw site in the Metro output.
    console.warn('[ErrorBoundary]', error, info.componentStack);
    // Anonymous error report — opt-in default OFF, PII-stripped client-side
    // and SHA-256-hashed server-side (PRIVACY.md D8; migration 008;
    // supabase/functions/log-error). Fire-and-forget; logError swallows
    // every failure so a logging error cannot itself crash the fallback UI.
    void logError(error, 'error');
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }
      return <DefaultFallback error={this.state.error} reset={this.reset} />;
    }
    return this.props.children;
  }
}

function DefaultFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <View
      accessibilityRole="alert"
      className="flex-1 items-center justify-center gap-4 bg-light-bg p-8 dark:bg-dark-bg"
    >
      <Text className="text-center text-2xl font-semibold text-light-text dark:text-dark-text">
        Something went wrong
      </Text>
      <Text className="text-center text-sm text-light-text-secondary dark:text-dark-text-secondary">
        {errorMessage(error)}
      </Text>
      <View className="mt-2 w-full max-w-xs">
        <Button label="Try again" onPress={reset} />
      </View>
    </View>
  );
}
