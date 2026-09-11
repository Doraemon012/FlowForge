package ai

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
)

const (
	defaultOpenAIBaseURL = "https://api.openai.com/v1"
	defaultOpenAIModel   = "gpt-4o-mini"
	openAITemperature    = 0.2
)

// OpenAISettings configures the OpenAI-compatible provider. BaseURL may point at
// any service that speaks the OpenAI chat-completions API.
type OpenAISettings struct {
	APIKey  string
	BaseURL string
	Model   string
}

type openAIProvider struct {
	apiKey  string
	baseURL string
	model   string
	client  *http.Client
}

func newOpenAIProvider(settings OpenAISettings) *openAIProvider {
	baseURL := strings.TrimRight(strings.TrimSpace(settings.BaseURL), "/")
	if baseURL == "" {
		baseURL = defaultOpenAIBaseURL
	}
	model := strings.TrimSpace(settings.Model)
	if model == "" {
		model = defaultOpenAIModel
	}
	return &openAIProvider{
		apiKey:  strings.TrimSpace(settings.APIKey),
		baseURL: baseURL,
		model:   model,
		client:  newHTTPClient(),
	}
}

func (p *openAIProvider) Name() string { return ProviderOpenAI }

type openAIChatRequest struct {
	Model       string    `json:"model"`
	Messages    []Message `json:"messages"`
	Temperature float64   `json:"temperature"`
}

type openAIChatResponse struct {
	Choices []struct {
		Message Message `json:"message"`
	} `json:"choices"`
}

// Complete posts the messages to /chat/completions and returns the first
// choice's content.
func (p *openAIProvider) Complete(ctx context.Context, messages []Message) (string, error) {
	body, err := postJSON(ctx, p.client, p.baseURL+"/chat/completions", p.apiKey, openAIChatRequest{
		Model:       p.model,
		Messages:    messages,
		Temperature: openAITemperature,
	})
	if err != nil {
		return "", err
	}
	var parsed openAIChatResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", errors.New("ai provider returned an unreadable response")
	}
	if len(parsed.Choices) == 0 {
		return "", errors.New("ai provider returned no completion")
	}
	return parsed.Choices[0].Message.Content, nil
}
