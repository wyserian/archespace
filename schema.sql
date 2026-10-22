-- ============================================================
-- ArcheSpace - Database Schema (Supabase / PostgreSQL)
-- ============================================================
--
-- The complete schema. Run it in the Supabase SQL Editor to create every
-- table, index, function, trigger, RLS policy and realtime publication.
--
-- Safe to re-run: every statement uses IF NOT EXISTS / IF EXISTS guards, and
-- section 1b brings an existing database up to date.
-- ============================================================

-- 1. TABLES

-- Spaces: top-level containers owned by a single user.
CREATE TABLE IF NOT EXISTS spaces (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name        text        NOT NULL,
  description text        NOT NULL DEFAULT '',
  position    integer     NOT NULL DEFAULT 0,
  pinned      boolean     NOT NULL DEFAULT false,
  color       text        DEFAULT NULL,
  tags        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  parent_id   uuid        REFERENCES spaces(id) ON DELETE CASCADE DEFAULT NULL,  -- nests to any depth; NULL = top-level
  starred     boolean     NOT NULL DEFAULT false, -- in the Starred view; never affects ordering
  locked      boolean     NOT NULL DEFAULT false, -- Protect: the content needs the vault PIN again
  read_only   boolean     NOT NULL DEFAULT false, -- enforced by trg_spaces_read_only (section 3)
  deleted_at  timestamptz DEFAULT NULL,          -- soft-delete; NULL = active
  archived_at timestamptz DEFAULT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Space Items: individual content blocks inside a space, or on the dashboard
-- when space_id is NULL (a top-level item that belongs to no space).
CREATE TABLE IF NOT EXISTS space_items (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  space_id    uuid        REFERENCES spaces(id) ON DELETE CASCADE,
  user_id     uuid        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type        text        NOT NULL CHECK (type IN ('textbox', 'checkbox_list', 'menu_list', 'numbered_list', 'card_list', 'richtext', 'code', 'whiteboard', 'table', 'kanban')),
  title       text        NOT NULL DEFAULT '',
  content     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  tags        jsonb       NOT NULL DEFAULT '[]'::jsonb,   -- encrypted client-side
  reminder    jsonb       DEFAULT NULL,  -- encrypted client-side; NULL = none
  position    integer     NOT NULL DEFAULT 0,
  pinned      boolean     NOT NULL DEFAULT false,
  starred     boolean     NOT NULL DEFAULT false,
  locked      boolean     NOT NULL DEFAULT false, -- Protect
  deleted_at  timestamptz DEFAULT NULL,
  archived_at timestamptz DEFAULT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Audit log: auth events only, owner-only access (see section 4).
CREATE TABLE IF NOT EXISTS audit_log (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  action     text        NOT NULL,
  details    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- User Encryption: the vault's Argon2id salts, the PIN- and recovery-wrapped
-- master key and a verifier, never the raw key.
CREATE TABLE IF NOT EXISTS user_encryption (
  user_id              uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  salt                 text        NOT NULL,
  key_check            text        NOT NULL,
  wrapped_key          text        DEFAULT NULL,
  recovery_salt        text        DEFAULT NULL,
  recovery_wrapped_key text        DEFAULT NULL,
  pin_failed_attempts  integer     NOT NULL DEFAULT 0,
  pin_locked_until     timestamptz DEFAULT NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- Passkey / biometric unlock stores its wrapped master key locally on each
-- client (the browser's IndexedDB on web, the OS keystore on mobile), never on
-- the server, so there is no passkey table here.

-- User Settings: per-user application preferences.
CREATE TABLE IF NOT EXISTS user_settings (
  user_id      uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme_mode   text        NOT NULL DEFAULT 'system' CHECK (theme_mode IN ('system', 'dark', 'light')),
  accent_color text        NOT NULL DEFAULT 'mint'   CHECK (accent_color IN ('mint', 'lavender', 'amber', 'sky', 'rose')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- User Consent: proof that a user agreed to the Terms + Privacy Policy at
-- sign-up (GDPR/DPDP audit trail). Written ONLY by the log_auth_event trigger
-- (section 10), never by clients - the row records the policy version the
-- client reported and a server-stamped acceptance time, so it can't be forged
-- or back-dated. terms_version matches src/lib/legal.js TERMS_VERSION.
CREATE TABLE IF NOT EXISTS user_consent (
  user_id           uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  terms_version     text        NOT NULL,
  terms_accepted_at timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- 1b. UPDATES FOR EXISTING DATABASES

-- The allowed item types. 'secret', 'markdown' and 'authenticator' were
-- removed: after unlock, the apps turn secrets into Notes and Markdown notes
-- into Rich text (only a device can open the content). A removed type that
-- still has items is kept, with a notice, until they're gone - re-run this file
-- later to finish. 'draw' was renamed 'whiteboard' (the apps convert an old
-- drawing's content when it opens).
DO $$
DECLARE
  allowed text[] := ARRAY['textbox', 'checkbox_list', 'menu_list', 'numbered_list',
                          'card_list', 'richtext', 'code', 'whiteboard', 'table', 'kanban'];
  old text;
  left_count int;
BEGIN
  ALTER TABLE space_items DROP CONSTRAINT IF EXISTS space_items_type_check;
  IF EXISTS (SELECT 1 FROM space_items WHERE type = 'draw') THEN
    -- A rename, not an edit: allowed in read-only spaces, and updated_at
    -- stays as it was.
    ALTER TABLE space_items DISABLE TRIGGER USER;
    UPDATE space_items SET type = 'whiteboard' WHERE type = 'draw';
    ALTER TABLE space_items ENABLE TRIGGER USER;
  END IF;
  FOREACH old IN ARRAY ARRAY['secret', 'markdown', 'authenticator'] LOOP
    SELECT count(*) INTO left_count FROM space_items WHERE type = old;
    IF left_count > 0 THEN
      allowed := allowed || old;
      RAISE NOTICE '% kept: % item(s) still to convert', old, left_count;
    END IF;
  END LOOP;
  EXECUTE format(
    'ALTER TABLE space_items ADD CONSTRAINT space_items_type_check CHECK (type = ANY (%L::text[]))',
    allowed
  );
END $$;

-- Every accent the apps offer.
ALTER TABLE user_settings DROP CONSTRAINT IF EXISTS user_settings_accent_color_check;
ALTER TABLE user_settings ADD CONSTRAINT user_settings_accent_color_check
  CHECK (accent_color IN ('mint', 'lavender', 'amber', 'sky', 'rose'));

-- Vaults have no format marker (every vault is PIN-wrapped): drop the column
-- where an older database still has it.
ALTER TABLE user_encryption DROP COLUMN IF EXISTS vault_format;

-- Item reminders (encrypted; the server only sees that one is set).
ALTER TABLE space_items ADD COLUMN IF NOT EXISTS reminder jsonb DEFAULT NULL;

-- 2. INDEXES

-- Spaces
CREATE INDEX IF NOT EXISTS spaces_user_id_idx     ON spaces(user_id);
CREATE INDEX IF NOT EXISTS spaces_parent_id_idx   ON spaces(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS spaces_position_idx    ON spaces(user_id, position);
CREATE INDEX IF NOT EXISTS spaces_pinned_idx      ON spaces(pinned)      WHERE pinned = true;
CREATE INDEX IF NOT EXISTS spaces_deleted_at_idx  ON spaces(deleted_at)  WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS spaces_archived_at_idx ON spaces(archived_at) WHERE archived_at IS NOT NULL;

-- Space items
CREATE INDEX IF NOT EXISTS items_space_id_idx     ON space_items(space_id);
CREATE INDEX IF NOT EXISTS items_user_id_idx      ON space_items(user_id);
CREATE INDEX IF NOT EXISTS items_position_idx     ON space_items(space_id, position);
-- Dashboard items (no space), listed per user in position order.
CREATE INDEX IF NOT EXISTS items_top_level_idx    ON space_items(user_id, position) WHERE space_id IS NULL;
-- Starred view: the user's starred spaces and items.
CREATE INDEX IF NOT EXISTS spaces_starred_idx     ON spaces(user_id)      WHERE starred = true;
CREATE INDEX IF NOT EXISTS items_starred_idx      ON space_items(user_id) WHERE starred = true;
-- Reminders view: the user's items with a reminder.
CREATE INDEX IF NOT EXISTS items_reminder_idx     ON space_items(user_id) WHERE reminder IS NOT NULL;
CREATE INDEX IF NOT EXISTS space_items_pinned_idx ON space_items(pinned)      WHERE pinned = true;
CREATE INDEX IF NOT EXISTS items_deleted_at_idx   ON space_items(deleted_at)  WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS items_archived_at_idx  ON space_items(archived_at) WHERE archived_at IS NOT NULL;

-- Audit log
CREATE INDEX IF NOT EXISTS audit_log_user_id_idx       ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx    ON audit_log(created_at);

-- 3. TRIGGERS & FUNCTIONS

-- Auto-update updated_at on every row change.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_spaces_updated_at ON spaces;
CREATE TRIGGER trg_spaces_updated_at
  BEFORE UPDATE ON spaces
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_space_items_updated_at ON space_items;
CREATE TRIGGER trg_space_items_updated_at
  BEFORE UPDATE ON space_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_user_settings_updated_at ON user_settings;
CREATE TRIGGER trg_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-populate user_id on space_items from the parent space, or from the
-- signed-in user for a dashboard item (no space).
CREATE OR REPLACE FUNCTION populate_item_user_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NULL AND NEW.space_id IS NOT NULL THEN
    SELECT user_id INTO NEW.user_id FROM spaces WHERE id = NEW.space_id;
  END IF;
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_populate_item_user_id ON space_items;
CREATE TRIGGER trg_populate_item_user_id
  BEFORE INSERT ON space_items
  FOR EACH ROW EXECUTE FUNCTION populate_item_user_id();

-- Read-only spaces. A read-only space's details (name, description, colour,
-- tags, parent) and its items' content (title, content, tags, type) can't
-- change, and items can't be added to or moved in or out of it. Starring,
-- pinning, ordering, archiving and deleting stay allowed, so archiving or
-- deleting the space (which cascades to its items) still works. Raises
-- SQLSTATE P0R01, which clients recognise (src/lib/readOnly.js).
CREATE OR REPLACE FUNCTION is_space_read_only(sid uuid)
RETURNS boolean AS $$
  SELECT COALESCE((SELECT read_only FROM spaces WHERE id = sid), false);
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION guard_read_only_space()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.read_only AND NEW.read_only AND (
       NEW.name        IS DISTINCT FROM OLD.name
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.color       IS DISTINCT FROM OLD.color
    OR NEW.tags        IS DISTINCT FROM OLD.tags
    OR NEW.parent_id   IS DISTINCT FROM OLD.parent_id
  ) THEN
    RAISE EXCEPTION 'This space is read-only.' USING ERRCODE = 'P0R01';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_spaces_read_only ON spaces;
CREATE TRIGGER trg_spaces_read_only
  BEFORE UPDATE ON spaces
  FOR EACH ROW EXECUTE FUNCTION guard_read_only_space();

CREATE OR REPLACE FUNCTION guard_read_only_items()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Also catches upserts, whose insert attempt fires this first.
    IF is_space_read_only(NEW.space_id) THEN
      RAISE EXCEPTION 'This space is read-only.' USING ERRCODE = 'P0R01';
    END IF;
  ELSIF NEW.space_id IS DISTINCT FROM OLD.space_id THEN
    IF is_space_read_only(OLD.space_id) OR is_space_read_only(NEW.space_id) THEN
      RAISE EXCEPTION 'This space is read-only.' USING ERRCODE = 'P0R01';
    END IF;
  ELSIF (NEW.title   IS DISTINCT FROM OLD.title
      OR NEW.content IS DISTINCT FROM OLD.content
      OR NEW.tags    IS DISTINCT FROM OLD.tags
      OR NEW.type    IS DISTINCT FROM OLD.type)
    AND is_space_read_only(NEW.space_id) THEN
    RAISE EXCEPTION 'This space is read-only.' USING ERRCODE = 'P0R01';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_space_items_read_only ON space_items;
CREATE TRIGGER trg_space_items_read_only
  BEFORE INSERT OR UPDATE ON space_items
  FOR EACH ROW EXECUTE FUNCTION guard_read_only_items();

-- Space nesting. A space's parent is another of the same user's spaces, never
-- the space itself or one of its own sub-spaces (that would make a loop).
CREATE OR REPLACE FUNCTION guard_space_parent()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM spaces WHERE id = NEW.parent_id AND user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'The parent space was not found.';
  END IF;
  IF EXISTS (
    WITH RECURSIVE up(id, parent_id) AS (
      SELECT id, parent_id FROM spaces WHERE id = NEW.parent_id
      UNION
      SELECT s.id, s.parent_id FROM spaces s JOIN up ON s.id = up.parent_id
    )
    SELECT 1 FROM up WHERE id = NEW.id
  ) THEN
    RAISE EXCEPTION 'A space can''t move inside itself.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_spaces_parent ON spaces;
CREATE TRIGGER trg_spaces_parent
  BEFORE INSERT OR UPDATE OF parent_id ON spaces
  FOR EACH ROW EXECUTE FUNCTION guard_space_parent();

-- The recycle bin is never emptied automatically: only a permanent delete by
-- the user removes anything. Drop any 30-day purge function, and its pg_cron
-- job if one is set up.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE command ILIKE '%purge_old_deleted_records%';
  END IF;
END $$;
DROP FUNCTION IF EXISTS purge_old_deleted_records();

-- 4. ROW LEVEL SECURITY (RLS)

ALTER TABLE spaces          ENABLE ROW LEVEL SECURITY;
ALTER TABLE space_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_encryption ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_consent    ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE user_encryption TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE user_settings   TO authenticated;
-- Consent is read-only to clients: only the log_auth_event trigger writes it.
-- No INSERT/UPDATE/DELETE grant means a user can read their own consent record
-- but cannot create, alter, or back-date it.
GRANT SELECT ON TABLE user_consent TO authenticated;

-- Spaces: full CRUD for the owning user only.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'spaces' AND policyname = 'Users can manage their own spaces') THEN
    CREATE POLICY "Users can manage their own spaces"
      ON spaces FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Space items: full CRUD for the owning user only.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'space_items' AND policyname = 'Users can manage their own items') THEN
    CREATE POLICY "Users can manage their own items"
      ON space_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- User encryption metadata: full CRUD for the owning user only.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_encryption' AND policyname = 'Users manage own encryption metadata') THEN
    CREATE POLICY "Users manage own encryption metadata"
      ON user_encryption FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- User settings: full CRUD for the owning user only.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_settings' AND policyname = 'Users manage own settings') THEN
    CREATE POLICY "Users manage own settings"
      ON user_settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- User consent: read-only for the owning user (writes happen only in the
-- SECURITY DEFINER trigger, which bypasses RLS). SELECT-only policy.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_consent' AND policyname = 'Users can read own consent') THEN
    CREATE POLICY "Users can read own consent"
      ON user_consent FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- audit_log: no policies + grants revoked = owner / service_role only.
REVOKE ALL ON TABLE audit_log FROM anon, authenticated;

-- 4b. TWO-FACTOR AUTH (MFA): backup code + AAL2 enforcement
-- The TOTP factor itself lives in Supabase's auth.mfa_factors (managed by the
-- auth.mfa.* client API). This section adds a recoverable one-time backup code
-- and enforces 2FA at BOTH layers: the app's login gate requires the TOTP
-- challenge after the password, and the policies below require AAL2 at the
-- database once a verified factor exists.
--
-- IMPORTANT: reading user_encryption is deliberately NOT gated. Gating it made
-- an RLS-filtered read look like "no vault", which could send a signed-in user
-- to vault setup and overwrite their key. The row is only wrapped ciphertext
-- and public salts (useless without the vault PIN), so leaving it readable at
-- AAL1 costs nothing and keeps the vault-exists check reliable. Writing it is
-- gated below, as are the content tables (spaces, space_items).

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Backup codes: only the SHA-256 hash is stored; the plaintext is shown once at
-- enrolment (12-char codes, same format/normalisation as vault recovery codes).
CREATE TABLE IF NOT EXISTS mfa_backup_codes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash  text NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mfa_backup_codes_user_idx ON mfa_backup_codes (user_id);
ALTER TABLE mfa_backup_codes ENABLE ROW LEVEL SECURITY;

-- Users can create / list / delete their own codes (enrol, regenerate, count
-- remaining). UPDATE is intentionally NOT granted, so nobody can mark a code
-- used except the SECURITY DEFINER redeem function below.
GRANT SELECT, INSERT, DELETE ON TABLE mfa_backup_codes TO authenticated;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mfa_backup_codes' AND policyname = 'Users manage own backup codes') THEN
    CREATE POLICY "Users manage own backup codes"
      ON mfa_backup_codes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Redeem a backup code from an AAL1 session (password done, authenticator lost):
-- match the hash against the caller's unused codes; on a hit, mark it used and
-- delete the caller's verified MFA factors so they can sign in and re-enrol.
-- SECURITY DEFINER to touch auth.mfa_factors, but it only ever acts on auth.uid().
CREATE OR REPLACE FUNCTION redeem_mfa_backup_code(code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  uid uuid := auth.uid();
  target_id uuid;
  hashed text := encode(
    digest(lower(regexp_replace(code, '[^a-z0-9]', '', 'gi')), 'sha256'),
    'hex'
  );
BEGIN
  IF uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT id INTO target_id
  FROM mfa_backup_codes
  WHERE user_id = uid AND used_at IS NULL AND code_hash = hashed
  LIMIT 1;

  IF target_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE mfa_backup_codes SET used_at = now() WHERE id = target_id;
  DELETE FROM auth.mfa_factors WHERE user_id = uid AND status = 'verified';
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION redeem_mfa_backup_code(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION redeem_mfa_backup_code(text) TO authenticated;

-- The `authenticated` role has no SELECT on auth.mfa_factors, so an RLS policy
-- can't read that table directly (it runs as the caller). This SECURITY DEFINER
-- helper checks it with elevated rights, scoped to the caller's own factors.
CREATE OR REPLACE FUNCTION public.has_verified_mfa()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = auth, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.mfa_factors
    WHERE user_id = auth.uid() AND status = 'verified'
  );
$$;
REVOKE ALL ON FUNCTION public.has_verified_mfa() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.has_verified_mfa() TO authenticated;

-- Require AAL2 for the encrypted content once a verified MFA factor exists.
-- Users with no factor are unaffected (aal1 allowed). Restrictive => ANDs with
-- the ownership policies above. spaces + space_items are gated in full - that
-- is the actual content. user_settings is trivial prefs and stays open, as do
-- reads of user_encryption (the vault-exists trap above); its writes are gated
-- after this block. Re-runnable: drops then recreates.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['spaces','space_items'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Require aal2 when MFA enrolled" ON %I', t);
    EXECUTE format($f$
      CREATE POLICY "Require aal2 when MFA enrolled" ON %I
        AS RESTRICTIVE FOR ALL TO authenticated
        USING (
          (SELECT auth.jwt()->>'aal') = 'aal2'
          OR NOT public.has_verified_mfa()
        )
        WITH CHECK (
          (SELECT auth.jwt()->>'aal') = 'aal2'
          OR NOT public.has_verified_mfa()
        )
    $f$, t);
  END LOOP;
END $$;

-- The same for adding or removing backup codes: otherwise a password alone
-- (AAL1) could add a code of its own and redeem it, removing the second
-- factor. Listing stays open (the count shows at sign-in), and redeeming goes
-- through redeem_mfa_backup_code.
DROP POLICY IF EXISTS "Require aal2 to add backup codes" ON mfa_backup_codes;
CREATE POLICY "Require aal2 to add backup codes" ON mfa_backup_codes
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.jwt()->>'aal') = 'aal2' OR NOT public.has_verified_mfa());
DROP POLICY IF EXISTS "Require aal2 to remove backup codes" ON mfa_backup_codes;
CREATE POLICY "Require aal2 to remove backup codes" ON mfa_backup_codes
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((SELECT auth.jwt()->>'aal') = 'aal2' OR NOT public.has_verified_mfa());

-- And for changing the vault row: reading it stays open (see above), but a
-- password alone must not replace or delete the wrapped key, which would leave
-- every item unreadable for good.
DROP POLICY IF EXISTS "Require aal2 to add the vault" ON user_encryption;
CREATE POLICY "Require aal2 to add the vault" ON user_encryption
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.jwt()->>'aal') = 'aal2' OR NOT public.has_verified_mfa());
DROP POLICY IF EXISTS "Require aal2 to change the vault" ON user_encryption;
CREATE POLICY "Require aal2 to change the vault" ON user_encryption
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((SELECT auth.jwt()->>'aal') = 'aal2' OR NOT public.has_verified_mfa());
DROP POLICY IF EXISTS "Require aal2 to delete the vault" ON user_encryption;
CREATE POLICY "Require aal2 to delete the vault" ON user_encryption
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((SELECT auth.jwt()->>'aal') = 'aal2' OR NOT public.has_verified_mfa());

-- 5. REALTIME

DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime;
ALTER PUBLICATION supabase_realtime ADD TABLE spaces;
ALTER PUBLICATION supabase_realtime ADD TABLE space_items;

-- 6. RPC FUNCTIONS FOR BULK UPDATES

-- Bulk-update space positions. Runs as the caller, so the row rules
-- (ownership, two-factor) apply as to any other write.
CREATE OR REPLACE FUNCTION update_space_positions(updates jsonb)
RETURNS void AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM jsonb_to_recordset(updates) AS x(id uuid, position integer) LOOP
    UPDATE spaces SET position = r.position WHERE id = r.id AND user_id = auth.uid();
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- Bulk-update item positions, also as the caller.
CREATE OR REPLACE FUNCTION update_item_positions(updates jsonb)
RETURNS void AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM jsonb_to_recordset(updates) AS x(id uuid, position integer) LOOP
    UPDATE space_items SET position = r.position WHERE id = r.id AND user_id = auth.uid();
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- 7. VAULT PIN BRUTE-FORCE PROTECTION
-- (pin_failed_attempts / pin_locked_until are on user_encryption, section 1)

CREATE OR REPLACE FUNCTION get_vault_pin_lock_status()
RETURNS jsonb AS $$
DECLARE
  v_locked_until timestamptz;
  v_retry_after  integer;
BEGIN
  SELECT pin_locked_until INTO v_locked_until FROM user_encryption WHERE user_id = auth.uid();
  IF NOT FOUND OR v_locked_until IS NULL OR v_locked_until <= now() THEN
    RETURN jsonb_build_object('locked', false, 'retry_after_seconds', 0);
  END IF;
  v_retry_after := GREATEST(0, EXTRACT(EPOCH FROM (v_locked_until - now()))::integer);
  RETURN jsonb_build_object('locked', true, 'retry_after_seconds', v_retry_after);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION record_vault_pin_unlock_failure()
RETURNS void AS $$
DECLARE
  v_max_attempts constant integer := 5;
  v_lock_minutes constant integer := 5;
  v_attempts     integer;
  v_locked_until timestamptz;
BEGIN
  SELECT pin_failed_attempts, pin_locked_until
    INTO v_attempts, v_locked_until
  FROM user_encryption WHERE user_id = auth.uid();

  IF NOT FOUND THEN RETURN; END IF;

  -- A previous lock has fully expired: start a fresh count so the user
  -- gets another full set of attempts rather than re-locking on every try.
  IF v_locked_until IS NOT NULL AND v_locked_until <= now() THEN
    v_attempts := 0;
  END IF;

  v_attempts := v_attempts + 1;

  UPDATE user_encryption
  SET pin_failed_attempts = v_attempts,
      pin_locked_until = CASE
        WHEN v_attempts >= v_max_attempts THEN now() + (v_lock_minutes || ' minutes')::interval
        ELSE NULL
      END
  WHERE user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION record_vault_pin_unlock_success()
RETURNS void AS $$
BEGIN
  UPDATE user_encryption SET pin_failed_attempts = 0, pin_locked_until = NULL WHERE user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL   ON FUNCTION get_vault_pin_lock_status()          FROM PUBLIC;
REVOKE ALL   ON FUNCTION record_vault_pin_unlock_failure()    FROM PUBLIC;
REVOKE ALL   ON FUNCTION record_vault_pin_unlock_success()    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_vault_pin_lock_status()         TO authenticated;
GRANT EXECUTE ON FUNCTION record_vault_pin_unlock_failure()   TO authenticated;
GRANT EXECUTE ON FUNCTION record_vault_pin_unlock_success()   TO authenticated;

-- 8. ACCOUNT DELETION

CREATE OR REPLACE FUNCTION delete_current_user()
RETURNS void AS $$
DECLARE v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  -- With two-factor on, a password alone can't delete the account.
  IF public.has_verified_mfa() AND (SELECT auth.jwt()->>'aal') IS DISTINCT FROM 'aal2' THEN
    RAISE EXCEPTION 'Complete two-factor sign-in before deleting your account.';
  END IF;
  DELETE FROM auth.users WHERE id = v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

REVOKE ALL   ON FUNCTION delete_current_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_current_user() TO authenticated;

-- 9. ACCOUNT-DELETION EMAIL (Resend)
-- RESEND_API_KEY stays ENCRYPTED in Supabase Vault; sent server-side inside a Postgres trigger via pg_net (async HTTP), never exposed to the client.
-- One-time setup:
-- 1) enable pg_net (statement or Dashboard -> Extensions)
-- 2) add the secret via Dashboard > Vault or run this once in the SQL editor: vault.create_secret('re_your_key','RESEND_API_KEY')
-- 3) verify sending domain in Resend

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.notify_account_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_api_key text;
  v_from    text := 'ArcheSpace <support@archespace.app>';  -- verified Resend domain
  v_subject text := 'Your ArcheSpace account has been deleted';
  v_support text := 'support@archespace.app';                 -- reply-to / support
  v_html    text;
  v_text    text;
BEGIN
  -- User row is already gone; keep identity in details.
  INSERT INTO public.audit_log (user_id, action, details)
  VALUES (NULL, 'account_deleted',
          jsonb_build_object('user_id', OLD.id, 'email', OLD.email, 'deleted_at', now()));

  -- Nothing to send to if the row had no email.
  IF OLD.email IS NULL THEN
    RETURN OLD;
  END IF;

  -- Read the key straight from Vault (decrypted only for the
  -- SECURITY DEFINER owner; never exposed to clients).
  SELECT decrypted_secret INTO v_api_key FROM vault.decrypted_secrets WHERE name = 'RESEND_API_KEY';
  IF v_api_key IS NULL THEN
    RAISE WARNING 'RESEND_API_KEY missing from Vault; deletion email skipped';
    RETURN OLD;
  END IF;

  v_html :=
    $html$<div style="margin:0;padding:0;width:100%;background-color:#0f1115;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="padding:64px 40px;">
    <p style="margin:0;font-size:24px;line-height:1.2;font-weight:700;letter-spacing:0.03em;color:#32d3aa;">ARCHE<span style="color:#ffffff;">SPACE</span></p>
    <h1 style="margin:28px 0 18px;font-size:30px;line-height:1.2;font-weight:700;color:#ffffff;">Sorry to see you go</h1>
    <p style="margin:0 0 18px;max-width:560px;font-size:16px;line-height:1.65;color:#c4cad6;">Your ArcheSpace account <strong style="color:#ffffff;">$html$ || OLD.email || $html$</strong> has been permanently deleted, along with all of your spaces, items, and encrypted vault data. This is just a confirmation, so there's nothing left for you to do.</p>
    <p style="margin:0 0 40px;max-width:560px;font-size:16px;line-height:1.65;color:#c4cad6;">Thank you for giving ArcheSpace a try. If you ever change your mind, you're always welcome back.</p>
    <div style="height:1px;width:100%;max-width:560px;background-color:#262b36;margin:0 0 24px;"></div>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#8b93a3;">Need help, or didn't request this? Contact us at <a href="mailto:$html$ || v_support || $html$" style="color:#7fe3c0;text-decoration:none;">$html$ || v_support || $html$</a>.</p>
  </div>
</div>$html$;

  -- Plaintext fallback (improves deliverability and covers clients
  -- that don't render HTML).
  v_text :=
    'Sorry to see you go' || E'\n\n'
    || 'Your ArcheSpace account ' || OLD.email || ' has been permanently deleted, '
    || 'along with all of your spaces, items, and encrypted vault data. '
    || 'This is just a confirmation, so there is nothing left for you to do.' || E'\n\n'
    || 'Thank you for giving ArcheSpace a try. If you ever change your mind, you are '
    || 'always welcome back.' || E'\n\n'
    || 'Need help, or did not request this? Contact us at ' || v_support || '.';

  -- Fire-and-forget async POST to Resend.
  PERFORM net.http_post(
    url     => 'https://api.resend.com/emails',
    headers => jsonb_build_object('Authorization', 'Bearer ' || v_api_key, 'Content-Type', 'application/json'),
    body    => jsonb_build_object('from', v_from, 'to', OLD.email, 'reply_to', v_support,
                                  'subject', v_subject, 'html', v_html, 'text', v_text)
  );

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_account_deleted ON auth.users;
CREATE TRIGGER trg_notify_account_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.notify_account_deleted();

-- 10. AUTH AUDIT LOGGING (auth events only, owner-only table)

-- Server-side: account_created, email_change, password_reset_requested
--   (account_deleted is written in section 9). Client-side via
--   log_client_event: the actions listed in that function.

CREATE OR REPLACE FUNCTION public.log_auth_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (user_id, action, details)
    VALUES (NEW.id, 'account_created', jsonb_build_object(
      'email', NEW.email,
      'terms_version', NEW.raw_user_meta_data->>'terms_version',
      'terms_accepted_at_client', NEW.raw_user_meta_data->>'terms_accepted_at'
    ));

    -- Record consent proof when the sign-up client reported a policy version.
    -- terms_accepted_at is stamped server-side (now()), so it is authoritative
    -- and cannot be back-dated; the client's own timestamp is kept in the audit
    -- entry above for reference only. Skipped for accounts created without a
    -- version (e.g. admin-created users).
    IF NEW.raw_user_meta_data ? 'terms_version'
       AND coalesce(NEW.raw_user_meta_data->>'terms_version', '') <> '' THEN
      INSERT INTO user_consent (user_id, terms_version, terms_accepted_at)
      VALUES (NEW.id, NEW.raw_user_meta_data->>'terms_version', now())
      ON CONFLICT (user_id) DO NOTHING;
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.email IS DISTINCT FROM OLD.email THEN
    INSERT INTO audit_log (user_id, action, details)
    VALUES (NEW.id, 'email_change', jsonb_build_object('from', OLD.email, 'to', NEW.email));
  ELSIF NEW.recovery_sent_at IS DISTINCT FROM OLD.recovery_sent_at AND NEW.recovery_sent_at IS NOT NULL THEN
    INSERT INTO audit_log (user_id, action)
    VALUES (NEW.id, 'password_reset_requested');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_auth_event ON auth.users;
CREATE TRIGGER trg_log_auth_event
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.log_auth_event();

-- Whitelisted client-side audit writes, for the current user only.
CREATE OR REPLACE FUNCTION public.log_client_event(
  p_action  text,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_action NOT IN (
    'login', 'logout',
    'password_change', 'password_reset',
    'vault_setup', 'vault_unlock', 'vault_lock', 'vault_reset',
    'vault_pin_change', 'vault_pin_reset', 'recovery_code_created',
    'vault_passkey_enroll', 'vault_passkey_remove',
    'export', 'import'
  ) THEN
    RAISE EXCEPTION 'Unsupported audit action: %', p_action;
  END IF;

  INSERT INTO audit_log (user_id, action, details)
  VALUES (auth.uid(), p_action, coalesce(p_details, '{}'::jsonb));
END;
$$;

REVOKE ALL   ON FUNCTION public.log_client_event(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_client_event(text, jsonb) TO authenticated;
