import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getErrorMessage } from '../_shared/error-utils.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Validate webhook secret from query params
    const url = new URL(req.url)
    const secret = url.searchParams.get('secret')
    const runId = url.searchParams.get('runId')

    const expectedSecret = Deno.env.get('LINTING_WEBHOOK_SECRET')
    if (!expectedSecret || secret !== expectedSecret) {
      console.error('Invalid or missing webhook secret')
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!runId) {
      return new Response(JSON.stringify({ error: 'Missing runId query parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch the run to get app_id and user_id
    const { data: run, error: runError } = await supabase
      .from('linting_runs')
      .select('id, app_id, user_id, status')
      .eq('id', runId)
      .single()

    if (runError || !run) {
      console.error('Linting run not found:', runId)
      return new Response(JSON.stringify({ error: 'Run not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (run.status !== 'running') {
      console.log(`Run ${runId} is already ${run.status}, skipping`)
      return new Response(JSON.stringify({ success: true, message: 'Run already processed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Parse the analyzer response from the request body
    const analyzerResponse = await req.json()
    const mxlint = analyzerResponse.mxlint

    if (!mxlint) {
      console.error('No mxlint data in webhook payload')
      await supabase
        .from('linting_runs')
        .update({ status: 'failed', completed_at: new Date().toISOString() })
        .eq('id', run.id)

      return new Response(JSON.stringify({ success: false, error: 'No mxlint data' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Build set of violated rule numbers
    const violatedRules = new Map<string, string[]>()
    mxlint.violations?.forEach((v: any) => {
      const pathMatch = v.rule?.match(/(\d{3}_\d{4})/)
      if (pathMatch) {
        const key = pathMatch[1]
        if (!violatedRules.has(key)) violatedRules.set(key, [])
        const msg = (v.message || '').replace(/^\[.*?\]\s*/, '')
        violatedRules.get(key)!.push(msg)
      }
    })

    // Map rules to linting_results rows
    const resultRows = (mxlint.rules || []).map((rule: any) => {
      const isFailed = violatedRules.has(rule.ruleNumber)
      const pathMatch = rule.path?.match(/\/(\d{3}_[^/]+)\//)
      const chapter = pathMatch ? pathMatch[1] : rule.category || 'unknown'

      return {
        run_id: run.id,
        app_id: run.app_id,
        user_id: run.user_id,
        rule_name: rule.title,
        rule_description: rule.description || null,
        severity: rule.severity || null,
        status: isFailed ? 'fail' : 'pass',
        details: isFailed ? (violatedRules.get(rule.ruleNumber) || []).join('\n') || null : null,
        chapter,
        checked_at: new Date().toISOString(),
      }
    })

    if (resultRows.length > 0) {
      const { error: insertError } = await supabase
        .from('linting_results')
        .insert(resultRows)

      if (insertError) {
        console.error('Error inserting linting results:', insertError)
      }
    }

    // Update linting_runs with summary
    const summary = mxlint.summary || {}
    await supabase
      .from('linting_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        passed_rules: summary.passed ?? 0,
        failed_rules: summary.failed ?? 0,
        total_rules: summary.total ?? resultRows.length,
      })
      .eq('id', run.id)

    console.log(`Linting webhook processed: run ${runId}, ${summary.passed} passed, ${summary.failed} failed`)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Webhook processing error:', error)
    return new Response(JSON.stringify({ error: getErrorMessage(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
