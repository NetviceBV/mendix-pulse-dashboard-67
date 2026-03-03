import { useState, useEffect, useCallback } from "react";
import SignIn from "./SignIn";
import Dashboard from "./Dashboard";
import { supabase } from "@/integrations/supabase/client";
import { User as SupabaseUser, Session } from '@supabase/supabase-js';
import { useInactivityTimeout } from "@/hooks/useInactivityTimeout";
import { useInactivitySettings } from "@/hooks/useInactivitySettings";
import { toast } from "@/hooks/use-toast";

const Index = () => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuthSuccess = (user: SupabaseUser, session: Session) => {
    setUser(user);
    setSession(session);
  };

  const handleSignOut = useCallback(async () => {
    sessionStorage.removeItem('mendix-apps-synced');
    await supabase.auth.signOut();
  }, []);

  const isAuthenticated = !!user && !!session;
  const { timeoutMinutes } = useInactivitySettings();

  const handleInactivityWarning = useCallback(() => {
    toast({
      title: "Session expiring soon",
      description: "You will be logged out in 1 minute due to inactivity.",
    });
  }, []);

  const handleInactivityTimeout = useCallback(() => {
    toast({
      title: "Session expired",
      description: "You have been logged out due to inactivity.",
    });
    handleSignOut();
  }, [handleSignOut]);

  useInactivityTimeout({
    timeoutMs: timeoutMinutes * 60000,
    warningMs: 60000,
    onWarning: handleInactivityWarning,
    onTimeout: handleInactivityTimeout,
    enabled: isAuthenticated,
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || !session) {
    return <SignIn onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <Dashboard 
      onSignOut={handleSignOut} 
    />
  );
};

export default Index;
