package queue

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
)

// fakeRepository counts RecoverExpired calls and stubs the rest of the
// Repository contract; only the recovery path is under test here.
type fakeRepository struct {
	mu    sync.Mutex
	calls int
}

func (f *fakeRepository) Enqueue(context.Context, uuid.UUID, time.Time) error { return nil }

func (f *fakeRepository) Claim(context.Context, string, time.Time) (Work, error) {
	return Work{}, ErrNoWork
}

func (f *fakeRepository) Heartbeat(context.Context, uuid.UUID, string, string, time.Time) error {
	return nil
}

func (f *fakeRepository) RecoverExpired(context.Context, time.Time) (int, error) {
	f.mu.Lock()
	f.calls++
	f.mu.Unlock()
	return 1, nil
}

func (f *fakeRepository) Complete(context.Context, uuid.UUID, string, string, int, json.RawMessage, time.Time) error {
	return nil
}

func (f *fakeRepository) Fail(context.Context, uuid.UUID, string, string, int, string, time.Time) error {
	return nil
}

func (f *fakeRepository) QueuedCount(context.Context) (int, error) { return 0, nil }

func (f *fakeRepository) callCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls
}

func TestRunRecoverySweepTicksUntilCancelled(t *testing.T) {
	repo := &fakeRepository{}
	ctx, cancel := context.WithCancel(context.Background())

	done := make(chan struct{})
	go func() {
		RunRecoverySweep(ctx, repo, 5*time.Millisecond, nil)
		close(done)
	}()

	// Wait for at least two ticks to prove it is a periodic sweep, not one-shot.
	deadline := time.After(2 * time.Second)
	for repo.callCount() < 2 {
		select {
		case <-deadline:
			t.Fatalf("expected at least 2 recovery sweeps, got %d", repo.callCount())
		case <-time.After(2 * time.Millisecond):
		}
	}

	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("RunRecoverySweep did not return after the context was cancelled")
	}
}

func TestRunRecoverySweepDefaultsInvalidInterval(t *testing.T) {
	repo := &fakeRepository{}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// interval <= 0 must fall back to the default rather than panic in
	// time.NewTicker.
	done := make(chan struct{})
	go func() {
		RunRecoverySweep(ctx, repo, 0, nil)
		close(done)
	}()

	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("RunRecoverySweep did not return after cancellation with a zero interval")
	}
}
