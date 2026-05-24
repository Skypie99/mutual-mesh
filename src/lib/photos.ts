import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from './supabase';

/**
 * Photo upload pipeline — EXIF strip + Supabase Storage.
 *
 * PRIVACY: PRIVACY.md D5 — two-layer EXIF strip (client + server). This
 * file is the client layer; the server-side strip lives in a Supabase
 * Edge Function (deferred to Cycle 7 ship-readiness).
 *
 * STORAGE: PRIVATE bucket `resource-photos` (S4). Path scheme:
 *   <userId>/<timestamp>.<ext>
 * RLS in supabase/schema.sql enforces:
 *   - SELECT: only verified users (via signed URL)
 *   - INSERT: only verified users + first path segment === auth.uid()
 *   - DELETE: only the owner (first path segment === auth.uid())
 */

const SIGNED_URL_TTL_SECONDS = 3600; // 1h per Steve S4 — load-bearing.
const MAX_DIMENSION = 2048; // Cap to keep upload size reasonable; preserves enough detail.
const COMPRESS_QUALITY = 0.75; // 0–1; trade-off between size and clarity.

/**
 * Re-encode the image to a fresh JPEG, dropping all EXIF (GPS, device, time).
 *
 * `expo-image-manipulator.manipulateAsync(uri, actions, options)` re-encodes
 * the underlying bitmap. EXIF metadata is in the file container, NOT the
 * bitmap — when we re-encode, the new file has no EXIF.
 *
 * This is verifiable: the output URI's file when read as bytes has no EXIF
 * markers. A unit test in __tests__ would confirm this if we had image
 * fixtures; deferred to Cycle 7 with real test images.
 *
 * @privacy-load-bearing PRIVACY.md D5 — client-side EXIF strip. Do not
 * remove or weaken without Jordan review. Failure here leaks GPS coordinates
 * embedded in camera photos (location, device make, timestamp).
 *
 * Throws a user-facing Error on codec/memory failure so callers can surface
 * the message instead of crashing silently.
 */
export async function stripExifAndCompress(localUri: string): Promise<{
  uri: string;
  width: number;
  height: number;
}> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      localUri,
      [{ resize: { width: MAX_DIMENSION } }], // resize triggers re-encode even if smaller
      {
        compress: COMPRESS_QUALITY,
        format: ImageManipulator.SaveFormat.JPEG,
      },
    );
    return { uri: result.uri, width: result.width, height: result.height };
  } catch (cause) {
    // Codec failure, memory exhaustion, or bad URI. Re-throw with a message
    // callers can show directly.
    throw new Error('Could not process your photo. Try a smaller image or post without one.', {
      cause,
    });
  }
}

/**
 * Upload a resource photo. Strips EXIF on the way in.
 *
 * Returns the Storage path (NOT a URL — call createSignedResourcePhotoUrl
 * to get a fetchable URL with 1h TTL).
 *
 * Throws on RLS rejection, network failure, or quota error. Caller wraps
 * with userFacingErrorMessage for display.
 */
export async function uploadResourcePhoto(userId: string, localUri: string): Promise<string> {
  // 1. Strip EXIF + compress
  const { uri: cleanUri } = await stripExifAndCompress(localUri);

  // 2. Read the file as a blob. expo-file-system would be the formal route,
  //    but fetch(uri).blob() works for local file URIs on RN.
  const response = await fetch(cleanUri);
  const blob = await response.blob();

  // 3. Path scheme: <userId>/<timestamp>.jpg. JPEG is hard-coded in step 1.
  const timestamp = Date.now();
  const path = `${userId}/${timestamp}.jpg`;

  // 4. Upload. The Storage RLS policy enforces:
  //    - bucket_id = 'resource-photos'
  //    - (storage.foldername(name))[1] = auth.uid()::text
  //    - user is verified
  // If any of those fail, we get a 403 here.
  const { error } = await supabase.storage.from('resource-photos').upload(path, blob, {
    contentType: 'image/jpeg',
    cacheControl: '3600',
    upsert: false,
  });

  if (error) throw error;
  return path;
}

/**
 * Generate a signed URL for a previously-uploaded photo. URLs expire after
 * SIGNED_URL_TTL_SECONDS; callers should refresh on demand rather than
 * cache the URL.
 *
 * Returns null on RLS rejection (unverified user, or path mismatch). Caller
 * should fall back to a placeholder image.
 */
export async function createSignedResourcePhotoUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('resource-photos')
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.warn('[photos] createSignedUrl failed:', error.message);
    return null;
  }
  return data.signedUrl;
}

/**
 * Delete a photo. RLS enforces ownership via path-scheme check
 * (first segment must equal auth.uid()).
 *
 * Useful when a user deletes a resource — call this in tandem with
 * deleteResourceById to free the Storage object.
 */
export async function deleteResourcePhoto(path: string) {
  return supabase.storage.from('resource-photos').remove([path]);
}
