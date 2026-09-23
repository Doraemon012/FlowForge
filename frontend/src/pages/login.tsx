import { Link } from 'react-router-dom'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { LoginForm } from '@/components/auth/LoginForm'
import { OAuthButtons } from '@/components/auth/OAuthButtons'
import { useReturnPath } from '@/hooks/use-return-path'

export function LoginPage() {
  // Carried through the provider round-trip so a visitor who was turned away
  // from a protected page lands back on it after signing in socially, exactly
  // as they would after using the form below.
  const returnPath = useReturnPath()

  return (
    <AuthLayout
      title="Sign in"
      description="Enter your credentials to access FlowForge."
      footer={
        <>
          Don't have an account?{' '}
          <Link to="/signup" className="text-primary underline-offset-4 hover:underline">
            Create one
          </Link>
        </>
      }
    >
      <OAuthButtons next={returnPath ?? undefined} />
      <LoginForm />
    </AuthLayout>
  )
}
