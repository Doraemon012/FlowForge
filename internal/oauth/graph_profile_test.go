package oauth

import (
	"errors"
	"net/http"
	"testing"
)

// Microsoft's userinfo response identifies the account but carries no address
// once `email` is left out of the authorization request, so the address is read
// from the Graph user resource the User.Read permission authorizes. The identity
// is still keyed by the subject the userinfo call returned, which is the value
// existing links are stored against, so accounts linked before this change keep
// resolving to the same person.
func TestExchangeReadsTheAddressFromTheProfileEndpoint(t *testing.T) {
	provider := newStubProvider(t,
		map[string]any{"sub": "subject-work", "name": "Work Person"},
		map[string]any{
			"mail":              "work.person@contoso.com",
			"userPrincipalName": "work.person@contoso.onmicrosoft.com",
			"displayName":       "Work Person",
		},
	)

	profile, err := provider.exchange(t, ProviderMicrosoft)
	if err != nil {
		t.Fatalf("exchange: %v", err)
	}
	if profile.Subject != "subject-work" {
		t.Errorf("subject = %q, want %q", profile.Subject, "subject-work")
	}
	// mail is the account's SMTP address and is preferred over the directory
	// user principal name, which is only the sign-in name.
	if profile.Email != "work.person@contoso.com" {
		t.Errorf("email = %q, want %q", profile.Email, "work.person@contoso.com")
	}
	if profile.DisplayName != "Work Person" {
		t.Errorf("display name = %q, want %q", profile.DisplayName, "Work Person")
	}
	// An address read from a resource endpoint is not vouched for by the
	// provider, so it must not unlock an existing password-protected account.
	if profile.EmailVerified {
		t.Error("an address from the profile endpoint must not be treated as verified")
	}

	userinfoCalls, profileCalls := provider.callCounts()
	if userinfoCalls != 1 || profileCalls != 1 {
		t.Errorf("userinfo calls = %d, profile calls = %d, want 1 and 1", userinfoCalls, profileCalls)
	}
}

// When the userinfo response does carry an address, the profile endpoint is not
// read at all: the second request is spent only where it is the only way to
// obtain one.
func TestExchangeSkipsTheProfileEndpointWhenUserinfoCarriesTheAddress(t *testing.T) {
	provider := newStubProvider(t,
		map[string]any{
			"sub":            "subject-verified",
			"email":          "verified@example.com",
			"email_verified": true,
			"name":           "Verified Person",
		},
		map[string]any{"mail": "must-not-be-used@example.com"},
	)

	profile, err := provider.exchange(t, ProviderMicrosoft)
	if err != nil {
		t.Fatalf("exchange: %v", err)
	}
	if profile.Email != "verified@example.com" {
		t.Errorf("email = %q, want %q", profile.Email, "verified@example.com")
	}
	if !profile.EmailVerified {
		t.Error("the provider vouched for this address; it must stay verified")
	}
	if _, profileCalls := provider.callCounts(); profileCalls != 0 {
		t.Errorf("profile calls = %d, want 0", profileCalls)
	}
}

// A provider with no profile endpoint has no second read to make, however the
// stub is configured.
func TestExchangeDoesNotReadAProfileEndpointThatIsNotConfigured(t *testing.T) {
	provider := newStubProvider(t,
		map[string]any{"sub": "subject-google", "email": "google.person@example.com"},
		map[string]any{"mail": "must-not-be-used@example.com"},
	)

	profile, err := provider.exchange(t, ProviderGoogle)
	if err != nil {
		t.Fatalf("exchange: %v", err)
	}
	if profile.Email != "google.person@example.com" {
		t.Errorf("email = %q, want %q", profile.Email, "google.person@example.com")
	}
	if _, profileCalls := provider.callCounts(); profileCalls != 0 {
		t.Errorf("profile calls = %d, want 0", profileCalls)
	}
}

