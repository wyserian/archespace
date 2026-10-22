-- ============================================================
-- ArcheSpace - Security rule checks for schema.sql
-- ============================================================
--
-- Run in the Supabase SQL Editor of a TEST project, after schema.sql. Every
-- change happens inside one transaction that is rolled back at the end, so
-- nothing is left behind. A failed check stops with an error naming it;
-- success ends with "All security checks passed".
--
-- It signs in (by setting the request's JWT claims) as a throwaway user with
-- a verified authenticator, first with the password only (AAL1), where
-- two-factor-protected writes must be refused, then after the second factor
-- (AAL2), where they must work.
-- ============================================================

BEGIN;

-- A throwaway user with a verified authenticator and a vault.
INSERT INTO auth.users (id, email, aud, role)
VALUES ('00000000-0000-4000-8000-00000000a11c', 'rls-check@example.invalid', 'authenticated', 'authenticated');
INSERT INTO auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
VALUES (gen_random_uuid(), '00000000-0000-4000-8000-00000000a11c', 'rls-check', 'totp', 'verified', now(), now());
INSERT INTO user_encryption (user_id, salt, key_check, wrapped_key)
VALUES ('00000000-0000-4000-8000-00000000a11c', 'salt', 'check', 'wrapped');
INSERT INTO spaces (id, user_id, name, position)
VALUES ('00000000-0000-4000-8000-00000000a12c', '00000000-0000-4000-8000-00000000a11c', 'space', 0);

-- Password only (AAL1).
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000a11c","role":"authenticated","aal":"aal1"}', true);

DO $$
DECLARE n int;
BEGIN
  -- A backup code can't be added (it could be redeemed to remove 2FA).
  BEGIN
    INSERT INTO mfa_backup_codes (user_id, code_hash)
    VALUES ('00000000-0000-4000-8000-00000000a11c', 'x');
    RAISE EXCEPTION 'FAILED: AAL1 added a backup code';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- The vault can still be read (the vault-exists check) ...
  SELECT count(*) INTO n FROM user_encryption;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED: AAL1 could not read its vault row'; END IF;

  -- ... but not changed or deleted.
  UPDATE user_encryption SET wrapped_key = 'replaced';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED: AAL1 changed the vault row'; END IF;
  DELETE FROM user_encryption;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAILED: AAL1 deleted the vault row'; END IF;

  -- Reordering goes through the same rules: nothing moves.
  PERFORM update_space_positions('[{"id":"00000000-0000-4000-8000-00000000a12c","position":7}]');
  PERFORM 1 FROM spaces WHERE id = '00000000-0000-4000-8000-00000000a12c' AND position = 7;
  IF FOUND THEN RAISE EXCEPTION 'FAILED: AAL1 reordered a space'; END IF;

  -- The account can't be deleted.
  BEGIN
    PERFORM delete_current_user();
    RAISE EXCEPTION 'FAILED: AAL1 deleted the account';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAILED:%' THEN RAISE; END IF;
  END;
END $$;

-- After the second factor (AAL2) the same writes work.
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000a11c","role":"authenticated","aal":"aal2"}', true);

DO $$
DECLARE n int;
BEGIN
  INSERT INTO mfa_backup_codes (user_id, code_hash)
  VALUES ('00000000-0000-4000-8000-00000000a11c', 'x');
  UPDATE user_encryption SET wrapped_key = 'replaced';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAILED: AAL2 could not change the vault row'; END IF;
  PERFORM update_space_positions('[{"id":"00000000-0000-4000-8000-00000000a12c","position":7}]');
  PERFORM 1 FROM spaces WHERE id = '00000000-0000-4000-8000-00000000a12c' AND position = 7;
  IF NOT FOUND THEN RAISE EXCEPTION 'FAILED: AAL2 could not reorder a space'; END IF;
END $$;

ROLLBACK;

-- Only reached when every check above passed.
SELECT 'All security checks passed' AS result;
