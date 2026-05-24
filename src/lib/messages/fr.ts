/**
 * French message catalog — Phase 3.4 i18n.
 *
 * STUB: All values are "[FR] <English original>" placeholders.
 * Professional / native-speaker translation replaces these before shipping.
 * AC-9: NEVER use AI translation, even as a draft.
 *
 * Every key from en.ts must appear here. Missing keys fall back to
 * English via react-intl's defaultMessage mechanism, but the CI check
 * (`npm run check:translations`) will flag them.
 */

import type { MessageCatalog } from '@/lib/i18n';

const fr: MessageCatalog = {
  // Home / Feed
  'home.title': '[FR] Available now',
  'home.empty.title': '[FR] Nothing here yet',
  'home.empty.description':
    '[FR] Your community is just starting. Check back later, or invite a neighbor — every listing makes this more useful for the next person.',
  'home.empty.cta': '[FR] Post a resource',
  'home.error.title': "[FR] Couldn't load listings",
  'home.error.cta': '[FR] Try again',
  'home.fab.label': '[FR] Post a resource',
  'home.refresh.label': '[FR] Pull to refresh listings',
  'home.resource.label':
    '[FR] {name}, {status}{neighborhood, select, none {} other {, neighborhood {neighborhood}}}',

  // Map toggle
  'map.toggle.label': '[FR] View mode',
  'map.toggle.list': '[FR] List',
  'map.toggle.map': '[FR] Map',
  'map.toggle.list.hint': '[FR] Shows resources in a scrollable list. Default view.',
  'map.toggle.map.hint':
    '[FR] Shows resources grouped by neighborhood on a map. Tap a region to filter the list.',

  // Map view
  'map.unavailable.title': '[FR] Map not available',
  'map.unavailable.description':
    '[FR] The map library is not installed yet. Switch to list view to see resources.',
  'map.unavailable.cta': '[FR] Switch to list view',
  'map.fsa.hint': '[FR] Tap to see resources in this neighborhood as a list.',
  'map.summary.zero': '[FR] Map shows no neighborhoods with available resources.',
  'map.summary.one': '[FR] Map shows 1 neighborhood with available resources.',
  'map.summary.other': '[FR] Map shows {count} neighborhoods with available resources.',
  'map.bucket.none': '[FR] no resources',
  'map.bucket.light': '[FR] a few resources',
  'map.bucket.medium': '[FR] several resources',
  'map.bucket.heavy': '[FR] many resources',
  'map.neighborhoods.none': '[FR] No neighborhoods with available resources.',

  // Resource detail
  'detail.loading': '[FR] Loading…',
  'detail.notFound': '[FR] Resource not found.',
  'detail.missingId': '[FR] Missing resource id.',
  'detail.description.label': '[FR] Description',
  'detail.pickup.label': '[FR] Pickup',
  'detail.contact.label': '[FR] Contact the poster',
  'detail.contact.warning':
    '[FR] This handle is provided by the poster. Verify before sharing personal details.',
  'detail.claim.button': '[FR] Claim this item',
  'detail.claim.hint':
    "[FR] Reserves this item for you and reveals the poster's contact handle.",
  'detail.claim.modal.title': '[FR] Claim this item?',
  'detail.claim.modal.body':
    "[FR] Once you claim, the poster's contact handle is revealed to you. They'll see your handle too. Other users can't claim it after that.",
  'detail.claim.modal.confirm': '[FR] Yes, claim',
  'detail.claim.modal.cancel': '[FR] Not yet',
  'detail.reserved': '[FR] This item is reserved.',
  'detail.photo.label': '[FR] Photo of {name}',
  'detail.error.load': '[FR] Could not load this resource.',
  'detail.error.claim': '[FR] Could not claim this resource.',

  // Add resource
  'addResource.title': '[FR] Post a resource',
  'addResource.photoNotice':
    '[FR] Photos uploaded here have all metadata removed automatically.',
  'addResource.name.label': '[FR] What is it?',
  'addResource.name.hint': "[FR] e.g., 'Sensitive baby formula, unopened'",
  'addResource.description.label': '[FR] Details',
  'addResource.description.hint':
    '[FR] Quantity, expiry, allergens, anything a recipient should know.',
  'addResource.pickup.label': '[FR] Pickup info',
  'addResource.pickup.hint': '[FR] Where and when. Be as specific or vague as you want.',
  'addResource.contact.label': '[FR] Contact handle (revealed only on claim)',
  'addResource.contact.hint':
    '[FR] Signal handle, Proton email, or any handle you trust. No links.',
  'addResource.photo.label': '[FR] Photo (optional)',
  'addResource.photo.metadataNotice':
    '[FR] All metadata (location, device, time) is stripped before upload.',
  'addResource.photo.change': '[FR] Change photo',
  'addResource.photo.preview': '[FR] Photo preview',
  'addResource.photo.remove': '[FR] Remove photo',
  'addResource.photo.add': '[FR] Add a photo',
  'addResource.submit': '[FR] Post resource',
  'addResource.submitting': '[FR] Posting…',
  'addResource.cancel': '[FR] Cancel',
  'addResource.error.post': '[FR] Could not post your resource.',
  'addResource.error.photoPerm':
    '[FR] Photo library permission denied. You can post without a photo.',

  // Profile
  'profile.title': '[FR] Your profile',
  'profile.handle.label': '[FR] Handle',
  'profile.neighborhood.label': '[FR] Neighborhood',
  'profile.city.label': '[FR] City',
  'profile.posted.label': '[FR] Posted',
  'profile.claims.label': '[FR] Active claims',
  'profile.errorReporting.title': '[FR] Help improve Mutual Mesh',
  'profile.errorReporting.toggle': '[FR] Send anonymous error reports',
  'profile.errorReporting.hint': '[FR] No personal data — only crash counts.',
  'profile.signOut': '[FR] Sign out',
  'profile.deleteAccount': '[FR] Delete my account',
  'profile.deleteAccount.hint':
    '[FR] Permanently deletes your account, posts, and active claims.',
  'profile.deleteAccount.modal.title': '[FR] Delete your account?',
  'profile.deleteAccount.modal.body':
    '[FR] This removes your account, your posts, and your claims from Mutual Mesh immediately. ' +
    'Honest disclosure: Supabase keeps automatic backups for ~7 days, so the data is technically ' +
    "recoverable from a backup during that window. We cannot scrub backups — that's a platform limit. " +
    'You can sign up again with the same email later if you want.',
  'profile.deleteAccount.modal.confirm': '[FR] Yes, delete',
  'profile.deleteAccount.modal.cancel': '[FR] Cancel',
  'profile.deleteAccount.error': '[FR] Could not delete your account.',
  'profile.language.title': '[FR] Language',
  'profile.language.description':
    '[FR] Sets the language of the app. Defaults to your device language.',
  'profile.language.reset': '[FR] Reset to device language',

  // Sign in / Sign up
  'auth.signIn.subtitle': '[FR] Sign in to continue.',
  'auth.signUp.subtitle': '[FR] Create an account with your invite code.',
  'auth.email.label': '[FR] Email',
  'auth.password.label': '[FR] Password',
  'auth.password.hint': '[FR] At least 8 characters.',
  'auth.inviteCode.label': '[FR] Invite code',
  'auth.inviteCode.hint': '[FR] From someone already on Mutual Mesh.',
  'auth.signIn.button': '[FR] Sign in',
  'auth.signUp.button': '[FR] Continue',
  'auth.switchToSignUp': '[FR] I have an invite code — create account',
  'auth.switchToSignIn': '[FR] Back to sign in',
  'auth.otp.title': '[FR] Check your email',
  'auth.otp.subtitle': '[FR] We sent a 6-digit code to {email}.',
  'auth.otp.label': '[FR] 6-digit code',
  'auth.otp.hint': "[FR] If you don't see it, check your spam folder.",
  'auth.otp.verify': '[FR] Verify',
  'auth.otp.resend': '[FR] Re-send code',
  'auth.otp.resent': '[FR] Code re-sent. Check your email.',
  'auth.otp.back': '[FR] Back',
  'auth.error.signIn': '[FR] Sign in failed. Check your email and password.',
  'auth.error.signUp': '[FR] Could not start sign up.',
  'auth.error.otp': '[FR] Could not verify your code.',
  'auth.error.resend': '[FR] Could not re-send code.',
  'auth.error.emailRequired': '[FR] Email and password are required.',
  'auth.error.passwordShort': '[FR] Password must be at least 8 characters.',
  'auth.error.inviteShort':
    '[FR] Invite code looks too short. Double-check what you pasted.',
  'auth.error.inviteInvalid':
    '[FR] That invite code is invalid or already used. Ask the person who gave it to you for a fresh one.',
  'auth.info.checkEmail': '[FR] Check your email for a 6-digit code.',

  // Waiting room
  'waiting.title': "[FR] You're in the queue",
  'waiting.body':
    "[FR] A community admin is reviewing your account. This usually takes about 24 hours. " +
    "You'll get access to the marketplace as soon as you're approved — this screen will update on its own.",
  'waiting.whileYouWait.title': '[FR] While you wait',
  'waiting.whileYouWait.body':
    "[FR] We don't collect more from you than what's in front of you. We're not watching what you do here. Close the app and check back in a day.",
  'waiting.signedInAs': '[FR] Signed in as',
  'waiting.signOut': '[FR] Sign out',
  'waiting.verified': "[FR] You're verified. Loading the feed.",

  // Onboarding tour
  'onboarding.gate.title': "[FR] You're in.",
  'onboarding.gate.body':
    '[FR] A community admin let you in. Leave any time — Profile has a Delete button that wipes everything you posted.',
  'onboarding.gate.microcopy': '[FR] 2 more — about 30 seconds.',
  'onboarding.gate.cta': '[FR] Next',
  'onboarding.handle.title': '[FR] Pick a handle, not a name.',
  'onboarding.handle.body':
    "[FR] No real names — not yours, not your kid's. Change your handle any time. See someone using a real name? Skip that listing.",
  'onboarding.handle.microcopy': '[FR] One more — claiming.',
  'onboarding.handle.cta': '[FR] Next',
  'onboarding.claim.title': '[FR] You see each other on claim.',
  'onboarding.claim.body':
    '[FR] Tap Claim and the poster sees your handle. You see the contact they chose (Signal, Proton, etc.). Pickup happens off-app.',
  'onboarding.claim.microcopy': '[FR] Profile has "See intro again."',
  'onboarding.claim.cta': '[FR] Get started',

  // Navigation tabs
  'nav.feed': '[FR] Feed',
  'nav.profile': '[FR] You',

  // Common / shared
  'common.error.generic': '[FR] Something went wrong. Please try again.',
  'common.dismiss': '[FR] Dismiss notification',
  'common.loading': '[FR] Loading…',
};

export default fr;