// A personal Microsoft account has no SMTP mail address, so its directory user
// principal name is the only address there is. It is still an address, and the
// account must be created from it rather than refused.
func TestExchangeAcceptsAPersonalAccountUsernameAsTheAddress(t *testing.T) {
	provider := newStubProvider(t,
		map[string]any{"sub": "subject-personal"},
		map[string]any{
			"mail":              "",
			"userPrincipalName": "live.com#personal@outlook.com",
			"displayName":       "Personal Person",
		},
	)

	profile, err := provider.exchange(t, ProviderMicrosoft)
	if err != nil {
		t.Fatalf("exchange: %v", err)
	}
	if profile.Email != "personal@outlook.com" {
		t.Errorf("email = %q, want %q", profile.Email, "personal@outlook.com")
	}
	if profile.DisplayName != "Personal Person" {
		t.Errorf("display name = %q, want %q", profile.DisplayName, "Personal Person")
	}
}

// The display name falls back to the name parts the profile endpoint returns
// when it carries no combined name.
func TestExchangeCombinesNamePartsFromTheProfileEndpoint(t *testing.T) {
	provider := newStubProvider(t,
		map[string]any{"sub": "subject-parts"},
		map[string]any{"mail": "parts@contoso.com", "givenName": "Given", "surname": "Surname"},
	)

	profile, err := provider.exchange(t, ProviderMicrosoft)
	if err != nil {
		t.Fatalf("exchange: %v", err)
	}
	if profile.DisplayName != "Given Surname" {
		t.Errorf("display name = %q, want %q", profile.DisplayName, "Given Surname")
	}
}

// The address is the account key, so an identity that carries no usable address
// anywhere is refused instead of creating an account that cannot be identified.
func TestExchangeFailsWhenNoEndpointCarriesAnAddress(t *testing.T) {
	provider := newStubProvider(t,
		map[string]any{"sub": "subject-no-address", "name": "No Address"},
		map[string]any{"displayName": "No Address"},
	)

	if _, err := provider.exchange(t, ProviderMicrosoft); !errors.Is(err, ErrEmailMissing) {
		t.Fatalf("exchange err = %v, want %v", err, ErrEmailMissing)
	}
}

// A profile endpoint that answers with an error is a failed sign-in, not a
// sign-in with a silently missing address.
func TestExchangeFailsWhenTheProfileEndpointIsUnavailable(t *testing.T) {
	provider := newStubProvider(t,
		map[string]any{"sub": "subject-unavailable"},
		map[string]any{"mail": "unreachable@contoso.com"},
	)
	provider.setProfileStatus(http.StatusInternalServerError)

	if _, err := provider.exchange(t, ProviderMicrosoft); !errors.Is(err, ErrProfileUnavailable) {
		t.Fatalf("exchange err = %v, want %v", err, ErrProfileUnavailable)
	}
}

// directoryUsername is where the personal-account form is translated, so each
// shape it must and must not touch is pinned here.
func TestDirectoryUsernameNormalisation(t *testing.T) {
	testCases := []struct {
		name              string
		userPrincipalName string
		want              string
	}{
		{
			name:              "a work account username is left alone",
			userPrincipalName: "person@contoso.com",
			want:              "person@contoso.com",
		},
		{
			name:              "a personal account keeps only the address after its separator",
			userPrincipalName: "live.com#person@outlook.com",
			want:              "person@outlook.com",
		},
		{
			name:              "a guest username has no local part after its separator and is kept whole",
			userPrincipalName: "AdeleVance_adatum.com#EXT#@contoso.com",
			want:              "AdeleVance_adatum.com#EXT#@contoso.com",
		},
		{
			name:              "padding is trimmed",
			userPrincipalName: "  person@contoso.com  ",
			want:              "person@contoso.com",
		},
		{
			name:              "an empty username stays empty",
			userPrincipalName: "",
			want:              "",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			if got := directoryUsername(testCase.userPrincipalName); got != testCase.want {
				t.Errorf("directoryUsername(%q) = %q, want %q", testCase.userPrincipalName, got, testCase.want)
			}
		})
	}
}
