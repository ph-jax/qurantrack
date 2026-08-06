ALTER TABLE guardians ADD COLUMN preferred_locale TEXT CHECK (preferred_locale IS NULL OR preferred_locale IN ('en', 'tr'));
