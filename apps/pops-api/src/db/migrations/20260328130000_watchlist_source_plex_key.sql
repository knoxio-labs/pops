-- Migration: 20260328130000_watchlist_source_plex_key.sql
-- Domain: media
-- Description: Add source and plex_rating_key columns to watchlist table
--   for Plex watchlist sync (PRD-059 US-01). Existing rows default to
--   source="manual". plex_rating_key stores the Plex ratingKey for synced items.
--
-- Rollback (manual):
--   ALTER TABLE watchlist DROP COLUMN source;
--   ALTER TABLE watchlist DROP COLUMN plex_rating_key;

ALTER TABLE watchlist ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE watchlist ADD COLUMN plex_rating_key TEXT;
