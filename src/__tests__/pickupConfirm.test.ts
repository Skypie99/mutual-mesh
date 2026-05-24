import { canConfirm, getConfirmButtonCopy, getConfirmButtonHint } from '@/lib/pickupConfirm';
import type { ResourceRow } from '@/types/database';

const POSTER = 'poster-uid-aaa';
const CLAIMANT = 'claimant-uid-bbb';
const OUTSIDER = 'outsider-uid-zzz';

const reserved: Pick<ResourceRow, 'status' | 'posted_by' | 'claimed_by'> = {
  status: 'reserved',
  posted_by: POSTER,
  claimed_by: CLAIMANT,
};
const available: Pick<ResourceRow, 'status' | 'posted_by' | 'claimed_by'> = {
  status: 'available',
  posted_by: POSTER,
  claimed_by: null,
};
const completed: Pick<ResourceRow, 'status' | 'posted_by' | 'claimed_by'> = {
  status: 'completed',
  posted_by: POSTER,
  claimed_by: CLAIMANT,
};

describe('canConfirm', () => {
  it('allows the claimant on a reserved row', () => {
    expect(canConfirm(reserved, CLAIMANT)).toBe(true);
  });

  it('allows the poster on a reserved row', () => {
    expect(canConfirm(reserved, POSTER)).toBe(true);
  });

  it('rejects an outsider on a reserved row', () => {
    expect(canConfirm(reserved, OUTSIDER)).toBe(false);
  });

  it('rejects any user on an available row (no claim exists)', () => {
    expect(canConfirm(available, POSTER)).toBe(false);
    expect(canConfirm(available, CLAIMANT)).toBe(false);
    expect(canConfirm(available, OUTSIDER)).toBe(false);
  });

  it('rejects any user on a completed row (idempotent — RPC would no-op anyway)', () => {
    expect(canConfirm(completed, POSTER)).toBe(false);
    expect(canConfirm(completed, CLAIMANT)).toBe(false);
  });

  it('handles claimed_by=null defensively (treats as not-the-claimant)', () => {
    const odd = { status: 'reserved' as const, posted_by: POSTER, claimed_by: null };
    expect(canConfirm(odd, CLAIMANT)).toBe(false);
    expect(canConfirm(odd, POSTER)).toBe(true);
  });
});

describe('getConfirmButtonCopy', () => {
  it('returns claimant copy for the claimant', () => {
    expect(getConfirmButtonCopy(reserved, CLAIMANT)).toBe('I picked this up');
  });

  it('returns poster copy for the poster', () => {
    expect(getConfirmButtonCopy(reserved, POSTER)).toBe('They picked it up');
  });

  it('returns null for an outsider', () => {
    expect(getConfirmButtonCopy(reserved, OUTSIDER)).toBeNull();
  });

  it('returns null on a completed row even for the parties', () => {
    expect(getConfirmButtonCopy(completed, POSTER)).toBeNull();
    expect(getConfirmButtonCopy(completed, CLAIMANT)).toBeNull();
  });

  it('returns null on an available row for any user', () => {
    expect(getConfirmButtonCopy(available, POSTER)).toBeNull();
    expect(getConfirmButtonCopy(available, CLAIMANT)).toBeNull();
  });
});

describe('getConfirmButtonHint', () => {
  it('returns the claimant hint for the claimant copy', () => {
    expect(getConfirmButtonHint('I picked this up')).toMatch(/exchange happened/i);
  });

  it('returns the poster hint for the poster copy', () => {
    expect(getConfirmButtonHint('They picked it up')).toMatch(/claimant came/i);
  });
});

// ============================================================================
// Phase 4 Gary coverage gaps — see qa-reports/phase-4-gary-coverage-audit.md
// ============================================================================

describe('getConfirmButtonCopy — both-roles edge case (total-function safety)', () => {
  it('returns claimant copy when same user is BOTH poster and claimant', () => {
    // Per JSDoc: impossible in production (claim_resource rejects self-claim);
    // included only for total-function safety. The claimant copy must win
    // because the act of picking up reflects the user's lived agency.
    const bothRoles: Pick<
      Parameters<typeof getConfirmButtonCopy>[0],
      'status' | 'posted_by' | 'claimed_by'
    > = {
      status: 'reserved',
      posted_by: POSTER,
      claimed_by: POSTER, // same user
    };
    expect(getConfirmButtonCopy(bothRoles, POSTER)).toBe('I picked this up');
  });
});

describe('canConfirm — defensive: undefined / odd status', () => {
  it('rejects when status is some unknown string', () => {
    const odd = {
      status: 'cancelled' as unknown as 'reserved',
      posted_by: POSTER,
      claimed_by: CLAIMANT,
    };
    expect(canConfirm(odd, POSTER)).toBe(false);
    expect(canConfirm(odd, CLAIMANT)).toBe(false);
  });
});
