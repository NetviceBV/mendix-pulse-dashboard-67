import { supabase } from "@/integrations/supabase/client";

const FIVE_MONTHS_MS = 5 * 30 * 24 * 60 * 60 * 1000;

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickIndices(total: number, count: number): Set<number> {
  const set = new Set<number>();
  while (set.size < count && set.size < total) {
    set.add(randomInt(0, total - 1));
  }
  return set;
}

function generateTimestamps(end: Date, count: number): Date[] {
  const endMs = end.getTime();
  const startMs = endMs - FIVE_MONTHS_MS;
  const ts: number[] = [];
  for (let i = 0; i < count; i++) {
    ts.push(randomInt(startMs, endMs - 1));
  }
  ts.sort((a, b) => a - b);
  return ts.map((t) => new Date(t));
}

const FALLBACK_RULES = [
  { chapter: "Domain Model", rule_name: "No anonymous access", severity: "high", description: "Entities should not allow anonymous access without XPath." },
  { chapter: "Domain Model", rule_name: "Index on association", severity: "medium", description: "Associations should have proper indexes." },
  { chapter: "Domain Model", rule_name: "No System.User reference", severity: "low", description: "Avoid direct references to System.User." },
  { chapter: "Microflows", rule_name: "No empty microflows", severity: "low", description: "Microflows should not be empty." },
  { chapter: "Microflows", rule_name: "Error handling configured", severity: "high", description: "All microflow activities should have error handling." },
  { chapter: "Microflows", rule_name: "No hardcoded values", severity: "medium", description: "Avoid hardcoded constants in microflows." },
  { chapter: "Pages", rule_name: "Accessibility labels", severity: "medium", description: "Form inputs need accessibility labels." },
  { chapter: "Pages", rule_name: "No deprecated widgets", severity: "high", description: "Avoid using deprecated widgets." },
  { chapter: "Security", rule_name: "Module roles defined", severity: "high", description: "All modules must define user roles." },
  { chapter: "Security", rule_name: "No anonymous module access", severity: "high", description: "Modules should restrict anonymous access." },
];

