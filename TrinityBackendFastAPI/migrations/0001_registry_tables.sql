-- Align registry_project schema with expected columns
ALTER TABLE IF EXISTS registry_project
    ADD COLUMN IF NOT EXISTS project_id BIGINT,
    ADD COLUMN IF NOT EXISTS user_id BIGINT,
    ADD COLUMN IF NOT EXISTS username TEXT,
    ADD COLUMN IF NOT EXISTS role TEXT,
    ADD COLUMN IF NOT EXISTS client_id BIGINT,
    ADD COLUMN IF NOT EXISTS client_name TEXT,
    ADD COLUMN IF NOT EXISTS app_id BIGINT,
    ADD COLUMN IF NOT EXISTS app_name TEXT,
    ADD COLUMN IF NOT EXISTS project_name TEXT,
    ADD COLUMN IF NOT EXISTS session_id TEXT,
    ADD COLUMN IF NOT EXISTS active_mode TEXT,
    ADD COLUMN IF NOT EXISTS minio_prefix TEXT,
    ADD COLUMN IF NOT EXISTS env_variables JSONB,
    ADD COLUMN IF NOT EXISTS tenant_schema_name TEXT,
    ADD COLUMN IF NOT EXISTS last_activity_ts TIMESTAMP;

-- Ensure project_id is unique for conflict handling
CREATE UNIQUE INDEX IF NOT EXISTS registry_project_project_id_idx
    ON registry_project(project_id);

-- Align registry_session schema with expected columns
ALTER TABLE IF EXISTS registry_session
    ADD COLUMN IF NOT EXISTS project_id BIGINT,
    ADD COLUMN IF NOT EXISTS user_id BIGINT,
    ADD COLUMN IF NOT EXISTS username TEXT,
    ADD COLUMN IF NOT EXISTS role TEXT,
    ADD COLUMN IF NOT EXISTS client_id BIGINT,
    ADD COLUMN IF NOT EXISTS client_name TEXT,
    ADD COLUMN IF NOT EXISTS app_id BIGINT,
    ADD COLUMN IF NOT EXISTS app_name TEXT,
    ADD COLUMN IF NOT EXISTS project_name TEXT,
    ADD COLUMN IF NOT EXISTS session_id TEXT,
    ADD COLUMN IF NOT EXISTS active_mode TEXT,
    ADD COLUMN IF NOT EXISTS minio_prefix TEXT,
    ADD COLUMN IF NOT EXISTS env_variables JSONB,
    ADD COLUMN IF NOT EXISTS tenant_schema_name TEXT,
    ADD COLUMN IF NOT EXISTS last_activity_ts TIMESTAMP;
