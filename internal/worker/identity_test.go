package worker

import "testing"

// The per-replica identity is what makes the worker horizontally scalable and
// the worker-failure-recovery story work: two replicas of the same Container
// App must never register under the same WORKER_ID.
func TestIdentityScopesToHostname(t *testing.T) {
	first := Identity("flowforge-worker", "flowforge-worker--abc123")
	second := Identity("flowforge-worker", "flowforge-worker--def456")

	if first == second {
		t.Fatalf("two replicas produced the same identity: %q", first)
	}
	if first != "flowforge-worker-flowforge-worker--abc123" {
		t.Fatalf("Identity() = %q, want the configured value scoped by hostname", first)
	}
}

func TestIdentityWithoutHostnameUsesConfiguredValue(t *testing.T) {
	cases := []struct {
		name       string
		configured string
		hostname   string
		want       string
	}{
		{"no hostname", "flowforge-worker", "", "flowforge-worker"},
		{"whitespace hostname", "flowforge-worker", "   ", "flowforge-worker"},
		{"trims the configured value", "  flowforge-worker  ", "pod-1", "flowforge-worker-pod-1"},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			if got := Identity(tt.configured, tt.hostname); got != tt.want {
				t.Fatalf("Identity(%q, %q) = %q, want %q", tt.configured, tt.hostname, got, tt.want)
			}
		})
	}
}

// An empty WORKER_ID must stay empty so cmd/worker can refuse to start rather
// than register under a hostname-only identity.
func TestIdentityEmptyConfiguredValue(t *testing.T) {
	if got := Identity("", "pod-1"); got != "" {
		t.Fatalf("Identity(\"\", \"pod-1\") = %q, want \"\"", got)
	}
	if got := Identity("   ", "pod-1"); got != "" {
		t.Fatalf("Identity(\"   \", \"pod-1\") = %q, want \"\"", got)
	}
}
