import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Dimensions,
  FlatList,
  Pressable,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { ONBOARDING_CARDS, ONBOARDING_CARD_COUNT, type OnboardingCard } from '@/lib/onboardingCopy';
import { completeOnboarding } from '@/lib/resources';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { userFacingErrorMessage } from '@/lib/errors';
import { TOUCH_TARGET_MIN } from '@/lib/theme';

/**
 * OnboardingTourScreen — Phase 2 #8.
 *
 * Three swipeable cards explaining gate / handle / claim. The active index
 * is driven by:
 *   - the "Next" / "Get started" button (state mutation)
 *   - the user swiping left/right when motion is allowed
 *
 * Reduced-motion respect (Quinn AC-7): when useReducedMotion() returns
 * true, the FlatList disables scrolling entirely (scrollEnabled=false) so
 * the page slide can't animate; the user advances via the buttons only.
 *
 * Completion path:
 *   - "Get started" (card 3) → completeOnboarding() → AuthProvider's
 *     realtime subscription refreshes the profile → decideGateRoute flips
 *     'onboarding' → 'home' on its own. No manual nav here.
 *   - "Skip" (any card) → same RPC, same flow.
 *
 * accessibilityLiveRegion announces the active card title on change
 * (Quinn AC-6). Mounted-ref guards every async setState (CLAUDE.md #5).
 *
 * Per Casey's copy doc + Quinn's spec, NO 3rd-party carousel library.
 */
type OnboardingTourScreenProps = {
  /**
   * Optional override for the on-complete redirect when running in a
   * harness without the realtime Gate (storybook / tests). In production
   * the Gate handles the route flip via AuthProvider; this callback fires
   * AFTER completeOnboarding() resolves either way.
   */
  onComplete?: () => void;
};

