-- Default policy starts with the Gambling pack on. Other packs stay off.
UPDATE "policy_categories" AS category
SET "enabled" = true, "updated_at" = CURRENT_TIMESTAMP
FROM "policies" AS policy
JOIN "organizations" AS organization ON organization."id" = policy."organization_id"
WHERE category."policy_id" = policy."id"
  AND organization."name" = 'AdSnitch'
  AND policy."name" = 'Default URL blocklist'
  AND category."category" = 'GAMBLING';

UPDATE "blocked_keywords" AS keyword
SET "enabled" = true, "updated_at" = CURRENT_TIMESTAMP
FROM "policies" AS policy
JOIN "organizations" AS organization ON organization."id" = policy."organization_id"
WHERE keyword."policy_id" = policy."id"
  AND organization."name" = 'AdSnitch'
  AND policy."name" = 'Default URL blocklist'
  AND keyword."category" = 'GAMBLING';
