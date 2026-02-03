

## Plan: Document pg_net Extension Security Exception in Knowledge Base

### Overview
Add documentation to `KNOWLEDGE.md` explaining why `pg_net` being registered in the `public` schema is acceptable and should not be flagged in security audits.

### Location
Add a new subsection under the existing "Authentication & Security" section (after line 270), titled "Database Extension Security Notes".

### Content to Add

```markdown
### Database Extension Security Notes

#### pg_net Extension - Security Audit Exception
The `pg_net` extension appears registered in the `public` schema when querying `pg_extension`, which may trigger security audit warnings about extensions in public schema. However, this is a **safe exception** that does not require remediation:

**Why it's safe:**
- The extension's operational objects (tables, functions) are properly isolated in a dedicated `net` schema
- All function calls use schema-qualified names (e.g., `net.http_post()`)
- The `public` registration is only metadata - no actual extension objects pollute the public namespace
- PostgreSQL does not support `ALTER EXTENSION pg_net SET SCHEMA` - the extension cannot be relocated after installation

**Extension object locations:**
| Object | Schema | Purpose |
|--------|--------|---------|
| `net.http_post()` | `net` | HTTP POST requests |
| `net._http_response` | `net` | Response storage table |
| `net.http_request_queue` | `net` | Request queue table |

**Other extensions status:**
| Extension | Schema | Status |
|-----------|--------|--------|
| `pgcrypto` | `extensions` | Properly isolated |
| `uuid-ossp` | `extensions` | Properly isolated |
| `pg_cron` | `pg_catalog` | System-managed |
| `pg_graphql` | `graphql` | Properly isolated |
| `pg_stat_statements` | `extensions` | Properly isolated |

**Audit Response:** When security tools flag `pg_net` in public schema, document that this is a known PostgreSQL/Supabase limitation where the extension registration cannot be moved, but the actual security-relevant objects are properly isolated in the `net` schema.
```

### Changes Summary

| File | Section | Action |
|------|---------|--------|
| `KNOWLEDGE.md` | After "API Security" (line ~270) | Add new "Database Extension Security Notes" subsection |

### Why This Helps
- Provides clear documentation for future security audits
- Explains the technical limitation preventing remediation
- Documents the actual object isolation that makes this safe
- Serves as an audit response template

