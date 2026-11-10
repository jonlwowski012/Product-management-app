-- Account deletion removes both sides of owned relationships in one transaction.
DO $$
DECLARE fk record;
BEGIN
 FOR fk IN SELECT conrelid::regclass AS table_name,conname FROM pg_constraint
 WHERE contype='f' AND confdeltype='a' AND connamespace='public'::regnamespace
 LOOP
  EXECUTE format('ALTER TABLE %s ALTER CONSTRAINT %I DEFERRABLE INITIALLY IMMEDIATE',fk.table_name,fk.conname);
 END LOOP;
END $$;
