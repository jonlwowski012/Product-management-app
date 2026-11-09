CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, email text UNIQUE NOT NULL, name text NOT NULL, password_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_attempts (identity text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS auth_attempts_identity ON auth_attempts(identity,created_at);
CREATE TABLE IF NOT EXISTS settings (
 user_id uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE, provider text NOT NULL DEFAULT 'openai',
 model text NOT NULL DEFAULT 'gpt-4.1-mini', validation_threshold integer NOT NULL DEFAULT 3 CHECK(validation_threshold BETWEEN 1 AND 100),
 openai_key text, anthropic_key text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS customers (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 name text NOT NULL, segment text NOT NULL DEFAULT 'Mid-Market', notes text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,user_id), UNIQUE(user_id,name)
);
CREATE TABLE IF NOT EXISTS products (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 name text NOT NULL, UNIQUE(id,user_id), UNIQUE(user_id,name)
);
CREATE TABLE IF NOT EXISTS transcripts (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 customer_id uuid NOT NULL, title text NOT NULL, filename text NOT NULL, sha256 text NOT NULL,
 raw_text text NOT NULL, segments jsonb NOT NULL, storage_path text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,user_id), UNIQUE(user_id,sha256),
 FOREIGN KEY(customer_id,user_id) REFERENCES customers(id,user_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS jobs (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 transcript_id uuid, brief_id uuid, purpose text NOT NULL CHECK(purpose IN ('extract','brief')),
 provider text NOT NULL, model text NOT NULL, prompt_version text NOT NULL DEFAULT '1', source_hash text,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','processing','succeeded','failed')),
 attempts integer NOT NULL DEFAULT 0, error text, usage jsonb, result jsonb,
 available_at timestamptz NOT NULL DEFAULT now(), locked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 FOREIGN KEY(transcript_id,user_id) REFERENCES transcripts(id,user_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_extraction ON jobs(transcript_id) WHERE purpose='extract' AND state IN ('queued','processing');
CREATE TABLE IF NOT EXISTS signals (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 customer_id uuid NOT NULL, transcript_id uuid NOT NULL,
 source_key text NOT NULL, title text NOT NULL, quote text NOT NULL, source_start integer, source_end integer,
 timestamp text, speaker text, verified boolean NOT NULL DEFAULT false, verification_reason text NOT NULL DEFAULT '',
 kind text NOT NULL DEFAULT 'gap' CHECK(kind IN ('gap','strength')), sentiment text NOT NULL DEFAULT 'neutral' CHECK(sentiment IN ('for','against','neutral')),
 tier integer NOT NULL DEFAULT 5 CHECK(tier BETWEEN 1 AND 5), commitments text[] NOT NULL DEFAULT '{}',
 stage text NOT NULL DEFAULT 'guess' CHECK(stage IN ('guess','signal')),
 review text NOT NULL DEFAULT 'pending' CHECK(review IN ('pending','approved','dismissed')),
 edited jsonb NOT NULL DEFAULT '{}', ai_proposal jsonb NOT NULL DEFAULT '{}', version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,user_id), UNIQUE(user_id,transcript_id,source_key),
 FOREIGN KEY(customer_id,user_id) REFERENCES customers(id,user_id),
 FOREIGN KEY(transcript_id,user_id) REFERENCES transcripts(id,user_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS features (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 title text NOT NULL, description text NOT NULL DEFAULT '', product_id uuid,
 stage text NOT NULL DEFAULT 'candidate' CHECK(stage IN ('candidate','feature')),
 problem_clear boolean NOT NULL DEFAULT false, validation_met boolean NOT NULL DEFAULT false, route_chosen boolean NOT NULL DEFAULT false,
 technical_route text NOT NULL DEFAULT '', version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,user_id),
 FOREIGN KEY(product_id,user_id) REFERENCES products(id,user_id)
);
CREATE TABLE IF NOT EXISTS feature_signals (
 user_id uuid NOT NULL, feature_id uuid NOT NULL, signal_id uuid NOT NULL,
 PRIMARY KEY(feature_id,signal_id), FOREIGN KEY(feature_id,user_id) REFERENCES features(id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(signal_id,user_id) REFERENCES signals(id,user_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS assessments (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 customer_id uuid NOT NULL, problem text NOT NULL, level integer CHECK(level BETWEEN 1 AND 5),
 suggested_level integer CHECK(suggested_level BETWEEN 1 AND 5), business_purpose text NOT NULL DEFAULT '',
 constraints text NOT NULL DEFAULT '', buying_authority text NOT NULL DEFAULT '',
 evidence_ids uuid[] NOT NULL DEFAULT '{}', confirmed boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,user_id), UNIQUE(user_id,customer_id,problem),
 FOREIGN KEY(customer_id,user_id) REFERENCES customers(id,user_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS briefs (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 title text NOT NULL, ask text NOT NULL DEFAULT '', problem text NOT NULL DEFAULT '', audience text NOT NULL DEFAULT '',
 capability text NOT NULL DEFAULT '', impact text NOT NULL DEFAULT '',
 options jsonb NOT NULL DEFAULT '[{"name":"Do nothing","effort":1,"time":"No build","risk":"Problem persists"},{"name":"Maintain current approach","effort":1,"time":"Ongoing","risk":"Existing limitations remain"}]',
 status text NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft','In Review','Approved','Shelved','Rejected')),
 review_date date, revisit_if text NOT NULL DEFAULT '', pinned boolean NOT NULL DEFAULT false, hidden boolean NOT NULL DEFAULT false,
 edited jsonb NOT NULL DEFAULT '{}', ai_proposal jsonb, version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,user_id)
);
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_brief_owner;
ALTER TABLE jobs ADD CONSTRAINT jobs_brief_owner FOREIGN KEY(brief_id,user_id) REFERENCES briefs(id,user_id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS one_active_brief_job ON jobs(brief_id) WHERE purpose='brief' AND state IN ('queued','processing');
CREATE TABLE IF NOT EXISTS brief_features (
 user_id uuid NOT NULL, brief_id uuid NOT NULL, feature_id uuid NOT NULL, PRIMARY KEY(brief_id,feature_id),
 FOREIGN KEY(brief_id,user_id) REFERENCES briefs(id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(feature_id,user_id) REFERENCES features(id,user_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS brief_signals (
 user_id uuid NOT NULL, brief_id uuid NOT NULL, signal_id uuid NOT NULL, PRIMARY KEY(brief_id,signal_id),
 FOREIGN KEY(brief_id,user_id) REFERENCES briefs(id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(signal_id,user_id) REFERENCES signals(id,user_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS stances (
 user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE, target_type text NOT NULL CHECK(target_type IN ('feature','brief')),
 target_id uuid NOT NULL, customer_id uuid NOT NULL, stance text NOT NULL CHECK(stance IN ('for','against','neutral')),
 PRIMARY KEY(user_id,target_type,target_id,customer_id), FOREIGN KEY(customer_id,user_id) REFERENCES customers(id,user_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS questions (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 brief_id uuid, question text NOT NULL, in_guide boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'Open' CHECK(status IN ('Open','Answered')), answer text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,user_id), UNIQUE(user_id,brief_id,question),
 FOREIGN KEY(brief_id,user_id) REFERENCES briefs(id,user_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS curation (
 user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE, target_type text NOT NULL, target_id uuid NOT NULL,
 pinned boolean NOT NULL DEFAULT false, hidden boolean NOT NULL DEFAULT false,
 PRIMARY KEY(user_id,target_type,target_id)
);
CREATE TABLE IF NOT EXISTS audit (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 action text NOT NULL, entity_type text NOT NULL, entity_id uuid, detail jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE VIEW verified_signals AS
 SELECT * FROM signals WHERE verified AND review='approved' AND stage='signal';
CREATE OR REPLACE VIEW qualifying_demand AS
 SELECT * FROM verified_signals WHERE kind='gap' AND sentiment='for' AND tier<=3;
CREATE INDEX IF NOT EXISTS signals_owner ON signals(user_id,review);
CREATE INDEX IF NOT EXISTS jobs_queue ON jobs(state,available_at);
CREATE INDEX IF NOT EXISTS audit_owner ON audit(user_id,created_at);
