/**
 * Navigation route types for Mutual Mesh.
 *
 * Two stacks:
 *
 * - `HomeStackParamList` — the push stack inside the Home tab
 *     - Feed       (HomeScreen)
 *     - Detail     (ResourceDetailScreen — push)
 *     - AddResource (AddResourceScreen — modal-style push)
 *
 * - `MainTabParamList` — the bottom tab navigator (only shown to verified users)
 *     - HomeTab    (the HomeStack above)
 *     - ProfileTab (ProfileScreen)
 *
 * Auth-stage screens (`SignIn`, `WaitingRoom`) are rendered directly by the
 * top-level Gate component in App.tsx — they're not in a navigator because
 * there's no "back" navigation from them.
 *
 * When Phase 0b lands real data, declare module augmentation here:
 *
 *     declare global {
 *       namespace ReactNavigation {
 *         interface RootParamList extends MainTabParamList {}
 *       }
 *     }
 */

export type HomeStackParamList = {
  Feed: undefined;
  Detail: { resourceId: string };
  AddResource: undefined;
  ResourceMap: undefined;
};

export type MainTabParamList = {
  HomeTab: undefined;
  VerifyTab: undefined;
  ProfileTab: undefined;
};

/**
 * `DemoStackParamList` — the anonymous guest demo stack (WEB-4, 2026-06-05).
 *
 * No Profile/Verify (there is no signed-in user in the demo). Reuses the same
 * Feed / Detail / ResourceMap screens, which are demo-aware via DemoContext.
 *   - Feed        (HomeScreen — onAddResource opens the sign-up sheet)
 *   - Detail      (ResourceDetailScreen — Claim opens the sign-up sheet)
 *   - ResourceMap (ResourceMapScreen — FSA map over synthetic fixtures)
 */
export type DemoStackParamList = {
  Feed: undefined;
  Detail: { resourceId: string };
  ResourceMap: undefined;
};
