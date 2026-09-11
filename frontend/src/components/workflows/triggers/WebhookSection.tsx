import { useState } from 'react'
import { Copy, Link2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import type { CreatedWebhook } from '@/api/types'
import {
  useCreateWebhook,
  useDeleteWebhook,
  useSetWebhookEnabled,
  useWebhooks,
} from '@/hooks/use-triggers'
import { useWorkflow } from '@/hooks/use-workflows'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatDateTime } from '@/lib/utils'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

function absoluteWebhookUrl(path: string): string {
  const base = API_BASE || (typeof window === 'undefined' ? '' : window.location.origin)
  return `${base}${path}`
}

function generateSecret(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(`${label} copied`)
  } catch {
    toast.error('Could not copy to the clipboard.')
  }
}

interface WebhookSectionProps {
  projectId: string
  workflowId: string
}

/**
 * Webhook trigger management. Webhooks are created with a signing secret that
 * is shown once; the server stores it and verifies HMAC-SHA256 signatures on
 * every delivery.
 */
export function WebhookSection({ projectId, workflowId }: WebhookSectionProps) {
  const webhooksQuery = useWebhooks(projectId, workflowId)
  const workflowQuery = useWorkflow(projectId, workflowId)
  const createMutation = useCreateWebhook(projectId, workflowId)
  const toggleMutation = useSetWebhookEnabled(projectId, workflowId)
  const deleteMutation = useDeleteWebhook(projectId, workflowId)

  const [creating, setCreating] = useState(false)
  const [secret, setSecret] = useState('')
  const [created, setCreated] = useState<CreatedWebhook | null>(null)

  const webhooks = webhooksQuery.data ?? []
  const isActive = Boolean(workflowQuery.data?.active_version_id)

  const reportError = (error: unknown, fallback: string) => {
    if (error instanceof ApiError) {
      toast.error(error.message)
    } else {
      toast.error(fallback)
    }
  }

  const openCreate = () => {
    setSecret(generateSecret())
    setCreated(null)
    setCreating(true)
  }

  const handleCreate = async () => {
    if (!secret.trim()) return
    try {
      const result = await createMutation.mutateAsync(secret.trim())
      setCreated(result)
      setCreating(false)
      toast.success('Webhook created')
    } catch (error) {
      reportError(error, 'Could not create the webhook.')
    }
  }

  const handleToggle = async (webhookId: string, enabled: boolean) => {
    try {
      await toggleMutation.mutateAsync({ webhookId, enabled })
      toast.success(enabled ? 'Webhook enabled' : 'Webhook disabled')
    } catch (error) {
      reportError(error, 'Could not change the webhook state.')
    }
  }

  const handleDelete = async (webhookId: string) => {
    try {
      await deleteMutation.mutateAsync(webhookId)
      toast.success('Webhook deleted')
    } catch (error) {
      reportError(error, 'Could not delete the webhook.')
    }
  }

  return (
    <section className="space-y-3" aria-labelledby="webhooks-heading">
      <div className="flex items-start gap-2">
        <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div>
          <h3 id="webhooks-heading" className="text-sm font-semibold">
            Webhooks
          </h3>
          <p className="text-xs text-muted-foreground">
            Start a run by POSTing a signed payload to the webhook URL. It triggers the active
            version.
          </p>
        </div>
      </div>

      {!isActive ? (
        <p className="text-xs text-warning">
          No active version — deliveries will be rejected until you publish and activate one.
        </p>
      ) : null}

      {created ? (
        <div className="space-y-2 rounded-lg border border-accent/40 bg-accent/10 p-3">
          <p className="text-sm font-medium">Webhook created — copy the secret now</p>
          <p className="text-xs text-muted-foreground">
            The secret is only shown once. Use it to sign deliveries.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto whitespace-nowrap rounded bg-background px-2 py-1 font-mono text-xs">
              {created.secret}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => copyText(created.secret, 'Secret')}
              aria-label="Copy webhook secret"
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto whitespace-nowrap rounded bg-background px-2 py-1 font-mono text-xs">
              {absoluteWebhookUrl(created.url)}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => copyText(absoluteWebhookUrl(created.url), 'URL')}
              aria-label="Copy webhook URL"
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setCreated(null)}>
            Done
          </Button>
        </div>
      ) : null}

      {creating ? (
        <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
          <div className="space-y-1.5">
            <Label htmlFor="webhook-secret">Signing secret</Label>
            <div className="flex items-center gap-2">
              <Input
                id="webhook-secret"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                className="font-mono"
                spellCheck={false}
                autoComplete="off"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSecret(generateSecret())}
                aria-label="Generate a new secret"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleCreate} loading={createMutation.isPending}>
              Create webhook
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setCreating(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {webhooksQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading webhooks…</p>
      ) : null}

      {!webhooksQuery.isLoading && webhooks.length === 0 && !creating && !created ? (
        <p className="text-sm text-muted-foreground">No webhooks yet.</p>
      ) : null}

      {webhooks.length > 0 ? (
        <ul className="space-y-2">
          {webhooks.map((webhook) => (
            <li
              key={webhook.id}
              className="space-y-2 rounded-lg border border-border bg-muted/40 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={webhook.enabled ? 'success' : 'warning'}>
                  {webhook.enabled ? 'enabled' : 'disabled'}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  created {formatDateTime(webhook.created_at)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto whitespace-nowrap rounded bg-background px-2 py-1 font-mono text-xs">
                  {absoluteWebhookUrl(webhook.url)}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyText(absoluteWebhookUrl(webhook.url), 'URL')}
                  aria-label="Copy webhook URL"
                >
                  <Copy className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleToggle(webhook.id, !webhook.enabled)}
                  loading={toggleMutation.isPending}
                >
                  {webhook.enabled ? 'Disable' : 'Enable'}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleDelete(webhook.id)}
                  loading={deleteMutation.isPending}
                >
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {!creating ? (
        <Button size="sm" variant="outline" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Add webhook
        </Button>
      ) : null}

      <details className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">
          How to send a delivery
        </summary>
        <div className="mt-2 space-y-1.5">
          <p>POST JSON to the webhook URL with these headers:</p>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>
              <code className="font-mono">X-Webhook-Signature</code>: lowercase hex HMAC-SHA256 of
              the raw request body, keyed by the secret.
            </li>
            <li>
              <code className="font-mono">X-Webhook-Timestamp</code>: current unix epoch seconds
              (rejects deliveries older than 5 minutes).
            </li>
            <li>
              <code className="font-mono">X-Delivery-ID</code>: optional idempotency key; reuse it
              to make retries safe.
            </li>
          </ul>
          <p>The request body is passed to the workflow as its execution input.</p>
        </div>
      </details>
    </section>
  )
}
