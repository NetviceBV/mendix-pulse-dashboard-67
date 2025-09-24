# Mendix Monitoring Dashboard - Project Knowledge (T=0)

## Database Migration Standards

### Migration Naming Convention

**ALWAYS** use this format for migration files: `YYYYMMDDHHMMSS_descriptive_name.sql`

Examples:
- `20250118120000_create_complete_database_schema.sql`
- `20250118120001_add_user_roles_system.sql`
- `20250118120002_add_email_notifications.sql`

### Migration Guidelines

- **Use descriptive names** that clearly indicate the purpose
- **Include timestamps** to ensure proper ordering and prevent conflicts
- **Never use UUID-based names** (causes GitHub sync issues)
- **Include rollback instructions** as comments in each migration
- **Structure migrations** with clear sections and documentation
- **Test migrations** in development before applying to production

### Migration File Structure Template

```sql
-- Migration: YYYYMMDDHHMMSS_descriptive_name
-- Description: Brief description of what this migration does
-- Author: System
-- Date: YYYY-MM-DD

-- [Tables section]
-- [RLS Policies section]
-- [Functions section]
-- [Triggers section]
-- [Constraints section]

-- Rollback instructions (commented)
-- To rollback: [specific rollback steps]
```

### Best Practices

- **One logical change per migration** - don't mix unrelated changes
- **Always test rollbacks** to ensure they work correctly  
- **Use consistent naming** for tables, columns, and constraints
- **Document complex logic** with inline comments
- **Validate schema changes** don't break existing functionality

## Project Overview

The Mendix Monitoring Dashboard is a React-based web application that provides comprehensive monitoring and management capabilities for Mendix applications. It enables users to monitor application health, manage environments, view real-time logs, and control environment states through an intuitive interface.

### Core Capabilities
- Monitor multiple Mendix applications from a centralized dashboard
- Manage environment lifecycle (start/stop operations)
- Real-time log monitoring with webhook integration
- Historical log analysis and download capabilities
- Error and warning count tracking with live updates
- Secure credential management for Mendix API access

### Technology Stack
- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS with custom design system
- **UI Components**: shadcn/ui component library
- **Backend**: Supabase (PostgreSQL + Edge Functions)
- **Authentication**: Supabase Auth
- **Real-time**: Supabase Realtime subscriptions

## Database Architecture

### Core Tables

#### `mendix_credentials`
Stores user's Mendix API credentials for accessing the Mendix Deploy API.
- `id` (uuid, PK), `user_id` (uuid)
- `name` (text) - User-friendly credential name
- `username` (text) - Mendix username
- `api_key` (text) - Mendix API key
- `pat` (text, optional) - Personal Access Token
- Timestamps: `created_at`, `updated_at`

#### `mendix_apps`
Application metadata and status information.
- `id` (uuid, PK), `user_id` (uuid), `credential_id` (uuid)
- `app_id` (text) - Mendix application ID
- `app_name` (text) - Application display name
- `project_id` (text) - Mendix project ID
- `version` (text) - Current application version
- `status` (text) - Overall application status
- `app_url` (text) - Application URL
- `last_deployed` (timestamp) - Last deployment time
- `active_users` (integer) - Current active user count
- `warning_count`, `error_count` (integer) - Alert counters
- Timestamps: `created_at`, `updated_at`

#### `mendix_environments`
Environment-specific information and status.
- `id` (uuid, PK), `user_id` (uuid), `credential_id` (uuid)
- `app_id` (text) - Associated application ID
- `environment_id` (text) - Mendix environment ID
- `environment_name` (text) - Environment display name
- `status` (text) - Environment status (running, stopped, etc.)
- `url` (text) - Environment URL
- `model_version`, `runtime_version` (text) - Version information
- `warning_count`, `error_count` (integer) - Environment-specific counters
- Timestamps: `created_at`, `updated_at`

#### `mendix_logs`
Real-time webhook logs from Mendix applications.
- `id` (uuid, PK), `user_id` (uuid)
- `app_id` (text) - Source application ID
- `environment` (text) - Source environment
- `timestamp` (timestamp) - Log entry timestamp
- `level` (text) - Log level (Info, Warning, Error, Critical)
- `message` (text) - Log message content
- `node` (text, optional) - Source node information
- `stacktrace` (text, optional) - Error stacktrace
- Timestamps: `created_at`, `updated_at`

#### `webhook_api_keys`
API keys for webhook authentication.
- `id` (uuid, PK), `user_id` (uuid)
- `key_name` (text) - User-friendly key name
- `api_key` (text) - Generated API key
- `is_active` (boolean) - Key activation status
- Timestamps: `created_at`, `updated_at`

### Table Relationships

#### Key Table Mappings
The following relationship is critical for proper data queries across the system:

**`mendix_apps.project_id == mendix_environments.app_id`**

This mapping is essential because:
- Mendix environments store the `app_id` field which corresponds to the Mendix project ID
- The `mendix_apps` table stores this same value in the `project_id` field
- When looking up app information from environment data, always use: `mendix_apps.project_id = mendix_environments.app_id`
- This relationship is used extensively in edge functions like `monitor-environment-logs` and `fetch-mendix-apps`

**Developer Note**: Do NOT use `mendix_apps.app_id` when joining with `mendix_environments.app_id` as this will result in failed lookups.

### Security Model
All tables implement Row Level Security (RLS) policies ensuring users can only access their own data:
- SELECT: Users can view their own records
- INSERT: Users can create records with their user_id
- UPDATE: Users can modify their own records
- DELETE: Users can delete their own records (where applicable)

## Edge Functions

### `fetch-mendix-apps`
Retrieves application and environment data from Mendix Deploy API.
- Authenticates user via JWT
- Fetches user's Mendix credentials
- Calls Mendix Deploy API endpoints for apps and environments
- Stores processed data in database tables

