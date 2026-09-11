package ai

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
)

const (
	defaultCohereBaseURL = "https://api.cohere.com"
	defaultCohereModel   = "command-r-plus-08-2024"
	cohereTemperature    = 0.2
)

// CohereSettings configures the Cohere provider. BaseURL may point at a proxy
// that speaks the Cohere v2 chat API.
type CohereSettings struct {
	APIKey  string
	BaseURL string
	Model   string
}

type cohereProvider struct {
	apiKey  string
	baseURL string
	model   string
	client  *http.Client
}

func newCohereProvider(settings CohereSettings) *cohereProvider {
	baseURL := strings.TrimRight(strings.TrimSpace(settings.BaseURL), "/")
	if baseURL == "" {
		baseURL = defaultCohereBaseURL
	}
	model := strings.TrimSpace(settings.Model)
	if model == "" {
		model = defaultCohereModel
	}
	return &cohereProvider{
		apiKey:  strings.TrimSpace(settings.APIKey),
		baseURL: baseURL,
		model:   model,
		client:  newHTTPClient(),
	}
}

func (p *cohereProvider) Name() string { return ProviderCohere }

type cohereChatRequest struct {
	Model       string    `json:"model"`
	Messages    []Message `json:"messages"`
	Temperature float64   `json:"temperature"`
}

type cohereChatResponse struct {
	Message struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	} `json:"message"`
}

// Complete posts the messages to Cohere's v2 /chat endpoint. Cohere returns the
// assistant turn as a list of content blocks, so the text blocks are joined
// while non-text blocks (for example tool calls) are ignored.
func (p *cohereProvider) Complete(ctx context.Context, messages []Message) (string, error) {
	body, err := postJSON(ctx, p.client, p.baseURL+"/v2/chat", p.apiKey, cohereChatRequest{
		Model:       p.model,
		Messages:    messages,
		Temperature: cohereTemperature,
	})
	if err != nil {
		return "", err
	}
	var parsed cohereChatResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", errors.New("ai provider returned an unreadable response")
	}
	var text strings.Builder
	for _, block := range parsed.Message.Content {
		if block.Type == "text" || block.Type == "" {
			text.WriteString(block.Text)
		}
	}
	result := strings.TrimSpace(text.String())
	if result == "" {
		return "", errors.New("ai provider returned no completion")
	}
	return result, nil
}
