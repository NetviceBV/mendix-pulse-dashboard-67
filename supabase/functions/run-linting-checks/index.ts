import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getErrorMessage } from '../_shared/error-utils.ts'

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

    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!)
    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { credentialId, appId } = await req.json()
    if (!credentialId || !appId) {
      return new Response(JSON.stringify({ error: 'Missing credentialId or appId' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const analyzerBaseUrl = Deno.env.get('MENDIX_ANALYZER_BASE_URL')
    const analyzerApiKey = Deno.env.get('MENDIX_ANALYZER_API_KEY')
    if (!analyzerBaseUrl || !analyzerApiKey) {
      return new Response(JSON.stringify({ error: 'Analyzer API not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1. Fetch credential
    const { data: credential, error: credError } = await supabase
      .from('mendix_credentials')
      .select('*')
      .eq('id', credentialId)
      .eq('user_id', user.id)
      .single()

    if (credError || !credential) {
      return new Response(JSON.stringify({ error: 'Credential not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Collect enabled rule IDs (global policies + per-app overrides)
    const { data: policies, error: polError } = await supabase
      .from('linting_policies')
      .select('id, rule_id, is_enabled')
      .eq('user_id', user.id)

    if (polError) throw polError

    const { data: overrides, error: ovrError } = await supabase
      .from('linting_policy_overrides')
      .select('policy_id, is_enabled')
      .eq('user_id', user.id)
      .eq('app_id', appId)

    if (ovrError) throw ovrError

    const overrideMap = new Map<string, boolean>()
    overrides?.forEach(o => overrideMap.set(o.policy_id, o.is_enabled))

    const enabledRuleIds: string[] = []
    policies?.forEach(p => {
      const isEnabled = overrideMap.has(p.id) ? overrideMap.get(p.id)! : p.is_enabled
      if (isEnabled) enabledRuleIds.push(p.rule_id)
    })

    if (enabledRuleIds.length === 0) {
      return new Response(JSON.stringify({ error: 'No linting rules are enabled. Enable rules in Settings > Linting Rules.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`Running linting for app ${appId} with ${enabledRuleIds.length} rules`)

    // 3. Create linting_runs row
    const { data: run, error: runError } = await supabase
      .from('linting_runs')
      .insert({
        app_id: appId,
        user_id: user.id,
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (runError || !run) {
      throw new Error(`Failed to create linting run: ${runError?.message}`)
    }

    // 4. Return immediate response and process in background
    const backgroundTask = (async () => {
      try {
        const baseUrl = analyzerBaseUrl.replace(/\/$/, '')
        let analyzerResponse: any = null
        let usedEndpoint = ''

        // Try Git first (if pat is available)
        if (credential.pat) {
          try {
            console.log('Trying Git endpoint...')
            const gitRes = await fetch(`${baseUrl}/analyze-mpr/git`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-API-Key': analyzerApiKey,
              },
              body: JSON.stringify({
                projectId: appId,
                username: credential.username,
                pat: credential.pat,
                reportFormat: 'json',
                policies: enabledRuleIds,
              }),
            })

            if (gitRes.ok) {
              analyzerResponse = await gitRes.json()
              usedEndpoint = 'git'
              console.log('Git endpoint succeeded')
            } else {
              const errText = await gitRes.text()
              console.log(`Git endpoint failed (${gitRes.status}): ${errText}, falling back to SVN`)
            }
          } catch (e) {
            console.log(`Git endpoint error: ${getErrorMessage(e)}, falling back to SVN`)
          }
        } else {
          console.log('No PAT available, skipping Git endpoint')
        }

        // SVN fallback
        if (!analyzerResponse) {
          console.log('Trying SVN endpoint...')
          const svnRes = await fetch(`${baseUrl}/analyze-mpr/svn`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': analyzerApiKey,
            },
            body: JSON.stringify({
              projectId: appId,
              username: credential.username,
              password: credential.api_key,
              reportFormat: 'json',
              policies: enabledRuleIds,
            }),
          })

          if (!svnRes.ok) {
            const errText = await svnRes.text()
            console.error(`SVN endpoint failed (${svnRes.status}): ${errText}`)

            await supabase
              .from('linting_runs')
              .update({ status: 'failed', completed_at: new Date().toISOString() })
              .eq('id', run.id)

            return
          }

          analyzerResponse = await svnRes.json()
          usedEndpoint = 'svn'
          console.log('SVN endpoint succeeded')
        }

        // 5. Parse response and store results
        const mxlint = analyzerResponse.mxlint
        if (!mxlint) {
          await supabase
            .from('linting_runs')
            .update({ status: 'failed', completed_at: new Date().toISOString() })
            .eq('id', run.id)
          return
        }

        // Build set of violated rule numbers
        const violatedRules = new Map<string, string>()
        mxlint.violations?.forEach((v: any) => {
          const pathMatch = v.rule?.match(/(\d{3}_\d{4})/)
          if (pathMatch) {
            violatedRules.set(pathMatch[1], v.message || '')
          }
        })

        // Map rules to linting_results rows
        const resultRows = (mxlint.rules || []).map((rule: any) => {
          const isFailed = violatedRules.has(rule.ruleNumber)
          const pathMatch = rule.path?.match(/\/(\d{3}_[^/]+)\//)
          const chapter = pathMatch ? pathMatch[1] : rule.category || 'unknown'

          return {
            run_id: run.id,
            app_id: appId,
            user_id: user.id,
            rule_name: rule.title,
            rule_description: rule.description || null,
            severity: rule.severity || null,
            status: isFailed ? 'fail' : 'pass',
            details: isFailed ? violatedRules.get(rule.ruleNumber) || null : null,
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

        // 6. Update linting_runs with summary
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

        console.log(`Linting completed: ${summary.passed} passed, ${summary.failed} failed (${usedEndpoint})`)
      } catch (error) {
        console.error('Background linting task failed:', error)
        await supabase
          .from('linting_runs')
          .update({ status: 'failed', completed_at: new Date().toISOString() })
          .eq('id', run.id)
      }
    })()

    // Use EdgeRuntime.waitUntil if available, otherwise fire-and-forget
    try {
      // @ts-ignore - EdgeRuntime may not be typed
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(backgroundTask)
      }
    } catch {
      // fire-and-forget fallback - the promise continues running
    }

    return new Response(JSON.stringify({
      success: true,
      runId: run.id,
      status: 'started',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error running linting checks:', error)
    return new Response(JSON.stringify({ error: getErrorMessage(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
