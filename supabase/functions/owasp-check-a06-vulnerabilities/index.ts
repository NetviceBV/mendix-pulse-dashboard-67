import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { app_id, environment_name, user_id, expirationMonths = 3 } = await req.json();
    
    console.log(`[A06] Starting vulnerability check for app: ${app_id}, environment: ${environment_name}`);

    if (!app_id || !environment_name || !user_id) {
      return new Response(
        JSON.stringify({ 
          status: 'error', 
          details: 'Missing required parameters: app_id, environment_name, or user_id' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Find the production environment to verify it exists
    const { data: environment, error: envError } = await supabase
      .from('mendix_environments')
      .select('id, environment_name, url')
      .eq('app_id', app_id)
      .eq('user_id', user_id)
      .ilike('environment_name', environment_name)
      .maybeSingle();

    if (envError) {
      console.error(`[A06] Error fetching environment:`, envError);
      return new Response(
        JSON.stringify({ 
          status: 'error', 
          details: `Database error: ${envError.message}` 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    if (!environment) {
      console.log(`[A06] No ${environment_name} environment found for app ${app_id}`);
      return new Response(
        JSON.stringify({ 
          status: 'warning', 
          details: `No ${environment_name} environment found for this application. Cannot evaluate vulnerability status.` 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the latest completed vulnerability scan for this app/environment
    const { data: latestScan, error: scanError } = await supabase
      .from('vulnerability_scans')
      .select('*')
      .eq('app_id', app_id)
      .eq('user_id', user_id)
      .ilike('environment_name', environment_name)
      .eq('scan_status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (scanError) {
      console.error(`[A06] Error fetching vulnerability scans:`, scanError);
      return new Response(
        JSON.stringify({ 
          status: 'error', 
          details: `Database error: ${scanError.message}` 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // No scan exists
    if (!latestScan) {
      console.log(`[A06] No vulnerability scan found for app ${app_id}`);
      return new Response(
        JSON.stringify({ 
          status: 'warning', 
          details: 'No vulnerability scan has been performed for this environment. Run a vulnerability scan from the environment card to evaluate component security.',
          scanAge: null,
          vulnerabilityCounts: null
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check scan age
    const scanDate = new Date(latestScan.completed_at!);
    const now = new Date();
    const monthsDiff = (now.getFullYear() - scanDate.getFullYear()) * 12 + (now.getMonth() - scanDate.getMonth());
    const scanAgeMonths = monthsDiff;
    const scanExpired = scanAgeMonths >= expirationMonths;

    console.log(`[A06] Latest scan from ${latestScan.completed_at}, age: ${scanAgeMonths} months, expired: ${scanExpired}`);

    // If scan is too old, return warning
    if (scanExpired) {
      return new Response(
        JSON.stringify({ 
          status: 'warning', 
          details: `Vulnerability scan is ${scanAgeMonths} months old (last scan: ${scanDate.toLocaleDateString()}). A new scan is recommended within the ${expirationMonths}-month recertification period.`,
          scanAge: scanAgeMonths,
          lastScanDate: latestScan.completed_at,
          vulnerabilityCounts: {
            total: latestScan.total_vulnerabilities,
            vulnerable_jars: latestScan.vulnerable_jars,
            clean_jars: latestScan.clean_jars,
            total_jars: latestScan.total_jars
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get vulnerability findings to count by severity
    const { data: findings, error: findingsError } = await supabase
      .from('vulnerability_findings')
      .select('severity, cvss_score')
      .eq('scan_id', latestScan.id);

    if (findingsError) {
      console.error(`[A06] Error fetching findings:`, findingsError);
    }

    // Count vulnerabilities by severity
    const severityCounts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      unknown: 0
    };

    (findings || []).forEach(finding => {
      const severity = (finding.severity || 'unknown').toLowerCase();
      if (severity === 'critical') severityCounts.critical++;
      else if (severity === 'high') severityCounts.high++;
      else if (severity === 'medium' || severity === 'moderate') severityCounts.medium++;
      else if (severity === 'low') severityCounts.low++;
      else severityCounts.unknown++;
    });

    console.log(`[A06] Severity counts:`, severityCounts);

    const vulnerabilityCounts = {
      total: latestScan.total_vulnerabilities,
      vulnerable_jars: latestScan.vulnerable_jars,
      clean_jars: latestScan.clean_jars,
      total_jars: latestScan.total_jars,
      bySeverity: severityCounts
    };

    // Determine status based on vulnerabilities
    if (severityCounts.critical > 0 || severityCounts.high > 0) {
      console.log(`[A06] FAIL - Critical/High vulnerabilities found`);
      return new Response(
        JSON.stringify({ 
          status: 'fail', 
          details: `Found ${severityCounts.critical} critical and ${severityCounts.high} high severity vulnerabilities. These should be addressed immediately. Last scan: ${scanDate.toLocaleDateString()}.`,
          scanAge: scanAgeMonths,
          lastScanDate: latestScan.completed_at,
          vulnerabilityCounts
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (severityCounts.medium > 0) {
      console.log(`[A06] WARNING - Medium vulnerabilities found`);
      return new Response(
        JSON.stringify({ 
          status: 'warning', 
          details: `Found ${severityCounts.medium} medium severity vulnerabilities. Consider updating these components. Last scan: ${scanDate.toLocaleDateString()}.`,
          scanAge: scanAgeMonths,
          lastScanDate: latestScan.completed_at,
          vulnerabilityCounts
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // No critical/high/medium vulnerabilities
    console.log(`[A06] PASS - No significant vulnerabilities found`);
    return new Response(
      JSON.stringify({ 
        status: 'pass', 
        details: `No critical, high, or medium severity vulnerabilities found. ${latestScan.clean_jars} of ${latestScan.total_jars} libraries are clean. Last scan: ${scanDate.toLocaleDateString()}.`,
        scanAge: scanAgeMonths,
        lastScanDate: latestScan.completed_at,
        vulnerabilityCounts
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[A06] Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        status: 'error', 
        details: `Unexpected error: ${error.message}` 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
