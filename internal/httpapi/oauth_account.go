package httpapi

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/neyati/flowforge/internal/oauth"
	"github.com/neyati/flowforge/internal/user"
)

var (
	// errOAuthEmailConflict means the provider's email already belongs to an
	// account that this flow may not adopt, so sign-in is refused rather than
	// silently creating a second account for the same person.
	errOAuthEmailConflict = errors.New("email already belongs to another account")
	// errOAuthIdentityConflict means the account is already linked to a
	// different account at the same provider. Re-pointing the link would move
	// the sign-in to whoever controls the new provider account, so it is refused.
	errOAuthIdentityConflict = errors.New("account is already linked to a different provider account")
	// errOAuthAccountInactive means the account exists but must not be signed in.
	errOAuthAccountInactive = errors.New("account is not active")
)

// maxOAuthDisplayNameRunes matches the limit the signup form applies, so a name
// from a provider cannot produce an account the UI could not have created.
const maxOAuthDisplayNameRunes = 100

// resolveOAuthUser maps a provider profile onto a FlowForge account: it finds
// the account the provider identity already belongs to, adopts or creates one
// when the identity is new, and records the link. It is the only place a social
// sign-in turns into a user, and it never creates a second account for a person
// who already has a usable one.
func (s *Server) resolveOAuthUser(ctx context.Context, providerID string, profile oauth.Profile) (user.User, error) {
	account, err := s.findOAuthAccount(ctx, providerID, profile)
	if err != nil {
		return user.User{}, err
	}
	if err := s.linkOAuthIdentity(ctx, providerID, account, profile); err != nil {
		return user.User{}, err
	}
	return account, nil
}

func (s *Server) findOAuthAccount(ctx context.Context, providerID string, profile oauth.Profile) (user.User, error) {
	// A known provider identity wins outright: it is the account that signed in
	// with this provider account last time, whatever its email is now.
	identity, err := s.identities.GetBySubject(ctx, providerID, profile.Subject)
	if err == nil {
		account, err := s.users.GetByID(ctx, identity.UserID)
		if err != nil {
			return user.User{}, err
		}
		if account.Status != "active" {
			return user.User{}, errOAuthAccountInactive
		}
		return account, nil
	}
	if !errors.Is(err, user.ErrNotFound) {
		return user.User{}, err
	}

	// The provider account has never signed in, so the email decides whether an
	// existing account may be reused.
	account, err := s.users.GetByEmail(ctx, normalizeEmail(profile.Email))
	switch {
	case err == nil:
		if account.Status != "active" {
			return user.User{}, errOAuthAccountInactive
		}
		if !linkableByEmail(account, profile) {
			return user.User{}, errOAuthEmailConflict
		}
		return account, nil
	case errors.Is(err, user.ErrNotFound):
		return s.createOAuthAccount(ctx, profile)
	default:
		return user.User{}, err
	}
}

// linkableByEmail decides whether a provider identity may sign in as an existing
// account that matched by email alone.
func linkableByEmail(account user.User, profile oauth.Profile) bool {
	// A trial workspace is disposable and its address is synthetic, so a real
	// provider identity must never adopt it.
	if account.IsTrial {
		return false
	}
	// An account with no password was itself created by a provider: the address
	// is already the provider's to assert, so another provider proving control
	// of the same address may join the same account. The alternative would be a
	// duplicate account for one person.
	if account.PasswordHash == "" {
		return true
	}
	// A password-protected account is only adopted when the provider vouches for
	// the address. Matching emails alone would let anyone who can attach an
	// unverified address at a provider sign in as the account's owner.
	return profile.EmailVerified
}

func (s *Server) createOAuthAccount(ctx context.Context, profile oauth.Profile) (user.User, error) {
	now := time.Now().UTC()
	account := user.User{
		ID:          uuid.New(),
		Email:       normalizeEmail(profile.Email),
		DisplayName: oauthDisplayName(profile),
		// No password hash: the account has no password to check, so the login
		// endpoint can never authenticate it. This mirrors trial accounts.
		Status:    "active",
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := s.users.Create(ctx, account); err != nil {
		// Two callbacks for the same person can race (a double-click, or the
		// same account signing in from two tabs). Reuse the winner rather than
		// failing a sign-in that is otherwise valid.
		existing, lookupErr := s.users.GetByEmail(ctx, account.Email)
		if lookupErr != nil {
			return user.User{}, err
		}
		if !linkableByEmail(existing, profile) {
			return user.User{}, errOAuthEmailConflict
		}
		return existing, nil
	}
	return account, nil
}

// linkOAuthIdentity records that this provider account signs in as this user. It
// is idempotent: repeating a sign-in that already has a link succeeds.
func (s *Server) linkOAuthIdentity(ctx context.Context, providerID string, account user.User, profile oauth.Profile) error {
	err := s.identities.Create(ctx, user.Identity{
		UserID:          account.ID,
		Provider:        providerID,
		ProviderSubject: profile.Subject,
		Email:           normalizeEmail(profile.Email),
		CreatedAt:       time.Now().UTC(),
	})
	if err == nil {
		return nil
	}

	// The insert failed. Either the link already exists (a repeat sign-in, or a
	// race with a concurrent callback) or the account already carries a
	// different identity for this provider.
	existing, lookupErr := s.identities.GetBySubject(ctx, providerID, profile.Subject)
	if lookupErr == nil && existing.UserID == account.ID {
		return nil
	}
	if lookupErr != nil && !errors.Is(lookupErr, user.ErrNotFound) {
		return err
	}

	linked, lookupErr := s.identities.GetByUserAndProvider(ctx, account.ID, providerID)
	if lookupErr == nil && linked.ProviderSubject != profile.Subject {
		return errOAuthIdentityConflict
	}
	if lookupErr != nil && !errors.Is(lookupErr, user.ErrNotFound) {
		return err
	}
	return err
}

// oauthDisplayName picks the account's display name from the profile, falling
// back to the local part of the address so every account is named.
func oauthDisplayName(profile oauth.Profile) string {
	name := strings.TrimSpace(profile.DisplayName)
	if name == "" {
		name = localPart(profile.Email)
	}
	if runes := []rune(name); len(runes) > maxOAuthDisplayNameRunes {
		// Truncate on a rune boundary so a multi-byte name is never cut into
		// invalid text.
		name = strings.TrimSpace(string(runes[:maxOAuthDisplayNameRunes]))
	}
	if name == "" {
		return "FlowForge user"
	}
	return name
}

func localPart(email string) string {
	if at := strings.Index(email, "@"); at > 0 {
		return strings.TrimSpace(email[:at])
	}
	return strings.TrimSpace(email)
}
