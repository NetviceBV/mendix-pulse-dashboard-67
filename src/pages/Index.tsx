import { useState } from "react";
import SignIn from "./SignIn";
import Dashboard from "./Dashboard";
import { MendixCredential } from "@/components/MendixCredentials";

const Index = () => {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [userCredentials, setUserCredentials] = useState<{
    username: string;
    password: string;
  } | null>(null);
  const [mendixCredentials, setMendixCredentials] = useState<MendixCredential[]>([]);

  const handleSignIn = (credentials: { username: string; password: string }) => {
    setUserCredentials(credentials);
    setIsSignedIn(true);
  };

  const handleSignOut = () => {
    setIsSignedIn(false);
    setUserCredentials(null);
    setMendixCredentials([]);
  };

  if (!isSignedIn) {
    return <SignIn onSignIn={handleSignIn} />;
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
