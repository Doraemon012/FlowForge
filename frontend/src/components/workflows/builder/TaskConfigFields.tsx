import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ConfigFieldSpec } from './types'

interface TaskConfigFieldProps {
  field: ConfigFieldSpec
  value: unknown
  onChange: (value: unknown) => void
}

/**
 * A JSON-typed config field (transform output, http headers) stores a parsed
 * object/array in `config` but needs an editable string in the input. Empty
 * strings are dropped from the config entirely so a blank advanced field does
 * not persist as `""`.
 */
export function normalizeFieldValue(taskType: string, key: string, value: unknown): unknown {
  if (value === '') {
    return undefined
  }
  if ((taskType === 'http' && key === 'headers') || (taskType === 'transform' && key === 'output')) {
    if (typeof value !== 'string') return value
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  return value
}

const NUMERIC_CONDITIONAL_OPERATORS = ['gt', 'lt', 'gte', 'lte']

/**
 * The conditional task compares a string with `equals`/`not_equals`/`contains`
 * but a number with `gt`/`lt`/`gte`/`lte`, so the `value` field swaps to a
 * numeric input to match the selected operator.
 */
export function resolveFieldForTask(field: ConfigFieldSpec, taskType: string, config?: Record<string, unknown>): ConfigFieldSpec {
  if (taskType !== 'conditional' || field.key !== 'value') return field
  const operator = String(config?.operator ?? '')
  if (!NUMERIC_CONDITIONAL_OPERATORS.includes(operator)) return field
  return { ...field, type: 'number' }
}

export function TaskConfigField({ field, value, onChange }: TaskConfigFieldProps) {
  const id = `task-config-${field.key}`
  const current = value ?? ''
  // JSON fields render back as readable JSON rather than "[object Object]".
  const displayValue =
    current !== null && typeof current === 'object'
      ? JSON.stringify(current, null, 2)
      : String(current)

  const help = field.help ? <p className="text-xs text-muted-foreground">{field.help}</p> : null
  // The required marker sits *beside* the label rather than inside it: text
  // inside the <label> element becomes part of the control's accessible name,
  // so "URL *" would stop being addressable as "URL" for assistive tech and
  // for label-based queries. The input carries `aria-required` instead.
  const label = (
    <div className="flex items-baseline gap-1">
      <Label htmlFor={id}>{field.label}</Label>
      {field.required ? (
        <span className="text-xs text-destructive" aria-hidden="true">
          *
        </span>
      ) : null}
    </div>
  )
  const requiredAttr = field.required ? { 'aria-required': true } : {}

  if (field.type === 'select') {
    return (
      <div className="space-y-1.5">
        {label}
        <select
          id={id}
          value={String(current)}
          onChange={(event) => onChange(event.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={field.label}
          {...requiredAttr}
        >
          {field.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {help}
      </div>
    )
  }

  if (field.type === 'textarea') {
    return (
      <div className="space-y-1.5">
        {label}
        <textarea
          id={id}
          value={displayValue}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={field.label}
          {...requiredAttr}
        />
        {help}
      </div>
    )
  }

  if (field.type === 'number') {
    return (
      <div className="space-y-1.5">
        {label}
        <Input
          id={id}
          type="number"
          value={current === '' ? '' : String(current)}
          onChange={(event) =>
            onChange(event.target.value === '' ? undefined : Number(event.target.value))
          }
          placeholder={field.placeholder}
          aria-label={field.label}
          {...requiredAttr}
        />
        {help}
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {label}
      <Input
        id={id}
        type="text"
        value={displayValue}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder}
        aria-label={field.label}
        {...requiredAttr}
      />
      {help}
    </div>
  )
}
