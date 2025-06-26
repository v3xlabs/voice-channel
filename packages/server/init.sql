-- Development PostgreSQL initialization script
-- This file is optional and only used if you need custom database setup

-- Create extensions that might be needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- You can add any other development-specific database setup here 