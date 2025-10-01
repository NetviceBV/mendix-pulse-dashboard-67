export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      cloud_action_logs: {
        Row: {
          action_id: string
          created_at: string
          id: string
          level: string
          message: string
          user_id: string
        }
        Insert: {
          action_id: string
          created_at?: string
          id?: string
          level?: string
          message: string
          user_id: string
        }
        Update: {
          action_id?: string
          created_at?: string
          id?: string
          level?: string
          message?: string
          user_id?: string
        }
        Relationships: []
      }
      cloud_actions: {
        Row: {
          action_type: string
          app_id: string
          attempt_count: number | null
          backup_id: string | null
          completed_at: string | null
          created_at: string
          credential_id: string
          current_step: string | null
          environment_name: string
          error_message: string | null
          id: string
          last_heartbeat: string | null
          package_id: string | null
          payload: Json | null
          retry_until: string | null
          scheduled_for: string | null
          started_at: string | null
          status: string
          step_data: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          action_type: string
          app_id: string
          attempt_count?: number | null
          backup_id?: string | null
          completed_at?: string | null
          created_at?: string
          credential_id: string
          current_step?: string | null
          environment_name: string
          error_message?: string | null
          id?: string
          last_heartbeat?: string | null
          package_id?: string | null
          payload?: Json | null
          retry_until?: string | null
          scheduled_for?: string | null
          started_at?: string | null
          status?: string
          step_data?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          action_type?: string
          app_id?: string
          attempt_count?: number | null
          backup_id?: string | null
          completed_at?: string | null
          created_at?: string
          credential_id?: string
          current_step?: string | null
          environment_name?: string
          error_message?: string | null
          id?: string
          last_heartbeat?: string | null
          package_id?: string | null
          payload?: Json | null
          retry_until?: string | null
          scheduled_for?: string | null
          started_at?: string | null
          status?: string
          step_data?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      edge_functions: {
        Row: {
          category: string
          created_at: string
          description: string | null
          display_name: string
          expected_parameters: Json | null
          function_name: string
          id: string
          is_active: boolean
          is_owasp_compatible: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          display_name: string
          expected_parameters?: Json | null
          function_name: string
          id?: string
          is_active?: boolean
          is_owasp_compatible?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          display_name?: string
          expected_parameters?: Json | null
          function_name?: string
          id?: string
          is_active?: boolean
          is_owasp_compatible?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          created_at: string
          html_template: string
          id: string
          is_default: boolean
          subject_template: string
          template_name: string
          template_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          html_template: string
          id?: string
          is_default?: boolean
          subject_template: string
          template_name: string
          template_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          html_template?: string
          id?: string
          is_default?: boolean
          subject_template?: string
          template_name?: string
          template_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      log_monitoring_alerts: {
        Row: {
          alert_type: string
          created_at: string
          email_sent: boolean
          email_sent_at: string | null
          environment_id: string
          id: string
          log_content: string
          log_entries_count: number
          user_id: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          email_sent?: boolean
          email_sent_at?: string | null
          environment_id: string
          id?: string
          log_content: string
          log_entries_count?: number
          user_id: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          email_sent?: boolean
          email_sent_at?: string | null
          environment_id?: string
          id?: string
          log_content?: string
          log_entries_count?: number
          user_id?: string
        }
        Relationships: []
      }
      log_monitoring_settings: {
        Row: {
          check_interval_minutes: number
          created_at: string
          critical_threshold: number
          environment_id: string
          error_threshold: number
          id: string
          is_enabled: boolean
          last_check_time: string | null
          updated_at: string
          user_id: string
          whitelist_patterns: Json | null
        }
        Insert: {
          check_interval_minutes?: number
          created_at?: string
          critical_threshold?: number
          environment_id: string
          error_threshold?: number
          id?: string
          is_enabled?: boolean
          last_check_time?: string | null
          updated_at?: string
          user_id: string
          whitelist_patterns?: Json | null
        }
        Update: {
          check_interval_minutes?: number
          created_at?: string
          critical_threshold?: number
          environment_id?: string
          error_threshold?: number
          id?: string
          is_enabled?: boolean
          last_check_time?: string | null
          updated_at?: string
          user_id?: string
          whitelist_patterns?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_log_monitoring_settings_environment"
            columns: ["environment_id"]
            isOneToOne: false
            referencedRelation: "mendix_environments"
            referencedColumns: ["id"]
          },
        ]
      }
      mendix_apps: {
        Row: {
          active_users: number | null
          app_id: string | null
          app_name: string
          app_url: string | null
          created_at: string
          credential_id: string
          environment: string | null
          error_count: number | null
          id: string
          last_deployed: string | null
          project_id: string | null
          status: string | null
          updated_at: string
          user_id: string
          version: string | null
          warning_count: number | null
        }
        Insert: {
          active_users?: number | null
          app_id?: string | null
          app_name: string
          app_url?: string | null
          created_at?: string
          credential_id: string
          environment?: string | null
          error_count?: number | null
          id?: string
          last_deployed?: string | null
          project_id?: string | null
          status?: string | null
          updated_at?: string
          user_id: string
          version?: string | null
          warning_count?: number | null
        }
        Update: {
          active_users?: number | null
          app_id?: string | null
          app_name?: string
          app_url?: string | null
          created_at?: string
          credential_id?: string
          environment?: string | null
          error_count?: number | null
          id?: string
          last_deployed?: string | null
          project_id?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string
          version?: string | null
          warning_count?: number | null
        }
        Relationships: []
      }
      mendix_credentials: {
        Row: {
          api_key: string | null
          created_at: string
          id: string
          name: string
          pat: string | null
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          api_key?: string | null
          created_at?: string
          id?: string
          name: string
          pat?: string | null
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          api_key?: string | null
          created_at?: string
          id?: string
          name?: string
          pat?: string | null
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      mendix_environments: {
        Row: {
          app_id: string
          created_at: string
          credential_id: string
          environment_id: string | null
          environment_name: string
          error_count: number | null
          id: string
          model_version: string | null
          runtime_version: string | null
          status: string | null
          updated_at: string
          url: string | null
          user_id: string
          warning_count: number | null
        }
        Insert: {
          app_id: string
          created_at?: string
          credential_id: string
          environment_id?: string | null
          environment_name: string
          error_count?: number | null
          id?: string
          model_version?: string | null
          runtime_version?: string | null
          status?: string | null
          updated_at?: string
          url?: string | null
          user_id: string
          warning_count?: number | null
        }
        Update: {
          app_id?: string
          created_at?: string
          credential_id?: string
          environment_id?: string | null
          environment_name?: string
          error_count?: number | null
          id?: string
          model_version?: string | null
          runtime_version?: string | null
          status?: string | null
          updated_at?: string
          url?: string | null
          user_id?: string
          warning_count?: number | null
        }
        Relationships: []
      }
      mendix_logs: {
        Row: {
          app_id: string
          created_at: string
          environment: string
          id: string
          level: string
          message: string
          node: string | null
          stacktrace: string | null
          timestamp: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_id: string
          created_at?: string
          environment: string
          id?: string
          level: string
          message: string
          node?: string | null
          stacktrace?: string | null
          timestamp: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_id?: string
          created_at?: string
          environment?: string
          id?: string
          level?: string
          message?: string
          node?: string | null
          stacktrace?: string | null
          timestamp?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_email_addresses: {
        Row: {
          cloud_action_notifications_enabled: boolean
          created_at: string
          display_name: string | null
          email_address: string
          id: string
          is_active: boolean
          log_monitoring_enabled: boolean
          mailchimp_subaccount: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cloud_action_notifications_enabled?: boolean
          created_at?: string
          display_name?: string | null
          email_address: string
          id?: string
          is_active?: boolean
          log_monitoring_enabled?: boolean
          mailchimp_subaccount?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cloud_action_notifications_enabled?: boolean
          created_at?: string
          display_name?: string | null
          email_address?: string
          id?: string
          is_active?: boolean
          log_monitoring_enabled?: boolean
          mailchimp_subaccount?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      owasp_check_results: {
        Row: {
          app_id: string
          checked_at: string
          created_at: string
          details: string | null
          environment_name: string
          execution_time_ms: number | null
          id: string
          owasp_step_id: string
          status: string
          user_id: string
        }
        Insert: {
          app_id: string
          checked_at?: string
          created_at?: string
          details?: string | null
          environment_name: string
          execution_time_ms?: number | null
          id?: string
          owasp_step_id: string
          status: string
          user_id: string
        }
        Update: {
          app_id?: string
          checked_at?: string
          created_at?: string
          details?: string | null
          environment_name?: string
          execution_time_ms?: number | null
          id?: string
          owasp_step_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "owasp_check_results_owasp_step_id_fkey"
            columns: ["owasp_step_id"]
            isOneToOne: false
            referencedRelation: "owasp_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      owasp_items: {
        Row: {
          created_at: string
          description: string | null
          expiration_months: number
          id: string
          is_active: boolean
          owasp_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          expiration_months?: number
          id?: string
          is_active?: boolean
          owasp_id: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          expiration_months?: number
          id?: string
          is_active?: boolean
          owasp_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      owasp_steps: {
        Row: {
          created_at: string
          edge_function_name: string
          id: string
          is_active: boolean
          owasp_item_id: string
          step_description: string | null
          step_name: string
          step_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          edge_function_name: string
          id?: string
          is_active?: boolean
          owasp_item_id: string
          step_description?: string | null
          step_name: string
          step_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          edge_function_name?: string
          id?: string
          is_active?: boolean
          owasp_item_id?: string
          step_description?: string | null
          step_name?: string
          step_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "owasp_steps_owasp_item_id_fkey"
            columns: ["owasp_item_id"]
            isOneToOne: false
            referencedRelation: "owasp_items"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      system_heartbeat: {
        Row: {
          created_at: string
          heartbeat_counter: number | null
          heartbeat_type: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          heartbeat_counter?: number | null
          heartbeat_type?: string | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          heartbeat_counter?: number | null
          heartbeat_type?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      vulnerability_findings: {
        Row: {
          created_at: string
          cve_id: string | null
          cvss_score: number | null
          cvss_vector: string | null
          description: string | null
          ghsa_id: string | null
          id: string
          jar_file: string
          library_name: string
          library_version: string | null
          published_at: string | null
          reference_url: string | null
          scan_id: string
          severity: string | null
          title: string
          updated_at_vuln: string | null
          vulnerability_id: string
        }
        Insert: {
          created_at?: string
          cve_id?: string | null
          cvss_score?: number | null
          cvss_vector?: string | null
          description?: string | null
          ghsa_id?: string | null
          id?: string
          jar_file: string
          library_name: string
          library_version?: string | null
          published_at?: string | null
          reference_url?: string | null
          scan_id: string
          severity?: string | null
          title: string
          updated_at_vuln?: string | null
          vulnerability_id: string
        }
        Update: {
          created_at?: string
          cve_id?: string | null
          cvss_score?: number | null
          cvss_vector?: string | null
          description?: string | null
          ghsa_id?: string | null
          id?: string
          jar_file?: string
          library_name?: string
          library_version?: string | null
          published_at?: string | null
          reference_url?: string | null
          scan_id?: string
          severity?: string | null
          title?: string
          updated_at_vuln?: string | null
          vulnerability_id?: string
        }
        Relationships: []
      }
      vulnerability_scans: {
        Row: {
          app_id: string
          clean_jars: number | null
          completed_at: string | null
          created_at: string
          environment_name: string
          error_jars: number | null
          error_message: string | null
          id: string
          package_id: string | null
          package_version: string | null
          scan_status: string
          started_at: string
          total_jars: number | null
          total_vulnerabilities: number | null
          updated_at: string
          user_id: string
          vulnerable_jars: number | null
        }
        Insert: {
          app_id: string
          clean_jars?: number | null
          completed_at?: string | null
          created_at?: string
          environment_name: string
          error_jars?: number | null
          error_message?: string | null
          id?: string
          package_id?: string | null
          package_version?: string | null
          scan_status?: string
          started_at?: string
          total_jars?: number | null
          total_vulnerabilities?: number | null
          updated_at?: string
          user_id: string
          vulnerable_jars?: number | null
        }
        Update: {
          app_id?: string
          clean_jars?: number | null
          completed_at?: string | null
          created_at?: string
          environment_name?: string
          error_jars?: number | null
          error_message?: string | null
          id?: string
          package_id?: string | null
          package_version?: string | null
          scan_status?: string
          started_at?: string
          total_jars?: number | null
          total_vulnerabilities?: number | null
          updated_at?: string
          user_id?: string
          vulnerable_jars?: number | null
        }
        Relationships: []
      }
      webhook_api_keys: {
        Row: {
          api_key: string
          created_at: string
          id: string
          is_active: boolean | null
          key_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          key_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          key_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      increment_app_error_count: {
        Args: { target_app_id: string; target_user_id: string }
        Returns: undefined
      }
      increment_app_warning_count: {
        Args: { target_app_id: string; target_user_id: string }
        Returns: undefined
      }
      increment_environment_counts: {
        Args: {
          target_app_id: string
          target_environment: string
          target_level: string
          target_user_id: string
        }
        Returns: undefined
      }
      initialize_default_owasp_items: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      initialize_edge_functions: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      normalize_environment_name: {
        Args: { env_name: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
