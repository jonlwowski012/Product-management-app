DROP TRIGGER IF EXISTS job_reactivation_capacity ON jobs;
CREATE TRIGGER job_reactivation_capacity
BEFORE UPDATE OF state ON jobs
FOR EACH ROW
WHEN (NEW.state IN ('queued','processing') AND OLD.state NOT IN ('queued','processing'))
EXECUTE FUNCTION enforce_account_capacity();