### `start-mendix-environment` / `stop-mendix-environment`
Manages Mendix environment lifecycle.
- Validates user authentication
- Prevents operations on production environments
- Calls appropriate Mendix Deploy API endpoints
- Returns operation status

### `download-mendix-logs`
Downloads log files from Mendix environments.
- Authenticates user and retrieves credentials
- Calls Mendix Deploy API for log retrieval
- Returns log content for display/download

### `refresh-mendix-environment-status`
Updates environment status information.
- Fetches current status from Mendix API
- Updates local database with latest information

### `webhook-mendix-logs`
Receives and processes webhook log data from Mendix applications.
- Validates API key against database
- Parses log payload (appId, environment, level, message)
- Stores log entry and updates aggregate counts
- Uses database functions for efficient counting

## Frontend Components

### Pages
- **Dashboard (`src/pages/Index.tsx`)**: Main application view with search and app grid
- **Settings (`src/pages/Settings.tsx`)**: Credential and webhook management
- **SignIn (`src/pages/SignIn.tsx`)**: Authentication interface

### Core Components
- **AppCard (`src/components/AppCard.tsx`)**: Individual application display with environment controls
- **LogsViewer (`src/components/LogsViewer.tsx`)**: Tabbed log viewing interface (webhook vs file logs)
- **MendixCredentials (`src/components/MendixCredentials.tsx`)**: Credential management interface
- **WebhookManagement (`src/components/WebhookManagement.tsx`)**: API key generation and webhook setup

### Hooks
- **useMendixOperations (`src/hooks/useMendixOperations.ts`)**: Custom hook for Mendix API operations

## Real-time Features

### Live Error Counting
- Supabase realtime subscriptions monitor `mendix_logs` table
- Automatic increment of error/warning counts on new log entries
- Real-time UI updates without page refresh
- Environment-specific count tracking

### Webhook Log Streaming
- Immediate display of incoming webhook logs
- Real-time log level filtering and search
- Live status updates in LogsViewer component

### Environment Status Monitoring
- Real-time environment status updates
- Automatic refresh of environment information
- Live status indicators in AppCard components

## Authentication & Security

### User Authentication
- Supabase Auth integration with email/password
- JWT-based authentication for edge functions
- Automatic session management and refresh

### Data Security
- Row Level Security (RLS) on all database tables
- User isolation at database level
- API key-based webhook authentication
- Secure credential storage with user-specific access

### API Security
- CORS configuration for edge functions
- Request validation and sanitization
- Production environment protection
- Error handling and logging

## API Integrations

### Mendix Deploy API
- **Base URL**: `https://deploy.mendix.com`
- **Authentication**: Basic Auth with username and API key
- **Key Endpoints**:
  - `/api/4/apps` - List applications
  - `/api/1/apps/{appId}/packages` - Deployment information
  - `/api/4/apps/{appId}/environments` - Environment details
  - `/api/1/apps/{appName}/environments/{environmentName}/start` - Start environment
  - Environment stop endpoint for stopping operations

### Webhook Integration
- **Endpoint**: Supabase edge function `webhook-mendix-logs`
- **Authentication**: `x-api-key` header
- **Payload Structure**: JSON with appId, environment, timestamp, level, message, optional node/stacktrace

## Database Functions

### Count Management Functions
- `increment_app_warning_count(target_app_id, target_user_id)` - Increments app warning count
- `increment_app_error_count(target_app_id, target_user_id)` - Increments app error count
- `increment_environment_counts(target_app_id, target_environment, target_level, target_user_id)` - Updates environment-specific counts
- `update_updated_at_column()` - Trigger function for automatic timestamp updates

## User Workflows

### Initial Setup
1. Sign up/log in via Supabase Auth
2. Navigate to Settings → Mendix Credentials
3. Add Mendix API credentials (username, API key)
4. Click "Fetch Apps" to populate dashboard
5. Applications and environments appear on dashboard

### Daily Monitoring
1. View dashboard for application overview
2. Monitor real-time error/warning counts
3. Use search to find specific applications
4. Start/stop environments as needed
5. View logs for troubleshooting

### Log Analysis
1. Click "View Logs" on any application
2. LogsViewer opens with webhook logs tab
3. Switch between "Webhook Logs" and "File Logs" tabs
4. Use search and filtering for analysis
5. Download historical logs when needed

### Webhook Setup
1. Navigate to Settings → Webhook Settings
2. Generate new API key with descriptive name
3. Copy webhook URL and API key
4. Configure Mendix application webhook settings
5. Activate API key to start receiving logs

## Development Guidelines

### Code Organization
- Components in `/src/components/`
- Pages in `/src/pages/`
- Hooks in `/src/hooks/`
- Supabase integration in `/src/integrations/supabase/`
- Edge functions in `/supabase/functions/`

### Styling Standards
- Use Tailwind CSS semantic tokens from `index.css`
- Follow design system defined in `tailwind.config.ts`
- Avoid direct color usage in components
- All colors must be HSL format

### Security Best Practices
- Always use RLS policies for new tables
- Validate user authentication in edge functions
- Use parameterized queries to prevent SQL injection
- Implement proper CORS headers
- Log security-relevant events

## Current Status (T=0)

The application is fully functional with:
- ✅ User authentication and authorization
- ✅ Mendix credential management
- ✅ Application and environment monitoring
- ✅ Real-time webhook log ingestion
- ✅ Environment start/stop operations
- ✅ Log viewing and downloading
- ✅ Webhook API key management
- ✅ Real-time error count tracking
- ✅ Responsive UI with dark/light mode support

The system is ready for production use and additional feature development.