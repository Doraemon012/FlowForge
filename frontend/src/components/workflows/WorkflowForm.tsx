import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ApiError } from '@/api/client'
import type { Workflow } from '@/api/types'
import { useCreateWorkflow } from '@/hooks/use-workflows'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const workflowSchema = z.object({
  name: z
    .string()
    .min(1, 'Workflow name is required')
    .max(200, 'Workflow name must be at most 200 characters'),
  description: z.string().max(500, 'Description must be at most 500 characters').optional(),
})

type WorkflowValues = z.infer<typeof workflowSchema>

interface WorkflowFormProps {
  projectId: string
  onSuccess?: (workflow: Workflow) => void
  onCancel?: () => void
}

export function WorkflowForm({ projectId, onSuccess, onCancel }: WorkflowFormProps) {
  const { mutateAsync, isPending } = useCreateWorkflow(projectId)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<WorkflowValues>({
    resolver: zodResolver(workflowSchema),
    defaultValues: { name: '', description: '' },
  })

  const onSubmit = async (values: WorkflowValues) => {
    setServerError(null)
    try {
      const workflow = await mutateAsync({
        name: values.name.trim(),
        description: values.description?.trim() ?? '',
      })
      onSuccess?.(workflow)
    } catch (error) {
      if (error instanceof ApiError) {
        setServerError(error.message)
      } else {
        setServerError('Something went wrong. Please try again.')
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="workflow-name">Name</Label>
        <Input
          id="workflow-name"
          placeholder="My workflow"
          autoComplete="off"
          aria-invalid={errors.name ? true : undefined}
          {...register('name')}
        />
        {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="workflow-description">Description</Label>
        <Input
          id="workflow-description"
          placeholder="What does this workflow do?"
          autoComplete="off"
          aria-invalid={errors.description ? true : undefined}
          {...register('description')}
        />
        {errors.description ? (
          <p className="text-sm text-destructive">{errors.description.message}</p>
        ) : null}
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
          Create workflow
        </Button>
      </div>
    </form>
  )
}
