/**
 * English message catalog — Phase 3.4 i18n.
 *
 * This is the BASE catalog. All other locales must have every key
 * present here. Missing keys fall back to English via react-intl's
 * defaultMessage mechanism.
 *
 * Key naming: <screen>.<element>.<detail>
 * ICU MessageFormat for pluralization: {count, plural, one {# item} other {# items}}
 *
 * Brand name "Mutual Mesh" is NOT in this catalog (AC-12 — never translated).
 * User-generated content (resource names, descriptions, handles) is NOT
 * extracted — it stays in the poster's language.
 */

import type { MessageCatalog } from '@/lib/i18n';

const en: MessageCatalog = {
  // ──────────────────────────────────────────────────────────────────────────
  // Home / Feed
  // ──────────────────────────────────────────────────────────────────────────
  'home.title': 'Available now',
  'home.empty.title': 'Nothing here yet',
  'home.empty.description':
    'Your community is just starting. Check back later, or invite a neighbor — every listing makes this more useful for the next person.',
  'home.empty.cta': 'Post a resource',
  'home.error.title': "Couldn't load listings",
  'home.error.cta': 'Try again',
  'home.fab.label': 'Post a resource',
  'home.refresh.label': 'Pull to refresh listings',
  'home.resource.label':
    '{name}, {status}{neighborhood, select, none {} other {, neighborhood {neighborhood}}}',

  // ──────────────────────────────────────────────────────────────────────────
  // Map toggle (MapToggle component)
  // ──────────────────────────────────────────────────────────────────────────
  'map.toggle.label': 'View mode',
  'map.toggle.list': 'List',
  'map.toggle.map': 'Map',
  'map.toggle.list.hint': 'Shows resources in a scrollable list. Default view.',
  'map.toggle.map.hint':
    'Shows resources grouped by neighborhood on a map. Tap a region to filter the list.',

  // ──────────────────────────────────────────────────────────────────────────
  // Map view (ResourceMapScreen)
  // ──────────────────────────────────────────────────────────────────────────
  'map.unavailable.title': 'Map not available',
  'map.unavailable.description':
    'The map library is not installed yet. Switch to list view to see resources.',
  'map.unavailable.cta': 'Switch to list view',
  'map.fsa.hint': 'Tap to see resources in this neighborhood as a list.',
  'map.summary.zero': 'Map shows no neighborhoods with available resources.',
  'map.summary.one': 'Map shows 1 neighborhood with available resources.',
  'map.summary.other': 'Map shows {count} neighborhoods with available resources.',
  'map.bucket.none': 'no resources',
  'map.bucket.light': 'a few resources',
  'map.bucket.medium': 'several resources',
  'map.bucket.heavy': 'many resources',
  'map.neighborhoods.none': 'No neighborhoods with available resources.',

  // ──────────────────────────────────────────────────────────────────────────
  // Resource detail
  // ──────────────────────────────────────────────────────────────────────────
  'detail.loading': 'Loading…',
  'detail.notFound': 'Resource not found.',
  'detail.missingId': 'Missing resource id.',
  'detail.description.label': 'Description',
  'detail.pickup.label': 'Pickup',
  'detail.contact.label': 'Contact the poster',
  'detail.contact.warning':
    'This handle is provided by the poster. Verify before sharing personal details.',
  'detail.claim.button': 'Claim this item',
  'detail.claim.hint': "Reserves this item for you and reveals the poster's contact handle.",
  'detail.claim.modal.title': 'Claim this item?',
  'detail.claim.modal.body':
    "Once you claim, the poster's contact handle is revealed to you. They'll see your handle too. Other users can't claim it after that.",
  'detail.claim.modal.confirm': 'Yes, claim',
  'detail.claim.modal.cancel': 'Not yet',
  'detail.reserved': 'This item is reserved.',
  'detail.photo.label': 'Photo of {name}',
  'detail.error.load': 'Could not load this resource.',
  'detail.error.claim': 'Could not claim this resource.',

  // ──────────────────────────────────────────────────────────────────────────
  // Add resource
  // ──────────────────────────────────────────────────────────────────────────
  'addResource.title': 'Post a resource',
  'addResource.photoNotice': 'Photos uploaded here have all metadata removed automatically.',
  'addResource.name.label': 'What is it?',
  'addResource.name.hint': "e.g., 'Sensitive baby formula, unopened'",
  'addResource.description.label': 'Details',
  'addResource.description.hint': 'Quantity, expiry, allergens, anything a recipient should know.',
  'addResource.pickup.label': 'Pickup info',
  'addResource.pickup.hint': 'Where and when. Be as specific or vague as you want.',
  'addResource.contact.label': 'Contact handle (revealed only on claim)',
  'addResource.contact.hint': 'Signal handle, Proton email, or any handle you trust. No links.',
  'addResource.photo.label': 'Photo (optional)',
  'addResource.photo.metadataNotice':
    'All metadata (location, device, time) is stripped before upload.',
  'addResource.photo.change': 'Change photo',
  'addResource.photo.preview': 'Photo preview',
  'addResource.photo.remove': 'Remove photo',
  'addResource.photo.add': 'Add a photo',
  'addResource.submit': 'Post resource',
  'addResource.submitting': 'Posting…',
  'addResource.cancel': 'Cancel',
  'addResource.error.post': 'Could not post your resource.',
  'addResource.error.photoPerm': 'Photo library permission denied. You can post without a photo.',

  // ──────────────────────────────────────────────────────────────────────────
  // Profile
  // ──────────────────────────────────────────────────────────────────────────
  'profile.title': 'Your profile',
  'profile.handle.label': 'Handle',
  'profile.neighborhood.label': 'Neighborhood',
  'profile.city.label': 'City',
  'profile.posted.label': 'Posted',
  'profile.claims.label': 'Active claims',
  'profile.errorReporting.title': 'Help improve Mutual Mesh',
  'profile.errorReporting.toggle': 'Send anonymous error reports',
  'profile.errorReporting.hint': 'No personal data — only crash counts.',
  'profile.signOut': 'Sign out',
  'profile.deleteAccount': 'Delete my account',
  'profile.deleteAccount.hint': 'Permanently deletes your account, posts, and active claims.',
  'profile.deleteAccount.modal.title': 'Delete your account?',
  'profile.deleteAccount.modal.body':
    'This removes your account, your posts, and your claims from Mutual Mesh immediately. ' +
    'Honest disclosure: Supabase keeps automatic backups for ~7 days, so the data is technically ' +
    "recoverable from a backup during that window. We cannot scrub backups — that's a platform limit. " +
    'You can sign up again with the same email later if you want.',
  'profile.deleteAccount.modal.confirm': 'Yes, delete',
  'profile.deleteAccount.modal.cancel': 'Cancel',
  'profile.deleteAccount.error': 'Could not delete your account.',
  'profile.language.title': 'Language',
  'profile.language.description': 'Sets the language of the app. Defaults to your device language.',
  'profile.language.reset': 'Reset to device language',

  // ──────────────────────────────────────────────────────────────────────────
  // Sign in / Sign up
  // ──────────────────────────────────────────────────────────────────────────
  'auth.signIn.subtitle': 'Sign in to continue.',
  'auth.signUp.subtitle': 'Create an account with your invite code.',
  'auth.email.label': 'Email',
  'auth.password.label': 'Password',
  'auth.password.hint': 'At least 8 characters.',
  'auth.inviteCode.label': 'Invite code',
  'auth.inviteCode.hint': 'From someone already on Mutual Mesh.',
  'auth.signIn.button': 'Sign in',
  'auth.signUp.button': 'Continue',
  'auth.switchToSignUp': 'I have an invite code — create account',
  'auth.switchToSignIn': 'Back to sign in',
  'auth.otp.title': 'Check your email',
  'auth.otp.subtitle': 'We sent a 6-digit code to {email}.',
  'auth.otp.label': '6-digit code',
  'auth.otp.hint': "If you don't see it, check your spam folder.",
  'auth.otp.verify': 'Verify',
  'auth.otp.resend': 'Re-send code',
  'auth.otp.resent': 'Code re-sent. Check your email.',
  'auth.otp.back': 'Back',
  'auth.error.signIn': 'Sign in failed. Check your email and password.',
  'auth.error.signUp': 'Could not start sign up.',
  'auth.error.otp': 'Could not verify your code.',
  'auth.error.resend': 'Could not re-send code.',
  'auth.error.emailRequired': 'Email and password are required.',
  'auth.error.passwordShort': 'Password must be at least 8 characters.',
  'auth.error.inviteShort': 'Invite code looks too short. Double-check what you pasted.',
  'auth.error.inviteInvalid':
    'That invite code is invalid or already used. Ask the person who gave it to you for a fresh one.',
  'auth.info.checkEmail': 'Check your email for a 6-digit code.',

  // ──────────────────────────────────────────────────────────────────────────
  // Waiting room
  // ──────────────────────────────────────────────────────────────────────────
  'waiting.title': "You're in the queue",
  'waiting.body':
    'A community admin is reviewing your account. This usually takes about 24 hours. ' +
    "You'll get access to the marketplace as soon as you're approved — this screen will update on its own.",
  'waiting.whileYouWait.title': 'While you wait',
  'waiting.whileYouWait.body':
    "We don't collect more from you than what's in front of you. We're not watching what you do here. Close the app and check back in a day.",
  'waiting.signedInAs': 'Signed in as',
  'waiting.signOut': 'Sign out',
  'waiting.verified': "You're verified. Loading the feed.",

  // ──────────────────────────────────────────────────────────────────────────
  // Onboarding tour
  // ──────────────────────────────────────────────────────────────────────────
  'onboarding.gate.title': "You're in.",
  'onboarding.gate.body':
    'A community admin let you in. Leave any time — Profile has a Delete button that wipes everything you posted.',
  'onboarding.gate.microcopy': '2 more — about 30 seconds.',
  'onboarding.gate.cta': 'Next',
  'onboarding.handle.title': 'Pick a handle, not a name.',
  'onboarding.handle.body':
    "No real names — not yours, not your kid's. Change your handle any time. See someone using a real name? Skip that listing.",
  'onboarding.handle.microcopy': 'One more — claiming.',
  'onboarding.handle.cta': 'Next',
  'onboarding.claim.title': 'You see each other on claim.',
  'onboarding.claim.body':
    'Tap Claim and the poster sees your handle. You see the contact they chose (Signal, Proton, etc.). Pickup happens off-app.',
  'onboarding.claim.microcopy': 'Profile has "See intro again."',
  'onboarding.claim.cta': 'Get started',

  // ──────────────────────────────────────────────────────────────────────────
  // Navigation tabs
  // ──────────────────────────────────────────────────────────────────────────
  'nav.feed': 'Feed',
  'nav.profile': 'You',

  // ──────────────────────────────────────────────────────────────────────────
  // Common / shared
  // ──────────────────────────────────────────────────────────────────────────
  'common.error.generic': 'Something went wrong. Please try again.',
  'common.dismiss': 'Dismiss notification',
  'common.loading': 'Loading…',
};

export default en;
