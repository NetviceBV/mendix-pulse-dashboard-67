-- Fix: Update apps that reference the deleted credential to use the current one
UPDATE mendix_apps 
SET credential_id = 'cb47a4e2-82af-4a4d-94fa-7f9b95e776b8'
WHERE user_id = 'fa7cf1c9-69bb-441f-954c-ddc1f4b6c029'
AND credential_id = '3e4109ab-8cc7-4bf1-9c0f-81cdf0d18a68';

-- Also fix environments
UPDATE mendix_environments
SET credential_id = 'cb47a4e2-82af-4a4d-94fa-7f9b95e776b8'
WHERE user_id = 'fa7cf1c9-69bb-441f-954c-ddc1f4b6c029'
AND credential_id = '3e4109ab-8cc7-4bf1-9c0f-81cdf0d18a68';