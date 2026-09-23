package oauth

import (
	"slices"
	"strings"
	"testing"
)

// The scopes asserted here are the exact set the runtime authorization request
// sends. They are compared as an ordered slice rather than with "contains", so
// widening the request cannot pass unnoticed: every additional scope at a
// provider is an additional permission shown on the consent prompt, and at
// Microsoft an additional Microsoft Graph permission.
func TestProviderScopesAreTheMinimumRequiredForSignIn(t *testing.T) {
	testCases := []struct {
		name     string
		provider ProviderConfig
		want     []string
	}{
		{
			name: "google",
			provider: GoogleProvider(
				"client-id",
				"client-secret",
				"https://api.example.com/api/v1/auth/oauth/google/callback",
			),
			want: []string{ScopeOpenID, ScopeEmail, ScopeProfile},
		},
		{
			name: "microsoft",
			provider: MicrosoftProvider(
				"client-id",
				"client-secret",
				"common",
				"https://api.example.com/api/v1/auth/oauth/microsoft/callback",
			),
			want: []string{ScopeOpenID, ScopeProfile, ScopeUserRead},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			if !slices.Equal(testCase.provider.Scopes, testCase.want) {
				t.Fatalf("%s scopes = %v, want %v", testCase.name, testCase.provider.Scopes, testCase.want)
			}
		})
	}
}

// Microsoft Graph permissions are what this pins: FlowForge may ask for
// User.Read and for nothing else. Every scope Microsoft accepts that is not an
// OpenID Connect scope is a Graph permission (Mail.Read, Calendars.Read,
// Files.Read.All, GroupMember.Read.All, Directory.Read.All, …), so anything
// outside the OIDC set would widen access beyond signing this person in.
func TestMicrosoftProviderRequestsNoGraphPermissionBeyondUserRead(t *testing.T) {
	scopes := MicrosoftProvider(
		"client-id",
		"client-secret",
		"common",
		"https://api.example.com/api/v1/auth/oauth/microsoft/callback",
	).Scopes

	if count := countScope(scopes, ScopeUserRead); count != 1 {
		t.Errorf("User.Read appears %d times in the request, want exactly once", count)
	}
	for _, scope := range scopes {
		if scope == ScopeUserRead {
			continue
		}
		if !isOpenIDConnectScope(scope) {
			t.Errorf(
				"scope %q is neither an OpenID Connect scope nor User.Read, so it is an unneeded Microsoft Graph permission",
				scope,
			)
		}
	}
}

// `email` is a permission at Microsoft, not a claim that arrives for free: its
// userinfo response carries an address only when that scope was requested. It is
// not requested here, because the address is read from Microsoft Graph under the
// User.Read permission the application already asks for, and every extra
// permission is another line on the consent prompt. Google is the opposite case:
// nothing else supplies its address, so it must be requested there.
func TestMicrosoftProviderDoesNotRequestTheEmailScope(t *testing.T) {
	microsoft := MicrosoftProvider(
		"client-id",
		"client-secret",
		"common",
		"https://api.example.com/api/v1/auth/oauth/microsoft/callback",
	)
	if slices.Contains(microsoft.Scopes, ScopeEmail) {
		t.Errorf("microsoft scopes = %v, must not request %q", microsoft.Scopes, ScopeEmail)
	}

	google := GoogleProvider(
		"client-id",
		"client-secret",
		"https://api.example.com/api/v1/auth/oauth/google/callback",
	)
	if !slices.Contains(google.Scopes, ScopeEmail) {
		t.Errorf("google scopes = %v, want %q: nothing else supplies its address", google.Scopes, ScopeEmail)
	}
}

// countScope counts occurrences of a scope in one authorization request, so a
// duplicated permission is spotted rather than tolerated.
func countScope(scopes []string, scope string) int {
	count := 0
	for _, candidate := range scopes {
		if candidate == scope {
			count++
		}
	}
	return count
}

// isOpenIDConnectScope reports whether a scope is one of the standard OpenID
// Connect scopes rather than a Microsoft Graph permission. These grant access to
// no resource: they only describe the account being signed in.
func isOpenIDConnectScope(scope string) bool {
	return scope == ScopeOpenID || scope == ScopeProfile || scope == ScopeEmail
}

// The tenant is what decides who may sign in, so its default matters: "common"
// admits work/school accounts from any directory and personal Microsoft
// accounts at once. Only an explicitly configured value narrows it.
func TestMicrosoftProviderTenantSelection(t *testing.T) {
	testCases := []struct {
		name        string
		tenantID    string
		wantHostAnd string
	}{
		{name: "unset defaults to common", tenantID: "", wantHostAnd: "/common/oauth2/v2.0/"},
		{name: "whitespace defaults to common", tenantID: "   ", wantHostAnd: "/common/oauth2/v2.0/"},
		{name: "organizations is honoured", tenantID: "organizations", wantHostAnd: "/organizations/oauth2/v2.0/"},
		{name: "a directory id is honoured", tenantID: "1c56baa5-eb2b-4995-9bcf-02d1629684c1", wantHostAnd: "/1c56baa5-eb2b-4995-9bcf-02d1629684c1/oauth2/v2.0/"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			provider := MicrosoftProvider(
				"client-id",
				"client-secret",
				testCase.tenantID,
				"https://api.example.com/api/v1/auth/oauth/microsoft/callback",
			)
			for _, endpoint := range []string{provider.AuthURL, provider.TokenURL} {
				if !strings.HasPrefix(endpoint, microsoftAuthBaseURL+testCase.wantHostAnd) {
					t.Errorf("endpoint = %q, want the %q tenant", endpoint, testCase.wantHostAnd)
				}
			}
		})
	}
}

// The profile is read from Microsoft's userinfo endpoint, which is a Microsoft
// Graph API rather than part of login.microsoftonline.com. That is the reason
// User.Read is part of the request at all, so the two must stay in step.
func TestMicrosoftProviderReadsTheProfileFromGraph(t *testing.T) {
	provider := MicrosoftProvider(
		"client-id",
		"client-secret",
		"common",
		"https://api.example.com/api/v1/auth/oauth/microsoft/callback",
	)

	if provider.UserInfoURL != microsoftUserInfoURL {
		t.Fatalf("userinfo URL = %q, want %q", provider.UserInfoURL, microsoftUserInfoURL)
	}
	if want := "https://graph.microsoft.com/oidc/userinfo"; microsoftUserInfoURL != want {
		t.Errorf("userinfo endpoint = %q, want %q", microsoftUserInfoURL, want)
	}
	// The address is read from the Graph user resource, because the userinfo
	// response carries none once `email` is left out of the request. This is the
	// call the User.Read permission exists for, so it must be the Graph host.
	if provider.ProfileURL != microsoftProfileURL {
		t.Fatalf("profile URL = %q, want %q", provider.ProfileURL, microsoftProfileURL)
	}
	if want := "https://graph.microsoft.com/v1.0/me"; microsoftProfileURL != want {
		t.Errorf("profile endpoint = %q, want %q", microsoftProfileURL, want)
	}
	// Google's userinfo response carries the address itself, so it has no second
	// read to make and must not be given one.
	google := GoogleProvider(
		"client-id",
		"client-secret",
		"https://api.example.com/api/v1/auth/oauth/google/callback",
	)
	if google.ProfileURL != "" {
		t.Errorf("google profile URL = %q, want empty", google.ProfileURL)
	}
}