export async function seedLintingHistoryForApp(userId: string, appId: string) {
  // Load rule set from linting_policies, fall back to defaults
  const { data: policies } = await supabase
    .from("linting_policies")
    .select("rule_id, title, category, severity, description")
    .eq("user_id", userId)
    .limit(50);

  const rules =
    policies && policies.length > 0
      ? policies.map((p: any) => ({
          chapter: p.category || "General",
          rule_name: p.title || p.rule_id,
          severity: p.severity || "info",
          description: p.description || "",
        }))
      : FALLBACK_RULES;

  // Determine end of window: just before oldest existing run, else now
  const { data: oldestExisting } = await supabase
    .from("linting_runs")
    .select("started_at")
    .eq("user_id", userId)
    .eq("app_id", appId)
    .order("started_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const end = oldestExisting?.started_at
    ? new Date(new Date(oldestExisting.started_at).getTime() - 60_000)
    : new Date();

  const timestamps = generateTimestamps(end, 15);
  const greenIndices = pickIndices(15, 4);

  for (let i = 0; i < timestamps.length; i++) {
    const started = timestamps[i];
    const completed = new Date(started.getTime() + 30_000);
    const isGreen = greenIndices.has(i);

    const total = rules.length;
    const ruleStatuses: ("pass" | "fail" | "warning")[] = rules.map(() => {
      if (isGreen) return "pass";
      const r = Math.random();
      if (r < 0.7) return "pass";
      if (r < 0.9) return "fail";
      return "warning";
    });
    const passed = ruleStatuses.filter((s) => s === "pass").length;
    const failed = ruleStatuses.filter((s) => s === "fail").length;

    const { data: runRow, error: runErr } = await supabase
      .from("linting_runs")
      .insert({
        user_id: userId,
        app_id: appId,
        status: "completed",
        started_at: started.toISOString(),
        completed_at: completed.toISOString(),
        total_rules: total,
        passed_rules: passed,
        failed_rules: failed,
      })
      .select("id")
      .single();

    if (runErr || !runRow) {
      console.error("Failed to insert linting run", runErr);
      continue;
    }

    const resultRows = rules.map((r, idx) => ({
      user_id: userId,
      app_id: appId,
      run_id: runRow.id,
      chapter: r.chapter,
      rule_name: r.rule_name,
      rule_description: r.description,
      status: ruleStatuses[idx],
      severity: r.severity,
      details: ruleStatuses[idx] === "pass" ? "" : `Sample ${ruleStatuses[idx]} detail for ${r.rule_name}`,
      checked_at: started.toISOString(),
    }));

    const { error: resErr } = await supabase.from("linting_results").insert(resultRows);
    if (resErr) console.error("Failed to insert linting results", resErr);
  }
}

export async function seedOwaspHistoryForApp(userId: string, appId: string) {
  // Ensure owasp_items exist for user
  let { data: items } = await supabase
    .from("owasp_items")
    .select("id, owasp_id, is_active")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (!items || items.length === 0) {
    await supabase.rpc("initialize_default_owasp_items", { target_user_id: userId });
    const refetch = await supabase
      .from("owasp_items")
      .select("id, owasp_id, is_active")
      .eq("user_id", userId)
      .eq("is_active", true);
    items = refetch.data || [];
  }

  if (!items || items.length === 0) return;

  // Ensure each item has at least one step (any state)
  const itemIds = items.map((i: any) => i.id);
  const { data: existingSteps } = await supabase
    .from("owasp_steps")
    .select("id, owasp_item_id")
    .in("owasp_item_id", itemIds);

  const stepByItem = new Map<string, string>();
  (existingSteps || []).forEach((s: any) => {
    if (!stepByItem.has(s.owasp_item_id)) stepByItem.set(s.owasp_item_id, s.id);
  });

  for (const item of items as any[]) {
    if (!stepByItem.has(item.id)) {
      const { data: newStep } = await supabase
        .from("owasp_steps")
        .insert({
          user_id: userId,
          owasp_item_id: item.id,
          step_name: "Automated check",
          edge_function_name: "noop",
          step_order: 1,
          is_active: true,
        })
        .select("id")
        .single();
      if (newStep) stepByItem.set(item.id, newStep.id);
    }
  }

  // End of window
  const { data: oldestRun } = await supabase
    .from("owasp_check_runs")
    .select("run_started_at")
    .eq("user_id", userId)
    .eq("app_id", appId)
    .order("run_started_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const end = oldestRun?.run_started_at
    ? new Date(new Date(oldestRun.run_started_at).getTime() - 60_000)
    : new Date();

  const timestamps = generateTimestamps(end, 20);
  const greenIndices = pickIndices(20, 4);

  const stepIds = Array.from(stepByItem.values());
  const total = stepIds.length;

  for (let i = 0; i < timestamps.length; i++) {
    const started = timestamps[i];
    const completed = new Date(started.getTime() + 30_000);
    const isGreen = greenIndices.has(i);

    const stepStatuses: ("pass" | "fail" | "warning")[] = stepIds.map(() => {
      if (isGreen) return "pass";
      const r = Math.random();
      if (r < 0.65) return "pass";
      if (r < 0.9) return "fail";
      return "warning";
    });
    const passed = stepStatuses.filter((s) => s === "pass").length;
    const failed = stepStatuses.filter((s) => s === "fail").length;
    const warning = stepStatuses.filter((s) => s === "warning").length;
    const overall = failed > 0 ? "fail" : warning > 0 ? "warning" : "pass";

    const { data: runRow, error: runErr } = await supabase
      .from("owasp_check_runs")
      .insert({
        user_id: userId,
        app_id: appId,
        environment_name: "Production",
        run_started_at: started.toISOString(),
        run_completed_at: completed.toISOString(),
        overall_status: overall,
        total_checks: total,
        passed_checks: passed,
        failed_checks: failed,
        warning_checks: warning,
      })
      .select("id")
      .single();

    if (runErr || !runRow) {
      console.error("Failed to insert owasp run", runErr);
      continue;
    }

    const resultRows = stepIds.map((stepId, idx) => ({
      user_id: userId,
      app_id: appId,
      environment_name: "Production",
      run_id: runRow.id,
      owasp_step_id: stepId,
      status: stepStatuses[idx],
      details: "",
      execution_time_ms: randomInt(50, 500),
      checked_at: started.toISOString(),
    }));

    const { error: resErr } = await supabase.from("owasp_check_results").insert(resultRows);
    if (resErr) console.error("Failed to insert owasp results", resErr);
  }
}

export async function seedAllAppsLinting(userId: string): Promise<{ ok: number; fail: number }> {
  const { data: apps } = await supabase
    .from("mendix_apps")
    .select("project_id")
    .eq("user_id", userId);
  let ok = 0;
  let fail = 0;
  for (const app of apps || []) {
    const pid = (app as any).project_id;
    if (!pid) continue;
    try {
      await seedLintingHistoryForApp(userId, pid);
      ok++;
    } catch (e) {
      console.error("Linting seed failed for", pid, e);
      fail++;
    }
  }
  return { ok, fail };
}

export async function seedAllAppsOwasp(userId: string): Promise<{ ok: number; fail: number }> {
  const { data: apps } = await supabase
    .from("mendix_apps")
    .select("project_id")
    .eq("user_id", userId);
  let ok = 0;
  let fail = 0;
  for (const app of apps || []) {
    const pid = (app as any).project_id;
    if (!pid) continue;
    try {
      await seedOwaspHistoryForApp(userId, pid);
      ok++;
    } catch (e) {
      console.error("OWASP seed failed for", pid, e);
      fail++;
    }
  }
  return { ok, fail };
}