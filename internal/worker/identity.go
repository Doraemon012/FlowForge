package worker

import "strings"

// Identity returns the identity a worker registers under, given the configured
// WORKER_ID and the process hostname.
//
// A container platform starts every replica from a single template, so replicas
// would otherwise share one WORKER_ID and be indistinguishable in
// task_queue.worker_id / task_attempts.worker_id. Scoping the configured value
// to the hostname — which is unique per replica — gives each replica its own
// identity. The fenced lease protocol keeps concurrent workers safe regardless
// (ADR 003); this only makes them individually visible, which is what the
// worker-failure-recovery story and GET /api/v1/workers depend on.
//
// A blank hostname (some sandboxes do not set one) leaves the configured value
// untouched rather than producing a trailing separator. A blank configured
// value returns "" so the caller can reject it.
func Identity(configured, hostname string) string {
	configured = strings.TrimSpace(configured)
	if configured == "" {
		return ""
	}
	hostname = strings.TrimSpace(hostname)
	if hostname == "" {
		return configured
	}
	return configured + "-" + hostname
}
