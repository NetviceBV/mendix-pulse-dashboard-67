import { useState } from "react";
import SignIn from "./SignIn";
import Dashboard from "./Dashboard";

const Index = () => {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [userCredentials, setUserCredentials] = useState<{
    username: string;
    apiKey: string;
    pat: string;
  } | null>(null);

  const handleSignIn = (credentials: { username: string; apiKey: string; pat: string }) => {
    setUserCredentials(credentials);
    setIsSignedIn(true);
  };

  const handleSignOut = () => {
    setIsSignedIn(false);
    setUserCredentials(null);
  };

  if (!isSignedIn) {
    return <SignIn onSignIn={handleSignIn} />;
  }

  return <Dashboard onSignOut={handleSignOut} />;
};

export default Index;
