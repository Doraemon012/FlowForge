package ai

import "strings"

// Provider identifiers. These are the accepted values of FLOWFORGE_AI_PROVIDER.
const (
	ProviderOpenAI = "openai"
	ProviderCohere = "cohere"
	// defaultProvider is used when FLOWFORGE_AI_PROVIDER is unset or blank, so
	// existing OpenAI-only deployments keep working without new configuration.
	defaultProvider = ProviderOpenAI
)

// Config selects and configures the AI provider. Provider names the backend
// ("openai" or "cohere"); each backend carries its own credentials so both may
// be present at once and switching is a single config change. Every field is
// optional: when the selected provider has no API key the feature is reported
// as unavailable rather than producing fabricated output.
type Config struct {
	Provider      string
	OpenAIKey     string
	OpenAIBaseURL string
	OpenAIModel   string
	CohereKey     string
	CohereBaseURL string
	CohereModel   string
}

// SelectedProvider returns the normalized provider name, falling back to the
// default when unset. The name is returned even when the provider has no
// credentials so the caller can explain which setting is missing.
func (c Config) SelectedProvider() string {
	return normalizeProvider(c.Provider)
}

func normalizeProvider(name string) string {
	normalized := strings.ToLower(strings.TrimSpace(name))
	if normalized == "" {
		return defaultProvider
	}
	return normalized
}

// SupportedProvider reports whether name is a provider this build understands.
// Unknown names are treated as unconfigured so a typo disables AI instead of
// silently falling back to a different vendor.
func SupportedProvider(name string) bool {
	switch normalizeProvider(name) {
	case ProviderOpenAI, ProviderCohere:
		return true
	default:
		return false
	}
}

// newProvider builds the provider selected by config, or nil when it is
// unsupported or has no API key. A nil provider is what disables the generator.
func newProvider(config Config) Provider {
	switch config.SelectedProvider() {
	case ProviderOpenAI:
		if strings.TrimSpace(config.OpenAIKey) == "" {
			return nil
		}
		return newOpenAIProvider(OpenAISettings{
			APIKey:  config.OpenAIKey,
			BaseURL: config.OpenAIBaseURL,
			Model:   config.OpenAIModel,
		})
	case ProviderCohere:
		if strings.TrimSpace(config.CohereKey) == "" {
			return nil
		}
		return newCohereProvider(CohereSettings{
			APIKey:  config.CohereKey,
			BaseURL: config.CohereBaseURL,
			Model:   config.CohereModel,
		})
	default:
		return nil
	}
}
