import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getErrorMessage } from '../_shared/error-utils.ts'
import { pingRailwayHealth } from '../_shared/railway-utils.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify user
    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!)
    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const analyzerBaseUrl = Deno.env.get('MENDIX_ANALYZER_BASE_URL')
    const analyzerApiKey = Deno.env.get('MENDIX_ANALYZER_API_KEY')

    if (!analyzerBaseUrl || !analyzerApiKey) {
      return new Response(JSON.stringify({ error: 'Analyzer API not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Wake up Railway container before making the real request
    await pingRailwayHealth(analyzerBaseUrl, analyzerApiKey)

    // Call the Analyzer /policies endpoint
    const policiesUrl = `${analyzerBaseUrl.replace(/\/$/, '')}/policies`
    console.log(`Fetching policies from: ${policiesUrl}`)

    const response = await fetch(policiesUrl, {
      method: 'GET',
      headers: { 'X-API-Key': analyzerApiKey },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Analyzer API error: ${response.status} - ${errorText}`)
      return new Response(JSON.stringify({ error: `Analyzer API returned ${response.status}`, details: errorText }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const policiesData = await response.json()
    const categories = policiesData.categories || []
    console.log(`Received ${categories.length} categories, totalRules: ${policiesData.totalRules}`)

    const rows: Array<{
      user_id: string
      rule_id: string
      category: string
      title: string
      description: string | null
      severity: string | null
      is_enabled: boolean
      directory: string | null
    }> = []

    for (const cat of categories) {
      const categoryId = cat.id
      const categoryDirectory = cat.directory || null
      for (const rule of (cat.rules || [])) {
        rows.push({
          user_id: user.id,
          rule_id: rule.id,
          category: categoryId,
          title: rule.title,
          description: rule.description || null,
          severity: rule.severity || null,
          is_enabled: true,
          directory: categoryDirectory,
        })
      }
    }

    console.log(`Parsed ${rows.length} total rules`)

    if (rows.length > 0) {
      // Fetch all existing rule_ids for this user in one query
      const { data: existingRules, error: fetchExistingError } = await supabase
        .from('linting_policies')
        .select('rule_id')
        .eq('user_id', user.id)

      if (fetchExistingError) {
        console.error('Error fetching existing rules:', fetchExistingError)
      }

      const existingRuleIds = new Set((existingRules || []).map(r => r.rule_id))

      const newRows = rows.filter(r => !existingRuleIds.has(r.rule_id))
      const existingRows = rows.filter(r => existingRuleIds.has(r.rule_id))

      console.log(`New rules: ${newRows.length}, Existing rules to update metadata: ${existingRows.length}`)

      // Insert new rules with is_enabled: true (default)
      if (newRows.length > 0) {
        const { error: insertError } = await supabase
          .from('linting_policies')
          .insert(newRows)
        if (insertError) {
          console.error('Insert error:', insertError)
        }
      }

      // Update existing rules: metadata only, preserve is_enabled
      for (const row of existingRows) {
        const { error: updateError } = await supabase
          .from('linting_policies')
          .update({
            category: row.category,
            title: row.title,
            description: row.description,
            severity: row.severity,
            directory: row.directory,
          })
          .eq('user_id', user.id)
          .eq('rule_id', row.rule_id)
        if (updateError) {
          console.error(`Update error for ${row.rule_id}:`, updateError)
        }
      }
    }

    // Remove rules that no longer exist in the API
    const currentRuleIds = rows.map(r => r.rule_id)
    if (currentRuleIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('linting_policies')
        .delete()
        .eq('user_id', user.id)
        .not('rule_id', 'in', `(${currentRuleIds.join(',')})`)

      if (deleteError) {
        console.error('Cleanup error:', deleteError)
      }
    }

    // Fetch all policies for this user
    const { data: allPolicies, error: fetchError } = await supabase
      .from('linting_policies')
      .select('*')
      .eq('user_id', user.id)
      .order('directory')
      .order('rule_id')

    if (fetchError) {
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ policies: allPolicies, fetched: rows.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: getErrorMessage(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
