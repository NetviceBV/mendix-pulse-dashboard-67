

## Remove Sign Up - Sign In Only

### Overview
Remove the self-registration functionality to make the app invitation-only. Users can only sign in or reset their password - no new account creation from the login page.

### Changes

**`src/pages/SignIn.tsx`** -- Simplify to sign-in only:

1. **Remove mode state** - Remove the `mode` state and `'signup'` option, keep only sign-in and forgot password
2. **Remove signup UI** - Delete the full name input field and the "Don't have an account? Sign up" button
3. **Simplify handleSubmit** - Remove the signup branch from the form submission handler
4. **Clean up rendering** - Remove conditional rendering for signup mode

### What Gets Removed
- The toggle button between sign-in and sign-up
- The "Already have an account? Sign in" / "Don't have an account? Sign up" text
- The full name input field (only needed for registration)
- All signup API calls and error handling

### What Stays
- Sign in form (email + password)
- Forgot password flow (click "Forgot password?" → enter email → get reset link)
- "Back to sign in" link on forgot password page

