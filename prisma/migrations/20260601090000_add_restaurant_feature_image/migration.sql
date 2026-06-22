ALTER TABLE "Restaurant" ADD COLUMN "featureImageUrl" TEXT;

UPDATE "Restaurant"
SET "featureImageUrl" = CASE
    WHEN lower("name") LIKE '%burger%' THEN 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80'
    WHEN lower("name") LIKE '%sushi%' THEN 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=1200&q=80'
    WHEN lower("name") LIKE '%taco%' THEN 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=1200&q=80'
    WHEN lower("name") LIKE '%pizza%' THEN 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80'
    ELSE 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80'
END
WHERE "featureImageUrl" IS NULL;
