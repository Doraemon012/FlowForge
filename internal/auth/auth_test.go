package auth

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestPasswordHashAndCheck(t *testing.T) {
	hash, err := HashPassword("correct horse battery staple")
	if err != nil {
		t.Fatalf("HashPassword() error = %v", err)
	}
	if hash == "correct horse battery staple" || !CheckPassword(hash, "correct horse battery staple") || CheckPassword(hash, "wrong password") {
		t.Fatal("password hash verification behaved incorrectly")
	}
}

func TestTokenIssueAndParse(t *testing.T) {
	service := NewTokenService("01234567890123456789012345678901")
	userID := uuid.New()
	token, err := service.Issue(userID, time.Minute)
	if err != nil {
		t.Fatalf("Issue() error = %v", err)
	}
	got, err := service.Parse(token)
	if err != nil || got != userID {
		t.Fatalf("Parse() = %v, %v; want %v", got, err, userID)
	}
	if _, err := service.Parse(token + "x"); err == nil {
		t.Fatal("Parse() accepted a tampered token")
	}
}
