import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const signupSchema = z.object({
  displayName: z.string().min(1, 'Display name is required').max(100, 'Display name must be at most 100 characters'),
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required').min(8, 'Password must be at least 8 characters'),
})

type SignupValues = z.infer<typeof signupSchema>

export function SignupForm() {
  const navigate = useNavigate()
  const { signup } = useAuth()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { displayName: '', email: '', password: '' },
  })

  const onSubmit = async (values: SignupValues) => {
    setServerError(null)
    try {
      await signup({
        display_name: values.displayName,
        email: values.email,
        password: values.password,
      })
      navigate('/app', { replace: true })
    } catch (error) {
      if (error instanceof ApiError && error.code === 'email_unavailable') {
        setServerError('An account with this email already exists.')
      } else if (error instanceof ApiError) {
        setServerError(error.message)
      } else {
        setServerError('Something went wrong. Please try again.')
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="auth-form" noValidate>
      <div className="field">
        <label htmlFor="displayName">Display name</label>
        <Input
          id="displayName"
          type="text"
          placeholder="Jane Doe"
          autoComplete="name"
          aria-invalid={errors.displayName ? true : undefined}
          {...register('displayName')}
        />
        {errors.displayName ? <p className="help" style={{ color: 'var(--failed)' }}>{errors.displayName.message}</p> : null}
      </div>

      <div className="field">
        <label htmlFor="email">Email</label>
        <Input
          id="email"
          type="email"
          placeholder="you@company.com"
          autoComplete="email"
          aria-invalid={errors.email ? true : undefined}
          {...register('email')}
        />
        {errors.email ? <p className="help" style={{ color: 'var(--failed)' }}>{errors.email.message}</p> : null}
      </div>

      <div className="field">
        <label htmlFor="password">Password</label>
        <Input
          id="password"
          type="password"
          placeholder="••••••••"
          autoComplete="new-password"
          aria-invalid={errors.password ? true : undefined}
          {...register('password')}
        />
        <p className="help">At least 8 characters.</p>
        {errors.password ? <p className="help" style={{ color: 'var(--failed)' }}>{errors.password.message}</p> : null}
      </div>

      {serverError ? (
        <div
          role="alert"
          className="rounded-md border border-failed/30 bg-failed/5 px-3 py-2 text-sm text-failed"
        >
          {serverError}
        </div>
      ) : null}

      <Button type="submit" className="w-full justify-center" loading={isSubmitting}>
        Create account
      </Button>
    </form>
  )
}
