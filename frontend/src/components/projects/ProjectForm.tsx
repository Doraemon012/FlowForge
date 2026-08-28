import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ApiError } from '@/api/client'
import type { Project } from '@/api/types'
import { useCreateProject } from '@/hooks/use-projects'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const projectSchema = z.object({
  name: z
    .string()
    .min(1, 'Project name is required')
    .max(100, 'Project name must be at most 100 characters'),
})

type ProjectValues = z.infer<typeof projectSchema>

interface ProjectFormProps {
  onSuccess?: (project: Project) => void
  onCancel?: () => void
}

export function ProjectForm({ onSuccess, onCancel }: ProjectFormProps) {
  const { mutateAsync, isPending } = useCreateProject()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProjectValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: { name: '' },
  })

  const onSubmit = async (values: ProjectValues) => {
    setServerError(null)
    try {
      const project = await mutateAsync({ name: values.name.trim() })
      onSuccess?.(project)
    } catch (error) {
      if (error instanceof ApiError && error.code === 'project_name_unavailable') {
        setServerError('A project with this name could not be created. Try a different name.')
      } else if (error instanceof ApiError) {
        setServerError(error.message)
      } else {
        setServerError('Something went wrong. Please try again.')
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="project-name">Name</Label>
        <Input
          id="project-name"
          placeholder="My project"
          autoComplete="off"
          aria-invalid={errors.name ? true : undefined}
          {...register('name')}
        />
        {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
      </div>

      {serverError ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {serverError}
        </div>
      ) : null}

      <div className="flex justify-end gap-2 pt-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" loading={isPending}>
          Create project
        </Button>
      </div>
    </form>
  )
}
