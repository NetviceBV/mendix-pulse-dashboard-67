import { useState, useEffect } from "react";
import SignIn from "./SignIn";
import Dashboard from "./Dashboard";
import { MendixCredential } from "@/components/MendixCredentials";
import { supabase } from "@/integrations/supabase/client";
import { User as SupabaseUser, Session } from '@supabase/supabase-js';

const Index = () => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [mendixCredentials, setMendixCredentials] = useState<MendixCredential[]>([]);
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

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setMendixCredentials([]);
  };

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
      mendixCredentials={mendixCredentials}
      onMendixCredentialsChange={setMendixCredentials}
    />
  );
};

export default Index;
