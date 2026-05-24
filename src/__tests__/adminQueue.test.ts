import {
  ADMIN_VIEWABLE_USER_FIELDS,
  applyVerificationDelta,
  filterQueueEligible,
  formatApplicantRow,
  formatRelativeAge,
  isQueueEligibleHandle,
  type AdminApplicantRow,
  type QueueEvent,
  type QueueResource,
} from '@/lib/verificationQueue';

// ============================================================================
// PRIVACY contract — load-bearing tests
// ============================================================================

describe('ADMIN_VIEWABLE_USER_FIELDS — privacy contract (Quinn DFS-1)', () => {
  it('contains exactly the 5+1 fields the admin is allowed to see (id + 5 display)', () => {
    // id is needed as a key — it is not displayed. The 5 displayed fields are
    // handle, postal_prefix, city, referrer_token_hash (presence), created_at.
    expect([...ADMIN_VIEWABLE_USER_FIELDS]).toEqual([
      'id',
      'handle',
      'postal_prefix',
      'city',
      'referrer_token_hash',
      'created_at',
    ]);
  });

  it('does NOT include email — Quinn DFS-1 data-minimum default', () => {
    // Email lives on auth.users, but a future regression could try to add a
    // server-side view exposing it. Guard explicitly.
    expect(ADMIN_VIEWABLE_USER_FIELDS as readonly string[]).not.toContain('email');
  });

  it('does NOT include is_admin, is_verified, or last_active_at', () => {
    const fields = ADMIN_VIEWABLE_USER_FIELDS as readonly string[];
    expect(fields).not.toContain('is_admin');
    expect(fields).not.toContain('is_verified');
    expect(fields).not.toContain('last_active_at');
  });
});

// ============================================================================
// isQueueEligibleHandle + filterQueueEligible
// ============================================================================

describe('isQueueEligibleHandle', () => {
  it('rejects placeholder handles (still in signup step 3)', () => {
    expect(isQueueEligibleHandle('pending-abc123')).toBe(false);
    expect(isQueueEligibleHandle('pending-')).toBe(false);
  });

  it('accepts real handles', () => {
    expect(isQueueEligibleHandle('brave-otter-3829')).toBe(true);
    expect(isQueueEligibleHandle('quiet-bear-0001')).toBe(true);
  });
});

describe('filterQueueEligible', () => {
  it('drops pending-* handles from the queue', () => {
    const rows = [
      { id: '1', handle: 'pending-x' },
      { id: '2', handle: 'brave-otter-3829' },
      { id: '3', handle: 'pending-y' },
      { id: '4', handle: 'quiet-bear-0001' },
    ];
    expect(filterQueueEligible(rows).map((r) => r.id)).toEqual(['2', '4']);
  });

  it('returns a new array (does not mutate input)', () => {
    const input = [{ id: '1', handle: 'brave-otter-3829' }];
    const out = filterQueueEligible(input);
    expect(out).not.toBe(input);
  });
});

// ============================================================================
// applyVerificationDelta
// ============================================================================

const applicantA: QueueResource = {
  id: 'a',
  is_verified: false,
  handle: 'brave-otter-3829',
};
const applicantB: QueueResource = {
  id: 'b',
  is_verified: false,
  handle: 'quiet-bear-0001',
};

describe('applyVerificationDelta — INSERT', () => {
  it('adds a new unverified applicant', () => {
    const result = applyVerificationDelta([applicantA], {
      type: 'INSERT',
      new: applicantB,
    });
    expect(result).toEqual([applicantA, applicantB]);
  });

  it('ignores INSERT for an already-verified row', () => {
    const verified: QueueResource = { ...applicantB, is_verified: true };
    const state = [applicantA];
    const result = applyVerificationDelta(state, { type: 'INSERT', new: verified });
    expect(result).toBe(state);
  });

  it('ignores INSERT for a pending-* handle (still in signup)', () => {
    const pending: QueueResource = { id: 'p', is_verified: false, handle: 'pending-xyz' };
    const state = [applicantA];
    const result = applyVerificationDelta(state, { type: 'INSERT', new: pending });
    expect(result).toBe(state);
  });

  it('is idempotent — INSERT for an existing id is a no-op', () => {
    const state = [applicantA];
    const result = applyVerificationDelta(state, { type: 'INSERT', new: applicantA });
    expect(result).toBe(state);
  });
});

describe('applyVerificationDelta — UPDATE', () => {
  it('removes a row when it flips to verified (co-admin approved)', () => {
    const state = [applicantA, applicantB];
    const verified: QueueResource = { ...applicantA, is_verified: true };
    const result = applyVerificationDelta(state, {
      type: 'UPDATE',
      new: verified,
      old: { id: 'a' },
    });
    expect(result.map((r) => r.id)).toEqual(['b']);
  });

  it('replaces in place when row remains in the queue', () => {
    const state = [applicantA, applicantB];
    const updated: QueueResource = { ...applicantA, handle: 'brave-otter-9999' };
    const result = applyVerificationDelta(state, {
      type: 'UPDATE',
      new: updated,
      old: { id: 'a' },
    });
    expect(result.find((r) => r.id === 'a')?.handle).toBe('brave-otter-9999');
  });

  it('drops a row when it flips to a pending-* handle (extremely unlikely; defensive)', () => {
    const state = [applicantA];
    const odd: QueueResource = { ...applicantA, handle: 'pending-recycled' };
    const result = applyVerificationDelta(state, {
      type: 'UPDATE',
      new: odd,
      old: { id: 'a' },
    });
    expect(result).toEqual([]);
  });

  it('adds the row if not present + still eligible (out-of-order arrival)', () => {
    const state: QueueResource[] = [];
    const result = applyVerificationDelta(state, {
      type: 'UPDATE',
      new: applicantA,
      old: { id: 'a' },
    });
    expect(result).toEqual([applicantA]);
  });
});

