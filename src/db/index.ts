import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.ts';

let sqlClient: ReturnType<typeof postgres> | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;
let dbStatus: 'unconfigured' | 'connected' | 'error' = 'unconfigured';
let dbLastError: string | null = null;

export async function initDatabase(): Promise<{
  connected: boolean;
  status: 'unconfigured' | 'connected' | 'error';
  error: string | null;
}> {
  const dbHost = process.env.DB_HOST?.trim();
  const dbPort = Number(process.env.DB_PORT?.trim() || '5432');
  const dbName = process.env.DB_NAME?.trim() || 'postgres';
  const dbUser = process.env.DB_USER?.trim();
  const dbPassword = process.env.DB_PASSWORD;
  const databaseUrl = process.env.DATABASE_URL?.trim();

  const hasSplitConfig = Boolean(dbHost && dbUser && dbPassword);
  if (!hasSplitConfig && !databaseUrl) {
    dbStatus = 'unconfigured';
    dbLastError = null;
    return { connected: false, status: dbStatus, error: null };
  }

  try {
    if (hasSplitConfig && dbHost && dbUser && dbPassword !== undefined) {
      const isLocal = dbHost === 'localhost' || dbHost === '127.0.0.1';
      sqlClient = postgres({
        host: dbHost,
        port: Number.isFinite(dbPort) && dbPort > 0 ? dbPort : 5432,
        database: dbName,
        username: dbUser,
        password: dbPassword,
        ssl: isLocal ? false : 'require',
        max: 10,
        idle_timeout: 20,
        connect_timeout: 8,
      });
    } else if (databaseUrl) {
      sqlClient = postgres(databaseUrl, {
        ssl:
          databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1')
            ? false
            : 'require',
        max: 10,
        idle_timeout: 20,
        connect_timeout: 8,
      });
    } else {
      return { connected: false, status: 'unconfigured', error: null };
    }

    // Idempotent schema bootstrap matching Drizzle schema
    await sqlClient.unsafe(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS models (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        filename TEXT NOT NULL,
        storage_path TEXT NOT NULL,
        format TEXT NOT NULL,
        task TEXT NOT NULL,
        class_names JSONB NOT NULL,
        input_shape JSONB NOT NULL,
        file_size_bytes INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS workflows (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft',
        is_locked BOOLEAN NOT NULL DEFAULT FALSE,
        definition JSONB NOT NULL,
        api_key TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      ALTER TABLE workflows ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE;

      CREATE TABLE IF NOT EXISTS streams (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        rtsp_url TEXT NOT NULL,
        source_type TEXT NOT NULL DEFAULT 'rtsp',
        sink_type TEXT NOT NULL DEFAULT 'mjpeg',
        sink_config JSONB NOT NULL DEFAULT '{}'::jsonb,
        status TEXT NOT NULL DEFAULT 'stopped',
        fps_target REAL NOT NULL DEFAULT 2,
        frames_processed INTEGER NOT NULL DEFAULT 0,
        last_frame_at TIMESTAMP,
        last_result JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS inference_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        source_type TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        detection_count INTEGER NOT NULL DEFAULT 0,
        result_summary JSONB NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS api_call_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        status_code INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL,
        auth_method TEXT NOT NULL DEFAULT 'anonymous',
        client_ip TEXT NOT NULL DEFAULT '',
        request_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
        response_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    dbInstance = drizzle(sqlClient, { schema });
    dbStatus = 'connected';
    dbLastError = null;
    return { connected: true, status: dbStatus, error: null };
  } catch (err) {
    dbStatus = 'error';
    dbLastError = err instanceof Error ? err.message : 'Database connection failed';
    console.warn('[VisionFlow DB] PostgreSQL unavailable, using in-memory store:', dbLastError);
    return { connected: false, status: dbStatus, error: dbLastError };
  }
}

export function getDb() {
  return dbInstance;
}

export function getDbStatus() {
  return { status: dbStatus, error: dbLastError };
}
