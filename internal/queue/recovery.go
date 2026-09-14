package queue

import (
	"context"
	"log/slog"
	"time"
)

// DefaultRecoveryInterval is the cadence of the control-plane lease-recovery
// sweep. It is deliberately looser than the worker's own default (1s): the
// sweep only needs to beat the lease duration, and a quieter sweep keeps the
// always-on control plane's query load low.
const DefaultRecoveryInterval = 5 * time.Second

// RunRecoverySweep periodically reclaims tasks whose worker lease has expired,
// until ctx is cancelled. It returns when ctx is done.
//
// It is safe to run this in more than one process, including alongside the
// worker's own sweep: RecoverExpired selects expired rows FOR UPDATE SKIP LOCKED
// and every state transition is conditioned on the lease token, so concurrent
// sweeps are idempotent. Owning the sweep in the always-on control plane is what
// lets the worker scale to zero without leaving orphaned tasks unreclaimed
// (see docs/WORKER_COST_OPTIMIZATION.md §3.2/§3.3).
func RunRecoverySweep(ctx context.Context, repository Repository, interval time.Duration, logger *slog.Logger) {
	if interval <= 0 {
		interval = DefaultRecoveryInterval
	}
	if logger == nil {
		logger = slog.Default()
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			recovered, err := repository.RecoverExpired(ctx, time.Now().UTC())
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				logger.Error("lease recovery sweep failed", "owner", "control-plane", "error", err)
				continue
			}
			if recovered > 0 {
				logger.Info("expired leases recovered", "owner", "control-plane", "count", recovered)
			}
		}
	}
}
