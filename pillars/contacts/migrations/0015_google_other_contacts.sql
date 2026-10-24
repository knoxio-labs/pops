ALTER TABLE provider_accounts ADD COLUMN google_other_contacts INTEGER NOT NULL DEFAULT 0 CHECK(google_other_contacts IN (0,1));
ALTER TABLE provider_oauth_states ADD COLUMN google_other_contacts INTEGER NOT NULL DEFAULT 0 CHECK(google_other_contacts IN (0,1));
