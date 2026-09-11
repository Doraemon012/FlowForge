import { Link } from 'react-router-dom'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { SignupForm } from '@/components/auth/SignupForm'
import { StartTrialButton } from '@/components/auth/StartTrialButton'

export function SignupPage() {
  return (
    <AuthLayout
      title="Create account"
      description="Create an account to keep your work. Or start a trial and look around first — no signup required."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm />

      <p className="my-4 text-center text-xs uppercase tracking-wide text-muted-foreground">
        or
      </p>

      <div className="space-y-2">
        <StartTrialButton
          variant="outline"
          className="w-full justify-center"
          label="Try without signing up"
        />
        <p className="help text-center">
          A disposable workspace with the whole product and 10 free AI actions. No email required.
        </p>
      </div>
    </AuthLayout>
  )
}
