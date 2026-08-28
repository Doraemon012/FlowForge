import { Link } from 'react-router-dom'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { LoginForm } from '@/components/auth/LoginForm'

export function LoginPage() {
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
      <LoginForm />
    </AuthLayout>
  )
}
