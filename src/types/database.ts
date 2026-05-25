/**
 * Database types for Mutual Mesh.
 *
 * **GOTCHA (CLAUDE.md #1):** Row / Insert / Update are declared with `type`
 * NOT `interface`. If you switch to `interface`, postgrest-js infers
 * `Schema = never` and every `.insert()` / `.update()` call breaks with
 * "argument not assignable to type 'never'". `npm run typecheck` is the canary.
 *
 * Mirrors `supabase/schema.sql` (Dana, 2026-05-23).
 */

// ============================================================================
// Domain enums
// ============================================================================

export type ResourceStatus = 'available' | 'reserved' | 'completed';

export type ResourceCategory = 'food' | 'hygiene' | 'baby' | 'HRT' | 'other';

export type PushPreferences = {
  enabled: boolean;
  on_claim?: boolean;
  on_pickup?: boolean;
  on_approve?: boolean;
  on_reject?: boolean;
};

export type VerificationDecision = 'approve' | 'reject' | 'escalate';

// ============================================================================
// Row shapes
// ============================================================================

export type UserRow = {
  id: string;
  handle: string;
  postal_prefix: string | null;
  city: string | null;
  is_verified: boolean;
  is_admin: boolean;
  referrer_token_hash: string | null;
  onboarding_complete: boolean;
  push_preferences: PushPreferences;
  last_active_at: string;
  created_at: string;
};

export type InviteTokenRow = {
  token_hash: string;
  created_by: string | null;
  created_at: string;
  used_at: string | null;
  used_by: string | null;
};

export type VerificationLogRow = {
  id: number;
  applicant_id: string;
  admin_id: string | null;
  decision: VerificationDecision;
  reason: string | null;
  decided_at: string;
};

export type CronLogRow = {
  id: number;
  job_name: string;
  ran_at: string;
  rows_affected: number | null;
  success: boolean;
  error_text: string | null;
};

export type ResourceRow = {
  id: string;
  posted_by: string;
  claimed_by: string | null;
  name: string;
  description: string | null;
  photo_url: string | null;
  pickup_text: string;
  contact_handle: string;
  category: ResourceCategory;
  status: ResourceStatus;
  postal_prefix: string | null;
  city: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  created_at: string;
  status_changed_at: string;
};

export type ConfigRow = {
  key: string;
  value: string;
};

export type PushTokenRow = {
  id: string;
  user_id: string;
  expo_token: string;
  platform: string;
  created_at: string;
  last_used_at: string;
};

export type ErrorReportRow = {
  id: string;
  created_at: string;
  app_version: string;
  platform: string;
  severity: string;
  message_hash: string;
  stack_hash: string;
  count: number;
  last_seen_at: string;
};

// ============================================================================
// Relationships placeholder (keeps postgrest-js happy)
// ============================================================================

type EmptyRelationships = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne?: boolean;
  referencedRelation: string;
  referencedColumns: string[];
}[];

// ============================================================================
// Database — the shape postgrest-js consumes
// ============================================================================

export type Database = {
  public: {
    Tables: {
      users: {
        Row: UserRow;
        Insert: Omit<
          UserRow,
          | 'created_at'
          | 'last_active_at'
          | 'is_verified'
          | 'is_admin'
          | 'onboarding_complete'
          | 'push_preferences'
        > & {
          created_at?: string;
          last_active_at?: string;
          is_verified?: boolean;
          is_admin?: boolean;
          onboarding_complete?: boolean;
          push_preferences?: PushPreferences;
        };
        Update: Partial<UserRow>;
        Relationships: EmptyRelationships;
      };
      invite_tokens: {
        Row: InviteTokenRow;
        Insert: Omit<InviteTokenRow, 'created_at' | 'used_at' | 'used_by'> & {
          created_at?: string;
          used_at?: string | null;
          used_by?: string | null;
        };
        Update: Partial<InviteTokenRow>;
        Relationships: EmptyRelationships;
      };
      verification_log: {
        Row: VerificationLogRow;
        Insert: Omit<VerificationLogRow, 'id' | 'decided_at'> & {
          id?: number;
          decided_at?: string;
        };
        Update: Partial<VerificationLogRow>;
        Relationships: EmptyRelationships;
      };
      cron_log: {
        Row: CronLogRow;
        Insert: Omit<CronLogRow, 'id' | 'ran_at'> & {
          id?: number;
          ran_at?: string;
        };
        Update: Partial<CronLogRow>;
        Relationships: EmptyRelationships;
      };
      resources: {
        Row: ResourceRow;
        Insert: Omit<
          ResourceRow,
          | 'id'
          | 'created_at'
          | 'status_changed_at'
          | 'status'
          | 'claimed_by'
          | 'category'
          | 'confirmed_at'
          | 'confirmed_by'
        > & {
          id?: string;
          created_at?: string;
          status_changed_at?: string;
          status?: ResourceStatus;
          claimed_by?: string | null;
          category?: ResourceCategory;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
        };
        Update: Partial<ResourceRow>;
        Relationships: EmptyRelationships;
      };
      config: {
        Row: ConfigRow;
        Insert: ConfigRow;
        Update: Partial<ConfigRow>;
        Relationships: EmptyRelationships;
      };
      push_tokens: {
        Row: PushTokenRow;
        Insert: Omit<PushTokenRow, 'id' | 'created_at' | 'last_used_at'> & {
          id?: string;
          created_at?: string;
          last_used_at?: string;
        };
        Update: Partial<PushTokenRow>;
        Relationships: EmptyRelationships;
      };
      error_reports: {
        Row: ErrorReportRow;
        Insert: Omit<ErrorReportRow, 'id' | 'created_at' | 'count' | 'last_seen_at'> & {
          id?: string;
          created_at?: string;
          count?: number;
          last_seen_at?: string;
        };
        Update: Partial<ErrorReportRow>;
        Relationships: EmptyRelationships;
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      consume_invite_token: {
        Args: { plain_token: string };
        Returns: boolean;
      };
      approve_user: {
        Args: { applicant_id: string };
        Returns: boolean;
      };
      reject_user: {
        Args: { applicant_id: string; reason?: string };
        Returns: boolean;
      };
      delete_my_account: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      claim_resource: {
        Args: { resource_id: string };
        Returns: boolean;
      };
      touch_my_last_active: {
        Args: Record<string, never>;
        Returns: void;
      };
      confirm_pickup: {
        Args: { p_resource_id: string };
        Returns: boolean;
      };
      complete_onboarding: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      register_push_token: {
        Args: { token: string; platform: string };
        Returns: boolean;
      };
      revoke_push_token: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      update_push_preferences: {
        Args: { prefs: PushPreferences };
        Returns: PushPreferences;
      };
      log_error: {
        Args: {
          p_app_version: string;
          p_platform: string;
          p_severity: string;
          p_message_hash: string;
          p_stack_hash: string;
        };
        Returns: boolean;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
