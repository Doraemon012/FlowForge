package artifact

import (
	"encoding/json"
	"strings"
)

// Safe size limits for the V1 task set. Large payloads must use an
// object-storage artifact reference rather than an inline value.
const (
	MaxInputBytes             = 256 * 1024
	MaxOutputBytes            = 256 * 1024
	MaxDefinitionBytes        = 256 * 1024
	MaxTaskConfigBytes        = 64 * 1024
	MaxArtifactReferenceBytes = 4 * 1024
)

// ObjectStorageReferenceType is the only V1 artifact reference type.
const ObjectStorageReferenceType = "object_storage"

// Reference is a small pointer to a large payload held in object storage.
type Reference struct {
	Type        string            `json:"type"`
	URI         string            `json:"uri"`
	Size        int64             `json:"size,omitempty"`
	ContentType string            `json:"content_type,omitempty"`
	ETag        string            `json:"etag,omitempty"`
	Metadata    map[string]string `json:"metadata,omitempty"`
}

// ValidateReference returns deterministic validation errors for a reference.
func ValidateReference(ref Reference) []string {
	errs := make([]string, 0)
	if ref.Type != "" && ref.Type != ObjectStorageReferenceType {
		errs = append(errs, "artifact reference type must be object_storage")
	}
	if strings.TrimSpace(ref.URI) == "" {
		errs = append(errs, "artifact reference uri is required")
	}
	if ref.Size < 0 {
		errs = append(errs, "artifact reference size must be non-negative")
	}
	if ref.Size > 0 && strings.TrimSpace(ref.ContentType) == "" {
		errs = append(errs, "artifact reference content_type is required when size is set")
	}
	return errs
}

// LooksLikeReference reports whether raw looks like an artifact reference.
func LooksLikeReference(raw json.RawMessage) bool {
	if len(raw) == 0 {
		return false
	}
	var probe struct {
		Type string `json:"type"`
		URI  string `json:"uri"`
	}
	if err := json.Unmarshal(raw, &probe); err != nil {
		return false
	}
	return probe.Type == ObjectStorageReferenceType || probe.URI != ""
}

// ParseReference interprets raw as an artifact reference.
func ParseReference(raw json.RawMessage) (Reference, bool) {
	var ref Reference
	if err := json.Unmarshal(raw, &ref); err != nil {
		return Reference{}, false
	}
	if ref.Type == "" && ref.URI == "" {
		return Reference{}, false
	}
	return ref, true
}
