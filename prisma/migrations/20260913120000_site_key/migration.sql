-- Public site key for the customer script only. Not an admin credential.
ALTER TABLE "sites" ADD COLUMN "site_key" TEXT;
ALTER TABLE "sites" ADD COLUMN "key_active" BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX "sites_site_key_key" ON "sites"("site_key");
