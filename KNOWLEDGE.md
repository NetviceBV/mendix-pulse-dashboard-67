# Mendix Monitoring Dashboard - Comprehensive Knowledge Documentation

## Application Overview

The Mendix Monitoring Dashboard is a React-based web application that provides comprehensive monitoring and management capabilities for Mendix applications. It allows users to monitor application health, manage environments, view real-time logs, and control environment states through an intuitive interface.

### Core Purpose
- Monitor multiple Mendix applications from a centralized dashboard
- Manage environment lifecycle (start/stop operations)
- Real-time log monitoring with webhook integration
- Historical log analysis and download capabilities
- Error and warning count tracking with live updates

### Technology Stack
- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS with custom design system
- **UI Components**: shadcn/ui component library
- **Backend**: Supabase (PostgreSQL + Edge Functions)
- **Authentication**: Supabase Auth
- **Real-time**: Supabase Realtime subscriptions

## Database Schema

### Core Tables

#### `mendix_credentials`
Stores user's Mendix API credentials for accessing the Mendix Deploy API.
- `id` (uuid, primary key)
- `user_id` (uuid, references auth.users)
- `name` (text) - User-friendly name for the credential set
- `username` (text) - Mendix username
- `api_key` (text) - Mendix API key
- `pat` (text) - Personal Access Token (optional)
- `created_at`, `updated_at` (timestamps)

#### `mendix_apps`
Application metadata and status information.
- `id` (uuid, primary key)
- `user_id` (uuid, references auth.users)
- `credential_id` (uuid, references mendix_credentials)
- `app_id` (text) - Mendix application ID
- `app_name` (text) - Application display name
- `project_id` (text) - Mendix project ID
- `version` (text) - Current application version
- `status` (text) - Overall application status
- `app_url` (text) - Application URL
- `last_deployed` (timestamp) - Last deployment time
- `active_users` (integer) - Current active user count
- `warning_count` (integer) - Total warning count
- `error_count` (integer) - Total error count
- `created_at`, `updated_at` (timestamps)

#### `mendix_environments`
Environment-specific information and status.
- `id` (uuid, primary key)
- `user_id` (uuid, references auth.users)
- `credential_id` (uuid, references mendix_credentials)
- `app_id` (text) - Associated application ID
- `environment_id` (text) - Mendix environment ID
- `environment_name` (text) - Environment display name
- `status` (text) - Environment status (running, stopped, etc.)
- `url` (text) - Environment URL
- `model_version` (text) - Model version
- `runtime_version` (text) - Runtime version
- `warning_count` (integer) - Environment-specific warning count
- `error_count` (integer) - Environment-specific error count
- `created_at`, `updated_at` (timestamps)

#### `mendix_logs`
Real-time webhook logs from Mendix applications.
- `id` (uuid, primary key)
- `user_id` (uuid, references auth.users)
- `app_id` (text) - Source application ID
- `environment` (text) - Source environment
- `timestamp` (timestamp) - Log entry timestamp
- `level` (text) - Log level (Info, Warning, Error, Critical)
- `message` (text) - Log message content
- `node` (text, optional) - Source node information
- `stacktrace` (text, optional) - Error stacktrace
- `created_at`, `updated_at` (timestamps)

#### `webhook_api_keys`
API keys for webhook authentication.
- `id` (uuid, primary key)
- `user_id` (uuid, references auth.users)
- `key_name` (text) - User-friendly key name
- `api_key` (text) - Generated API key
- `is_active` (boolean) - Key activation status
- `created_at`, `updated_at` (timestamps)

### Row Level Security (RLS)
All tables implement comprehensive RLS policies ensuring users can only access their own data:
- SELECT: Users can view their own records
- INSERT: Users can create records with their user_id
- UPDATE: Users can modify their own records
- DELETE: Users can delete their own records (where applicable)

## Edge Functions

### `fetch-mendix-apps`
**Purpose**: Retrieves application and environment data from Mendix Deploy API.
**Trigger**: Manual user action from credentials management interface.
**Process**:
1. Authenticates user via JWT
2. Fetches Mendix credentials for the user
3. Calls Mendix Deploy API `/api/4/apps` endpoint
4. Retrieves deployment information from `/api/1/apps/{appId}/packages`
5. Fetches environment details from `/api/4/apps/{appId}/environments`
6. Stores processed data in `mendix_apps` and `mendix_environments` tables

### `start-mendix-environment`
**Purpose**: Starts a specified Mendix environment.
**Security**: Prevents starting production environments.
**Process**:
1. Validates user authentication
2. Retrieves user's Mendix credentials
3. Calls Mendix Deploy API `/api/1/apps/{appName}/environments/{environmentName}/start`
4. Returns operation status

### `stop-mendix-environment`
**Purpose**: Stops a specified Mendix environment.
**Security**: Prevents stopping production environments.
**Process**:
1. Validates user authentication
2. Retrieves user's Mendix credentials
3. Calls Mendix Deploy API to stop the environment
4. Returns operation status

### `download-mendix-logs`
**Purpose**: Downloads log files from Mendix environments.
**Process**:
1. Authenticates user
2. Calls Mendix Deploy API to retrieve log files
3. Returns log content for display or download

### `refresh-mendix-environment-status`
**Purpose**: Updates environment status information.
**Process**:
1. Fetches current environment status from Mendix API
2. Updates local database with latest status information

### `webhook-mendix-logs`
**Purpose**: Receives and processes webhook log data from Mendix applications.
**Security**: Validates API key against `webhook_api_keys` table.
**Process**:
1. Validates incoming webhook API key
2. Parses log payload (appId, environment, timestamp, level, message)
3. Stores log entry in `mendix_logs` table
4. Updates aggregate counts using database functions:
   - `increment_app_warning_count()`
   - `increment_app_error_count()`
   - `increment_environment_counts()`