describe('applyVerificationDelta — DELETE', () => {
  it('removes the row by id (reject_user cascade)', () => {
    const state = [applicantA, applicantB];
    const result = applyVerificationDelta(state, {
      type: 'DELETE',
      old: { id: 'a' },
    });
    expect(result.map((r) => r.id)).toEqual(['b']);
  });

  it('is a no-op when the id is not in state', () => {
    const state = [applicantA];
    const result = applyVerificationDelta(state, {
      type: 'DELETE',
      old: { id: 'missing' },
    });
    expect(result).toBe(state);
  });
});

describe('applyVerificationDelta — sequence', () => {
  it('handles a realistic INSERT → UPDATE → DELETE flow', () => {
    const events: QueueEvent[] = [
      { type: 'INSERT', new: applicantA },
      { type: 'INSERT', new: applicantB },
      // Co-admin approves applicantA → flips is_verified=true → drop
      { type: 'UPDATE', new: { ...applicantA, is_verified: true }, old: { id: 'a' } },
      // Reject applicantB → DELETE
      { type: 'DELETE', old: { id: 'b' } },
    ];
    const result = events.reduce<QueueResource[]>((acc, ev) => applyVerificationDelta(acc, ev), []);
    expect(result).toEqual([]);
  });
});

// ============================================================================
// formatApplicantRow
// ============================================================================

describe('formatApplicantRow', () => {
  it('formats a row with an invite token as "Valid · single-use"', () => {
    const row: AdminApplicantRow = {
      id: 'a',
      handle: 'brave-otter-3829',
      postal_prefix: 'V1Y',
      city: 'Kelowna',
      referrer_token_hash: 'bcrypt:xj38...',
      created_at: '2026-05-20T10:00:00Z',
    };
    const out = formatApplicantRow(row);
    expect(out).toEqual({
      id: 'a',
      handle: 'brave-otter-3829',
      postalPrefix: 'V1Y',
      city: 'Kelowna',
      referredByLabel: 'Valid · single-use',
      createdAt: '2026-05-20T10:00:00Z',
    });
  });

  it('formats a row with a NULL token as "(none — bypassed)"', () => {
    const row: AdminApplicantRow = {
      id: 'b',
      handle: 'quiet-bear-0001',
      postal_prefix: 'M5V',
      city: 'Toronto',
      referrer_token_hash: null,
      created_at: '2026-05-20T10:00:00Z',
    };
    expect(formatApplicantRow(row).referredByLabel).toBe('(none — bypassed)');
  });

  it('never leaks the raw bcrypt hash into the formatted label', () => {
    const row: AdminApplicantRow = {
      id: 'c',
      handle: 'quick-fox-4321',
      postal_prefix: null,
      city: null,
      referrer_token_hash: '$2b$10$VERYSECRETHASH',
      created_at: '2026-05-20T10:00:00Z',
    };
    const out = formatApplicantRow(row);
    expect(out.referredByLabel).toBe('Valid · single-use');
    // Sanity: the hash is NOT in any string field.
    expect(JSON.stringify(out)).not.toContain('VERYSECRETHASH');
  });

  it('renders null postal_prefix / city as "—" for stable grid display', () => {
    const row: AdminApplicantRow = {
      id: 'd',
      handle: 'sleepy-cat-9999',
      postal_prefix: null,
      city: null,
      referrer_token_hash: null,
      created_at: '2026-05-20T10:00:00Z',
    };
    const out = formatApplicantRow(row);
    expect(out.postalPrefix).toBe('—');
    expect(out.city).toBe('—');
  });
});

// ============================================================================
// formatRelativeAge
// ============================================================================

describe('formatRelativeAge', () => {
  const NOW = Date.parse('2026-05-24T12:00:00Z');

  it('returns "just now" for <60s', () => {
    expect(formatRelativeAge('2026-05-24T11:59:30Z', NOW)).toBe('just now');
  });

  it('returns "Xm ago" for <60min', () => {
    expect(formatRelativeAge('2026-05-24T11:45:00Z', NOW)).toBe('15m ago');
  });

  it('returns "Xh ago" for <24h', () => {
    expect(formatRelativeAge('2026-05-24T09:00:00Z', NOW)).toBe('3h ago');
  });

  it('returns "Xd ago" for <30d', () => {
    expect(formatRelativeAge('2026-05-22T12:00:00Z', NOW)).toBe('2d ago');
  });

  it('returns a date string for >30d', () => {
    expect(formatRelativeAge('2026-01-01T12:00:00Z', NOW)).toBe('2026-01-01');
  });

  it('falls back to "recently" for unparseable input', () => {
    expect(formatRelativeAge('not-a-date', NOW)).toBe('recently');
  });

  it('treats negative deltas (clock skew) as just now', () => {
    expect(formatRelativeAge('2027-01-01T00:00:00Z', NOW)).toBe('just now');
  });
});
