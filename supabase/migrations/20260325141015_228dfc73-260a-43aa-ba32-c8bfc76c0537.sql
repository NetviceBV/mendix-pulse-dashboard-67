
-- Delete older duplicate templates, keeping the most recently created one per template_type
DELETE FROM public.email_templates
WHERE id NOT IN (
  SELECT DISTINCT ON (template_type) id
  FROM public.email_templates
  ORDER BY template_type, created_at DESC
);

-- Now add unique constraint on template_type
ALTER TABLE public.email_templates ADD CONSTRAINT unique_template_type UNIQUE (template_type);
