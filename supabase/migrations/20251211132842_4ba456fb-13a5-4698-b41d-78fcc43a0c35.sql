
-- Delete stale Acceptance records
DELETE FROM owasp_check_results WHERE id = 'ffcfae16-f526-4c95-b29e-85d35cf59d06';
DELETE FROM owasp_manual_verifications WHERE id = '63b0e0fa-508d-4d98-a759-141b7ea0c823';

-- Update Production check result to pass based on existing verification
UPDATE owasp_check_results 
SET status = 'pass', 
    details = 'Manual verification completed on Dec 11, 2025 13:25. URLs verified successfully.',
    checked_at = NOW()
WHERE id = 'd1757710-5552-4dae-92c6-aff9fe35f0b6';
