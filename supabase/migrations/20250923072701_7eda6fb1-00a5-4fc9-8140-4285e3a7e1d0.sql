-- Clean up duplicate email templates, keeping only the oldest one per type per user
WITH duplicates AS (
  SELECT id, 
         ROW_NUMBER() OVER (PARTITION BY user_id, template_type ORDER BY created_at) as rn
  FROM email_templates
)
DELETE FROM email_templates 
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Add unique constraint to prevent future duplicates
ALTER TABLE email_templates 
ADD CONSTRAINT email_templates_user_type_unique 
UNIQUE (user_id, template_type);