import { PRIVACY_POLICY_TEXT, TERMS_OF_SERVICE_TEXT } from '@/lib/policyText';

/**
 * Guardrail test for the Privacy Policy + Terms of Service text constants.
 *
 * Two properties must hold:
 *
 *   1. Both constants are non-empty (someone deleting the text by accident
 *      would break the in-app screens silently otherwise).
 *   2. Both start with "NOT LEGAL ADVICE" — the disclaimer Sky requires
 *      because these documents are drafts pending PIPEDA counsel review
 *      (PRIVACY.md D10). If an editor moves the disclaimer somewhere else
 *      in the text, the screen would render the policy as if it were
 *      final — that's a real privacy risk to users and to Sky.
 */
describe('policyText constants', () => {
  it('PRIVACY_POLICY_TEXT is non-empty', () => {
    expect(PRIVACY_POLICY_TEXT.length).toBeGreaterThan(0);
  });

  it('TERMS_OF_SERVICE_TEXT is non-empty', () => {
    expect(TERMS_OF_SERVICE_TEXT.length).toBeGreaterThan(0);
  });

  it('PRIVACY_POLICY_TEXT starts with the NOT LEGAL ADVICE disclaimer', () => {
    expect(PRIVACY_POLICY_TEXT.startsWith('NOT LEGAL ADVICE')).toBe(true);
  });

  it('TERMS_OF_SERVICE_TEXT starts with the NOT LEGAL ADVICE disclaimer', () => {
    expect(TERMS_OF_SERVICE_TEXT.startsWith('NOT LEGAL ADVICE')).toBe(true);
  });
});
