# Mendix API Case Sensitivity Guide

## CRITICAL: Environment Name Case Sensitivity

**THIS IS A RECURRING ISSUE THAT CAUSES DEPLOY FAILURES AND WALL_CLOCK TIMEOUTS**

### The Problem
Mendix Deploy API endpoints have **strict case sensitivity requirements** for environment names that are inconsistent across different API versions:

- **V1 API** (used for backups, start/stop, transport): Expects **capitalized** environment names
- **V4 API** (used for status checks): More flexible but should use **lowercase** for consistency
- **Database storage**: Often stores environment names in lowercase

### Required Environment Name Format

| Environment | V1 API (Backups/Start/Stop) | Database Storage | Notes |
|-------------|------------------------------|------------------|-------|
| Production  | `Production` (capitalized)   | `production`     | MOST CRITICAL |
| Acceptance  | `Acceptance` (capitalized)   | `acceptance`     | Often causes issues |
| Test        | `Test` (capitalized)         | `test`           | Less common |

### Symptoms of Case Sensitivity Issues

1. **Backup Creation Failures**: 
   - Backup API calls return 404 or silent failures
   - Backup attempts to create on wrong environment (e.g., production instead of acceptance)
   - Function timeout due to `wall_clock` limits

2. **Environment Operation Failures**:
   - Start/stop commands fail with 404 errors
   - Transport operations targeting wrong environment

3. **Log Symptoms**:
   ```
   Error: Failed to create backup: 
   Function shutdown due to: wall_clock
   ```

### Implementation Requirements

#### 1. Environment Name Normalization Function
```typescript
const normalizeEnvironmentName = (envName: string): string => {
  const normalized = envName.toLowerCase();
  switch (normalized) {
    case 'production':
      return 'Production';
    case 'acceptance':
      return 'Acceptance';
    case 'test':
      return 'Test';
    default:
      // For custom environment names, capitalize first letter
      return envName.charAt(0).toUpperCase() + envName.slice(1).toLowerCase();
  }
};
```

#### 2. API Endpoint Usage Rules

**V1 API Endpoints (ALWAYS use normalized names):**
- `/api/1/apps/{appId}/environments/{environmentName}/start`
- `/api/1/apps/{appId}/environments/{environmentName}/stop` 
- `/api/1/apps/{appId}/environments/{environmentName}/transport`
- `/api/1/apps/{appId}/environments/{environmentName}/backups`

**V4 API Endpoints (Use original or normalized):**
- `/api/4/apps/{projectId}/environments/{environmentId}` (uses environment ID, not name)

#### 3. Database Considerations

When storing environment data:
- Store original case in database for display purposes
- Always normalize before making V1 API calls
- Log both original and normalized names for debugging

### Code Implementation Checklist

- [ ] Environment name normalization function implemented
- [ ] All V1 API calls use normalized environment names
- [ ] Logging shows both original and normalized names
- [ ] Error handling captures API responses for debugging
- [ ] Documentation updated with case sensitivity requirements

### Debugging Steps

When investigating environment-related failures:

1. **Check logs for environment names being used**:
   ```
   Using normalized environment name: "Acceptance" (original: "acceptance")
   ```

2. **Verify API URLs in logs**:
   ```
   Creating backup on environment: Acceptance (URL: https://deploy.mendix.com/api/1/apps/appId/environments/Acceptance/backups)
   ```

3. **Check for 404 responses from Mendix API**
4. **Verify environment exists in Mendix Portal**
5. **Confirm environment name spelling and case**

### Prevention Measures

1. **Always use the normalization function** before V1 API calls
2. **Add logging** to show original vs normalized environment names
3. **Test with both cases** during development
4. **Document any new environment name patterns** encountered
5. **Review this guide** before implementing environment-related features

### Historical Issues

- **2025-08-15**: Deploy action creating backup on production instead of acceptance due to case mismatch
- Multiple instances of wall_clock timeouts caused by silent backup API failures
- Transport operations targeting wrong environments

### Related Files

- `supabase/functions/run-cloud-actions/index.ts` - Main implementation
- `supabase/functions/refresh-mendix-environment-status/index.ts` - Status checking
- `supabase/functions/start-mendix-environment/index.ts` - Environment start
- `supabase/functions/stop-mendix-environment/index.ts` - Environment stop

---

**REMEMBER: When in doubt about environment names, ALWAYS normalize to proper case before making V1 API calls!**