## Key Components Architecture

### `Dashboard.tsx`
**Purpose**: Main application view displaying user's Mendix applications.
**Features**:
- Search functionality across applications
- Real-time error count updates via Supabase subscriptions
- Grid layout of application cards
- Simplified interface focused on core functionality

**Recent Changes**: Removed status overview cards and filter buttons for cleaner UI.

### `AppCard.tsx`
**Purpose**: Individual application display component.
**Features**:
- Application metadata display (name, version, status)
- Environment management buttons (start/stop)
- Real-time error and warning counts
- Direct links to application environments
- Logs viewer integration

### `LogsViewer.tsx`
**Purpose**: Comprehensive log viewing interface.
**Features**:
- Tabbed interface: "Webhook Logs" and "File Logs"
- Real-time log streaming for webhook logs
- Search and date filtering capabilities
- Log level color coding and badges
- Download functionality for file logs
- Automatic refresh and manual refresh options

**Recent Enhancement**: Immediate popup display with separated log types.

### `MendixCredentials.tsx`
**Purpose**: Credential management interface.
**Features**:
- Add/edit/delete Mendix API credentials
- Secure credential storage
- Fetch applications functionality
- Form validation and error handling

### `WebhookManagement.tsx`
**Purpose**: Webhook API key management.
**Features**:
- Generate webhook API keys
- Activate/deactivate keys
- Copy keys to clipboard
- Display webhook URL and payload format
- Key visibility toggle for security

### `useMendixOperations.ts`
**Purpose**: Custom hook for Mendix API operations.
**Functions**:
- `getCredentials()` - Fetch user credentials
- `startEnvironment()` - Start environment via edge function
- `stopEnvironment()` - Stop environment via edge function
- `downloadLogs()` - Download log files
- `fetchWebhookLogs()` - Retrieve webhook logs
- `refreshEnvironmentStatus()` - Update environment status

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

## API Integration Details

### Mendix Deploy API
**Base URL**: `https://deploy.mendix.com`
**Authentication**: Basic Auth with username and API key
**Key Endpoints**:
- `/api/4/apps` - List applications
- `/api/1/apps/{appId}/packages` - Deployment information
- `/api/4/apps/{appId}/environments` - Environment details
- `/api/1/apps/{appName}/environments/{environmentName}/start` - Start environment
- Environment stop endpoint for stopping operations

### Webhook Integration
**Endpoint**: `https://uiquvncvmimhbkylfzzp.supabase.co/functions/v1/webhook-mendix-logs`
**Authentication**: `x-api-key` header
**Payload Structure**:
```json
{
  "appId": "string",
  "environment": "string", 
  "timestamp": "ISO 8601 datetime",
  "level": "Info|Warning|Error|Critical",
  "message": "string",
  "node": "string (optional)",
  "stacktrace": "string (optional)"
}
```

## User Workflows

### Initial Setup
1. User signs up/logs in via Supabase Auth
2. Navigate to Settings → Mendix Credentials
3. Add Mendix API credentials (username, API key)
4. Click "Fetch Apps" to populate dashboard
5. Applications and environments appear on dashboard

### Daily Monitoring
1. View dashboard for application overview
2. Monitor real-time error/warning counts
3. Use search to find specific applications
4. Click on applications to view environment details
5. Start/stop environments as needed

### Log Analysis
1. Click "View Logs" on any application
2. LogsViewer opens with immediate webhook logs
3. Switch between "Webhook" and "File" log tabs
4. Use search and date filters for analysis
5. Download historical logs when needed

### Webhook Setup
1. Navigate to Settings → Webhook Settings
2. Generate new API key with descriptive name
3. Copy webhook URL and API key
4. Configure Mendix application webhook settings
5. Activate API key to start receiving logs

## Recent Enhancements

### UI Simplification (Latest)
- **Removed**: Dashboard status overview cards showing totals
- **Removed**: Status filter buttons (All, Running, Stopped, etc.)
- **Kept**: Search functionality and core app grid
- **Benefit**: Cleaner, more focused interface

### LogsViewer Improvements
- **Enhanced**: Immediate popup display when clicking "View Logs"
- **Added**: Tabbed interface separating webhook logs from file logs
- **Improved**: Real-time log streaming with better performance
- **Added**: Log level-specific styling and badges

### Real-time Error Tracking
- **Implemented**: Live error count updates using Supabase realtime
- **Added**: Environment-specific error/warning counting
- **Enhanced**: Database functions for efficient count aggregation
- **Improved**: Automatic UI updates without manual refresh

## Database Functions

### `increment_app_warning_count(target_app_id, target_user_id)`
Increments warning count for a specific application.

### `increment_app_error_count(target_app_id, target_user_id)`
Increments error count for a specific application.

### `increment_environment_counts(target_app_id, target_environment, target_level, target_user_id)`
Updates environment-specific counts based on log level:
- Warning level: Increments warning_count
- Error/Critical level: Increments error_count

### `update_updated_at_column()`
Trigger function to automatically update timestamps on record changes.

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

## Troubleshooting Common Issues

### Authentication Issues
- Check Supabase Auth configuration
- Verify JWT token validity
- Ensure user session persistence

### Real-time Updates Not Working
- Verify Supabase realtime subscriptions
- Check database triggers and functions
- Confirm RLS policies allow access

### Edge Function Errors
- Review function logs in Supabase dashboard
- Check environment variable configuration
- Verify CORS headers and request validation

### Mendix API Integration
- Validate API credentials and permissions
- Check network connectivity and firewall rules
- Review Mendix Deploy API documentation for changes

This documentation serves as a comprehensive reference for the Mendix Monitoring Dashboard application, covering all major aspects of the system architecture, functionality, and development practices.