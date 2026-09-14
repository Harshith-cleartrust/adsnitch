-- CreateEnum
CREATE TYPE "public"."MemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "public"."RuleType" AS ENUM ('URL', 'DOMAIN', 'KEYWORD', 'CATEGORY');

-- CreateTable
CREATE TABLE "public"."organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."organization_members" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "public"."MemberRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."sites" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "policy_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."policies" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."blocked_urls" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blocked_urls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."blocked_domains" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blocked_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."blocked_keywords" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blocked_keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."policy_categories" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policy_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."block_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "matched_rule_type" "public"."RuleType" NOT NULL,
    "matched_rule_id" TEXT,
    "matched_url" TEXT,
    "matched_domain" TEXT,
    "matched_keyword" TEXT,
    "matched_category" TEXT,
    "page_load_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "block_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE INDEX "organization_members_organization_id_idx" ON "public"."organization_members"("organization_id");

-- CreateIndex
CREATE INDEX "organization_members_user_id_idx" ON "public"."organization_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_organization_id_user_id_key" ON "public"."organization_members"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "sites_organization_id_idx" ON "public"."sites"("organization_id");

-- CreateIndex
CREATE INDEX "sites_policy_id_idx" ON "public"."sites"("policy_id");

-- CreateIndex
CREATE UNIQUE INDEX "sites_organization_id_domain_key" ON "public"."sites"("organization_id", "domain");

-- CreateIndex
CREATE INDEX "policies_organization_id_idx" ON "public"."policies"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "policies_organization_id_name_key" ON "public"."policies"("organization_id", "name");

-- CreateIndex
CREATE INDEX "blocked_urls_policy_id_idx" ON "public"."blocked_urls"("policy_id");

-- CreateIndex
CREATE UNIQUE INDEX "blocked_urls_policy_id_url_key" ON "public"."blocked_urls"("policy_id", "url");

-- CreateIndex
CREATE INDEX "blocked_domains_policy_id_idx" ON "public"."blocked_domains"("policy_id");

-- CreateIndex
CREATE UNIQUE INDEX "blocked_domains_policy_id_domain_key" ON "public"."blocked_domains"("policy_id", "domain");

-- CreateIndex
CREATE INDEX "blocked_keywords_policy_id_idx" ON "public"."blocked_keywords"("policy_id");

-- CreateIndex
CREATE UNIQUE INDEX "blocked_keywords_policy_id_keyword_language_key" ON "public"."blocked_keywords"("policy_id", "keyword", "language");

-- CreateIndex
CREATE INDEX "policy_categories_policy_id_idx" ON "public"."policy_categories"("policy_id");

-- CreateIndex
CREATE UNIQUE INDEX "policy_categories_policy_id_category_key" ON "public"."policy_categories"("policy_id", "category");

-- CreateIndex
CREATE INDEX "block_events_organization_id_created_at_idx" ON "public"."block_events"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "block_events_site_id_created_at_idx" ON "public"."block_events"("site_id", "created_at");

-- CreateIndex
CREATE INDEX "block_events_policy_id_created_at_idx" ON "public"."block_events"("policy_id", "created_at");

-- CreateIndex
CREATE INDEX "block_events_matched_rule_type_matched_rule_id_idx" ON "public"."block_events"("matched_rule_type", "matched_rule_id");

-- AddForeignKey
ALTER TABLE "public"."organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."sites" ADD CONSTRAINT "sites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."sites" ADD CONSTRAINT "sites_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."policies" ADD CONSTRAINT "policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."blocked_urls" ADD CONSTRAINT "blocked_urls_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."blocked_domains" ADD CONSTRAINT "blocked_domains_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."blocked_keywords" ADD CONSTRAINT "blocked_keywords_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."policy_categories" ADD CONSTRAINT "policy_categories_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."block_events" ADD CONSTRAINT "block_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."block_events" ADD CONSTRAINT "block_events_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."block_events" ADD CONSTRAINT "block_events_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