export function OnboardingTourScreen({ onComplete }: OnboardingTourScreenProps = {}) {
  const reducedMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<OnboardingCard> | null>(null);
  const mountedRef = useRef(true);
  // De-dupes the SR announcement so a re-render at the same index doesn't
  // re-announce — only true index changes do.
  const lastAnnouncedRef = useRef<number | null>(null);
  // Use the device width as the card width — pagingEnabled snaps to
  // multiples of this value. Captured once on mount; an orientation change
  // would require a refactor (Phase 3 work).
  const cardWidth = useRef(Dimensions.get('window').width).current;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Announce the active card's title when the index changes. Quinn AC-6.
  useEffect(() => {
    if (lastAnnouncedRef.current === index) return;
    lastAnnouncedRef.current = index;
    const card = ONBOARDING_CARDS[index];
    if (card) {
      AccessibilityInfo.announceForAccessibility(
        `Card ${index + 1} of ${ONBOARDING_CARD_COUNT}. ${card.title}`,
      );
    }
  }, [index]);

  const goToIndex = useCallback(
    (next: number) => {
      if (next < 0 || next >= ONBOARDING_CARD_COUNT) return;
      setIndex(next);
      listRef.current?.scrollToIndex({ index: next, animated: !reducedMotion });
    },
    [reducedMotion],
  );

  const handleFinish = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { error: err } = await completeOnboarding();
      if (err) throw err;
      // The AuthProvider realtime subscription flips the gate; we call
      // onComplete (when provided) for harness / test paths.
      if (mountedRef.current) onComplete?.();
    } catch (err) {
      if (mountedRef.current) {
        setError(userFacingErrorMessage(err, "Couldn't finish the tour. Try again."));
      }
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  }, [onComplete]);

  const handleCTA = () => {
    const card = ONBOARDING_CARDS[index];
    if (!card) return;
    if (card.cta === 'Next') {
      goToIndex(index + 1);
    } else {
      void handleFinish();
    }
  };

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (reducedMotion) return; // motion is off → we drive index via buttons.
    const offset = e.nativeEvent.contentOffset.x;
    const next = Math.round(offset / cardWidth);
    if (next !== index) setIndex(next);
  };

  return (
    <SafeAreaView className="flex-1 bg-light-bg dark:bg-dark-bg">
      <View className="flex-1">
        {/* Top-right Skip link. Reachable from every card. */}
        <View className="flex-row justify-end px-4 pt-2">
          <Pressable
            onPress={() => void handleFinish()}
            accessibilityRole="link"
            accessibilityLabel="Skip"
            accessibilityHint="Skip the tour. The marketplace opens next."
            disabled={submitting}
            style={{ minHeight: TOUCH_TARGET_MIN, minWidth: TOUCH_TARGET_MIN }}
            className="items-center justify-center px-3 py-2 active:opacity-60"
          >
            <Text className="text-base font-semibold text-light-accent dark:text-dark-accent">
              Skip
            </Text>
          </Pressable>
        </View>

        {/* Card pager — horizontal FlatList with pagingEnabled. When
            reducedMotion is true we disable scroll so the user navigates
            via buttons only (no slide animation, no swipe). */}
        <FlatList
          ref={listRef}
          data={ONBOARDING_CARDS}
          keyExtractor={(c) => c.id}
          horizontal
          pagingEnabled
          scrollEnabled={!reducedMotion}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumScrollEnd}
          getItemLayout={(_data, i) => ({
            length: cardWidth,
            offset: cardWidth * i,
            index: i,
          })}
          renderItem={({ item, index: i }) => (
            <CardView card={item} cardWidth={cardWidth} isActive={i === index} />
          )}
        />

        {/* Progress dots. Container has the count; individual dots are
            decorative per Quinn AC-6 / Alex pre-audit notes. */}
        <View
          accessibilityLabel={`Card ${index + 1} of ${ONBOARDING_CARD_COUNT}`}
          accessibilityLiveRegion="polite"
          className="flex-row items-center justify-center gap-2 py-4"
        >
          {ONBOARDING_CARDS.map((c, i) => (
            <View
              key={c.id}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              className={`h-2 w-2 rounded-full ${
                i === index
                  ? 'bg-light-accent dark:bg-dark-accent'
                  : 'bg-light-border dark:bg-dark-border'
              }`}
            />
          ))}
        </View>

        {error && (
          <Text
            accessibilityLiveRegion="polite"
            className="mb-2 px-6 text-center text-sm text-light-danger dark:text-dark-danger"
          >
            {error}
          </Text>
        )}

        {/* CTA + microcopy. */}
        <View className="gap-2 px-6 pb-6">
          <Button
            label={
              submitting && ONBOARDING_CARDS[index]?.cta === 'Get started'
                ? 'Finishing…'
                : (ONBOARDING_CARDS[index]?.cta ?? 'Next')
            }
            onPress={handleCTA}
            disabled={submitting}
            hint={ONBOARDING_CARDS[index]?.ctaHint}
          />
          <Text className="text-center text-xs text-light-text-muted dark:text-dark-text-muted">
            {ONBOARDING_CARDS[index]?.microcopy}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

/**
 * Single tour card. Width pinned to cardWidth so pagingEnabled snaps
 * cleanly. The container view also exposes accessibilityLabel for
 * SR users who land here via tab/swipe.
 */
function CardView({
  card,
  cardWidth,
  isActive,
}: {
  card: OnboardingCard;
  cardWidth: number;
  isActive: boolean;
}) {
  return (
    <View
      accessibilityRole="header"
      accessibilityLabel={card.title}
      style={{ width: cardWidth }}
      className="flex-1 items-center justify-center px-8"
    >
      <Text
        accessibilityRole="header"
        accessibilityElementsHidden={!isActive}
        importantForAccessibility={isActive ? 'yes' : 'no-hide-descendants'}
        className="mb-4 text-center text-2xl font-semibold text-light-text dark:text-dark-text"
      >
        {card.title}
      </Text>
      <Text
        accessibilityElementsHidden={!isActive}
        importantForAccessibility={isActive ? 'yes' : 'no-hide-descendants'}
        className="text-center text-base leading-6 text-light-text-secondary dark:text-dark-text-secondary"
      >
        {card.body}
      </Text>
    </View>
  );
}
