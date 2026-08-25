package user

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/neyati/flowforge/internal/db"
)

func TestPostgresRepositoryRoundTrip(t *testing.T) {
	databaseURL := os.Getenv("INTEGRATION_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("INTEGRATION_DATABASE_URL is not set")
	}

	pool, err := db.Open(context.Background(), databaseURL, 5*time.Second)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer pool.Close()
	if err := db.Migrate(databaseURL); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	want := User{ID: uuid.New(), Email: uuid.NewString() + "@example.com", DisplayName: "Phase 1", Status: "active", CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC()}
	repository := NewPostgresRepository(pool)
	if err := repository.Create(context.Background(), want); err != nil {
		t.Fatalf("create user: %v", err)
	}
	got, err := repository.GetByID(context.Background(), want.ID)
	if err != nil {
		t.Fatalf("get user: %v", err)
	}
	if got.ID != want.ID || got.Email != want.Email || got.DisplayName != want.DisplayName || got.Status != want.Status || !got.CreatedAt.Equal(want.CreatedAt.Truncate(time.Microsecond)) || !got.UpdatedAt.Equal(want.UpdatedAt.Truncate(time.Microsecond)) {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}
