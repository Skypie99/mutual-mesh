/**
 * Spanish message catalog — Phase 3.4 i18n.
 *
 * STUB: All values are "[ES] <English original>" placeholders.
 * Professional / native-speaker translation replaces these before shipping.
 * AC-9: NEVER use AI translation, even as a draft.
 *
 * Every key from en.ts must appear here. Missing keys fall back to
 * English via react-intl's defaultMessage mechanism, but the CI check
 * (`npm run check:translations`) will flag them.
 */

import type { MessageCatalog } from '@/lib/i18n';

const es: MessageCatalog = {
  // Home / Feed
  'home.title': '[ES] Available now',
  'home.empty.title': '[ES] Nothing here yet',
  'home.empty.description':
    '[ES] Your community is just starting. Check back later, or invite a neighbor — every listing makes this more useful for the next person.',
  'home.empty.cta': '[ES] Post a resource',
  'home.error.title': "[ES] Couldn't load listings",
  'home.error.cta': '[ES] Try again',
  'home.fab.label': '[ES] Post a resource',
  'home.refresh.label': '[ES] Pull to refresh listings',
  'home.resource.label':
    '[ES] {name}, {status}{neighborhood, select, none {} other {, neighborhood {neighborhood}}}',

  // Map toggle
  'map.toggle.label': '[ES] View mode',
  'map.toggle.list': '[ES] List',
  'map.toggle.map': '[ES] Map',
  'map.toggle.list.hint': '[ES] Shows resources in a scrollable list. Default view.',
  'map.toggle.map.hint':
    '[ES] Shows resources grouped by neighborhood on a map. Tap a region to filter the list.',

  // Map view
  'map.unavailable.title': '[ES] Map not available',
  'map.unavailable.description':
    '[ES] The map library is not installed yet. Switch to list view to see resources.',
  'map.unavailable.cta': '[ES] Switch to list view',
  'map.fsa.hint': '[ES] Tap to see resources in this neighborhood as a list.',
  'map.summary.zero': '[ES] Map shows no neighborhoods with available resources.',
  'map.summary.one': '[ES] Map shows 1 neighborhood with available resources.',
  'map.summary.other': '[ES] Map shows {count} neighborhoods with available resources.',
  'map.bucket.none': '[ES] no resources',
  'map.bucket.light': '[ES] a few resources',
  'map.bucket.medium': '[ES] several resources',
  'map.bucket.heavy': '[ES] many resources',
  'map.neighborhoods.none': '[ES] No neighborhoods with available resources.',

  // Resource detail
  'detail.loading': '[ES] Loading…',
  'detail.notFound': '[ES] Resource not found.',
  'detail.missingId': '[ES] Missing resource id.',
  'detail.description.label': '[ES] Description',
  'detail.pickup.label': '[ES] Pickup',
  'detail.contact.label': '[ES] Contact the poster',
  'detail.contact.warning':
    '[ES] This handle is provided by the poster. Verify before sharing personal details.',
  'detail.claim.button': '[ES] Claim this item',
  'detail.claim.hint': "[ES] Reserves this item for you and reveals the poster's contact handle.",
  'detail.claim.modal.title': '[ES] Claim this item?',
  'detail.claim.modal.body':
    "[ES] Once you claim, the poster's contact handle is revealed to you. They'll see your handle too. Other users can't claim it after that.",
  'detail.claim.modal.confirm': '[ES] Yes, claim',
  'detail.claim.modal.cancel': '[ES] Not yet',
  'detail.reserved': '[ES] This item is reserved.',
  'detail.photo.label': '[ES] Photo of {name}',
  'detail.error.load': '[ES] Could not load this resource.',
  'detail.error.claim': '[ES] Could not claim this resource.',

  // Add resource
  'addResource.title': '[ES] Post a resource',
  'addResource.photoNotice': '[ES] Photos uploaded here have all metadata removed automatically.',
  'addResource.name.label': '[ES] What is it?',
  'addResource.name.hint': "[ES] e.g., 'Sensitive baby formula, unopened'",
  'addResource.description.label': '[ES] Details',
  'addResource.description.hint':
    '[ES] Quantity, expiry, allergens, anything a recipient should know.',
  'addResource.pickup.label': '[ES] Pickup info',
  'addResource.pickup.hint': '[ES] Where and when. Be as specific or vague as you want.',
  'addResource.contact.label': '[ES] Contact handle (revealed only on claim)',
  'addResource.contact.hint':
    '[ES] Signal handle, Proton email, or any handle you trust. No links.',
  'addResource.photo.label': '[ES] Photo (optional)',
  'addResource.photo.metadataNotice':
    '[ES] All metadata (location, device, time) is stripped before upload.',
  'addResource.photo.change': '[ES] Change photo',
  'addResource.photo.preview': '[ES] Photo preview',
  'addResource.photo.remove': '[ES] Remove photo',
  'addResource.photo.add': '[ES] Add a photo',
  'addResource.submit': '[ES] Post resource',
  'addResource.submitting': '[ES] Posting…',
  'addResource.cancel': '[ES] Cancel',
  'addResource.error.post': '[ES] Could not post your resource.',
  'addResource.error.photoPerm':
    '[ES] Photo library permission denied. You can post without a photo.',

  // Profile
  'profile.title': '[ES] Your profile',
  'profile.handle.label': '[ES] Handle',
  'profile.neighborhood.label': '[ES] Neighborhood',
  'profile.city.label': '[ES] City',
  'profile.posted.label': '[ES] Posted',
  'profile.claims.label': '[ES] Active claims',
  'profile.errorReporting.title': '[ES] Help improve Mutual Mesh',
  'profile.errorReporting.toggle': '[ES] Send anonymous error reports',
  'profile.errorReporting.hint': '[ES] No personal data — only crash counts.',
  'profile.signOut': '[ES] Sign out',
  'profile.deleteAccount': '[ES] Delete my account',
  'profile.deleteAccount.hint': '[ES] Permanently deletes your account, posts, and active claims.',
  'profile.deleteAccount.modal.title': '[ES] Delete your account?',
  'profile.deleteAccount.modal.body':
    '[ES] This removes your account, your posts, and your claims from Mutual Mesh immediately. ' +
    'Honest disclosure: Supabase keeps automatic backups for ~7 days, so the data is technically ' +
    "recoverable from a backup during that window. We cannot scrub backups — that's a platform limit. " +
    'You can sign up again with the same email later if you want.',
  'profile.deleteAccount.modal.confirm': '[ES] Yes, delete',
  'profile.deleteAccount.modal.cancel': '[ES] Cancel',
  'profile.deleteAccount.error': '[ES] Could not delete your account.',
  'profile.language.title': '[ES] Language',
  'profile.language.description':
    '[ES] Sets the language of the app. Defaults to your device language.',
  'profile.language.reset': '[ES] Reset to device language',

  // Sign in / Sign up
  'auth.signIn.subtitle': '[ES] Sign in to continue.',
  'auth.signUp.subtitle': '[ES] Create an account with your invite code.',
  'auth.email.label': '[ES] Email',
  'auth.password.label': '[ES] Password',
  'auth.password.hint': '[ES] At least 8 characters.',
  'auth.inviteCode.label': '[ES] Invite code',
  'auth.inviteCode.hint': '[ES] From someone already on Mutual Mesh.',
  'auth.signIn.button': '[ES] Sign in',
  'auth.signUp.button': '[ES] Continue',
  'auth.switchToSignUp': '[ES] I have an invite code — create account',
  'auth.switchToSignIn': '[ES] Back to sign in',
  'auth.otp.title': '[ES] Check your email',
  'auth.otp.subtitle': '[ES] We sent a 6-digit code to {email}.',
  'auth.otp.label': '[ES] 6-digit code',
  'auth.otp.hint': "[ES] If you don't see it, check your spam folder.",
  'auth.otp.verify': '[ES] Verify',
  'auth.otp.resend': '[ES] Re-send code',
  'auth.otp.resent': '[ES] Code re-sent. Check your email.',
  'auth.otp.back': '[ES] Back',
  'auth.error.signIn': '[ES] Sign in failed. Check your email and password.',
  'auth.error.signUp': '[ES] Could not start sign up.',
  'auth.error.otp': '[ES] Could not verify your code.',
  'auth.error.resend': '[ES] Could not re-send code.',
  'auth.error.emailRequired': '[ES] Email and password are required.',
  'auth.error.passwordShort': '[ES] Password must be at least 8 characters.',
  'auth.error.inviteShort': '[ES] Invite code looks too short. Double-check what you pasted.',
  'auth.error.inviteInvalid':
    '[ES] That invite code is invalid or already used. Ask the person who gave it to you for a fresh one.',
  'auth.info.checkEmail': '[ES] Check your email for a 6-digit code.',

  // Waiting room
  'waiting.title': "[ES] You're in the queue",
  'waiting.body':
    '[ES] A community admin is reviewing your account. This usually takes about 24 hours. ' +
    "You'll get access to the marketplace as soon as you're approved — this screen will update on its own.",
  'waiting.whileYouWait.title': '[ES] While you wait',
  'waiting.whileYouWait.body':
    "[ES] We don't collect more from you than what's in front of you. We're not watching what you do here. Close the app and check back in a day.",
  'waiting.signedInAs': '[ES] Signed in as',
  'waiting.signOut': '[ES] Sign out',
  'waiting.verified': "[ES] You're verified. Loading the feed.",

  // Onboarding tour
  'onboarding.gate.title': "[ES] You're in.",
  'onboarding.gate.body':
    '[ES] A community admin let you in. Leave any time — Profile has a Delete button that wipes everything you posted.',
  'onboarding.gate.microcopy': '[ES] 2 more — about 30 seconds.',
  'onboarding.gate.cta': '[ES] Next',
  'onboarding.handle.title': '[ES] Pick a handle, not a name.',
  'onboarding.handle.body':
    "[ES] No real names — not yours, not your kid's. Change your handle any time. See someone using a real name? Skip that listing.",
  'onboarding.handle.microcopy': '[ES] One more — claiming.',
  'onboarding.handle.cta': '[ES] Next',
  'onboarding.claim.title': '[ES] You see each other on claim.',
  'onboarding.claim.body':
    '[ES] Tap Claim and the poster sees your handle. You see the contact they chose (Signal, Proton, etc.). Pickup happens off-app.',
  'onboarding.claim.microcopy': '[ES] Profile has "See intro again."',
  'onboarding.claim.cta': '[ES] Get started',

  // Navigation tabs
  'nav.feed': '[ES] Feed',
  'nav.profile': '[ES] You',

  // Common / shared
  'common.error.generic': '[ES] Something went wrong. Please try again.',
  'common.dismiss': '[ES] Dismiss notification',
  'common.loading': '[ES] Loading…',
};

export default es;
