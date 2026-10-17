ALTER TABLE "organizations"
  ADD COLUMN "default_language" VARCHAR(5) NOT NULL DEFAULT 'pt-BR',
  ADD COLUMN "detect_browser_language" BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT "organizations_default_language_check"
    CHECK ("default_language" IN ('pt-BR', 'en', 'es'));
