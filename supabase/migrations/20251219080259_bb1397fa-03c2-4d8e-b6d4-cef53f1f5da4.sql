-- Step 1: Add creator_name column to cloud_actions
ALTER TABLE public.cloud_actions 
ADD COLUMN IF NOT EXISTS creator_name text;

-- Step 2: Backfill existing records with creator names from profiles
UPDATE public.cloud_actions ca
SET creator_name = p.full_name
FROM public.profiles p
WHERE ca.user_id = p.user_id
AND ca.creator_name IS NULL;