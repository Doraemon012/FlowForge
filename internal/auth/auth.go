package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

var ErrInvalidToken = errors.New("invalid access token")

type TokenService struct {
	secret []byte
	now    func() time.Time
}

type tokenClaims struct {
	Subject string `json:"sub"`
	Expires int64  `json:"exp"`
	Nonce   string `json:"jti"`
}

func NewTokenService(secret string) *TokenService {
	return &TokenService{secret: []byte(secret), now: time.Now}
}

func HashPassword(password string) (string, error) {
	if password == "" {
		return "", errors.New("password is required")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(hash), err
}

func CheckPassword(hash, password string) bool {
	return hash != "" && bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

func (s *TokenService) Issue(userID uuid.UUID, lifetime time.Duration) (string, error) {
	if userID == uuid.Nil || len(s.secret) == 0 || lifetime <= 0 {
		return "", errors.New("invalid token parameters")
	}
	nonce := make([]byte, 16)
	if _, err := rand.Read(nonce); err != nil {
		return "", fmt.Errorf("generate token nonce: %w", err)
	}
	claims := tokenClaims{Subject: userID.String(), Expires: s.now().Add(lifetime).Unix(), Nonce: base64.RawURLEncoding.EncodeToString(nonce)}
	payload, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	encodedPayload := base64.RawURLEncoding.EncodeToString(payload)
	return encodedPayload + "." + s.sign(encodedPayload), nil
}

func (s *TokenService) Parse(token string) (uuid.UUID, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 || !hmac.Equal([]byte(parts[1]), []byte(s.sign(parts[0]))) {
		return uuid.Nil, ErrInvalidToken
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return uuid.Nil, ErrInvalidToken
	}
	var claims tokenClaims
	if err := json.Unmarshal(payload, &claims); err != nil || claims.Expires <= s.now().Unix() {
		return uuid.Nil, ErrInvalidToken
	}
	userID, err := uuid.Parse(claims.Subject)
	if err != nil || userID == uuid.Nil {
		return uuid.Nil, ErrInvalidToken
	}
	return userID, nil
}

func (s *TokenService) sign(payload string) string {
	mac := hmac.New(sha256.New, s.secret)
	_, _ = mac.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
