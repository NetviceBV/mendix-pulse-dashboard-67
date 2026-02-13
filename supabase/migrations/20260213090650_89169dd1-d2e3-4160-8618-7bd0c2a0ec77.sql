
-- Step 1: Delete duplicate "Erik 2" credentials
DELETE FROM mendix_credentials
WHERE id IN (
  'e9cad285-4b3e-4300-8b40-bc5674e74f11',
  'b052d186-d288-44a8-8b43-ef5739db8000'
);

-- Step 3: Add unique constraint to prevent future duplicates
ALTER TABLE mendix_credentials
ADD CONSTRAINT unique_user_name_username UNIQUE (user_id, name, username);
