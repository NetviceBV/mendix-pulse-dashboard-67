import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { User, Lock, Shield, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { User as SupabaseUser, Session } from '@supabase/supabase-js';

interface SignInProps {
  onAuthSuccess: (user: SupabaseUser, session: Session) => void;
}

const SignIn = ({ onAuthSuccess }: SignInProps) => {
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [credentials, setCredentials] = useState({
    email: "",
    password: ""
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!credentials.email || !credentials.password) {
      toast({
        title: "Missing credentials",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    
    try {
      if (isSignUpMode) {
        const { data, error } = await supabase.auth.signUp({
          email: credentials.email,
          password: credentials.password,
          options: {
            emailRedirectTo: `${window.location.origin}/`
          }
        });

        if (error) throw error;

        if (data.user && data.session) {
          onAuthSuccess(data.user, data.session);
          toast({
            title: "Account created successfully",
            description: "Welcome to MendixOps!"
          });
        } else {
          toast({
            title: "Check your email",
            description: "Please verify your email address to complete registration"
          });
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: credentials.email,
          password: credentials.password
        });

        if (error) throw error;

        if (data.user && data.session) {
          onAuthSuccess(data.user, data.session);
          toast({
            title: "Successfully signed in",
            description: "Loading your Mendix applications..."
          });
        }
      }
    } catch (error: any) {
      toast({
        title: isSignUpMode ? "Sign up failed" : "Sign in failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md bg-gradient-card shadow-card border-border">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 bg-gradient-primary rounded-xl flex items-center justify-center shadow-glow">
            <Shield className="w-6 h-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold">
            {isSignUpMode ? "Sign Up" : "Sign In"}
          </CardTitle>
          <CardDescription>
            {isSignUpMode ? "Create an account to manage your Mendix applications" : "Sign in to manage your Mendix applications"}
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={credentials.email}
                  onChange={(e) => setCredentials({ ...credentials, email: e.target.value })}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={credentials.password}
                  onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-gradient-primary hover:opacity-90 transition-opacity shadow-glow"
              disabled={loading}
            >
              {loading ? (isSignUpMode ? "Creating account..." : "Signing in...") : (isSignUpMode ? "Sign Up" : "Sign In")}
            </Button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => setIsSignUpMode(!isSignUpMode)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {isSignUpMode ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default SignIn;