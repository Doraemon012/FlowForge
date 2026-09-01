package artifact

import (
	"encoding/json"
	"testing"
)

func TestValidateReference(t *testing.T) {
	valid := Reference{Type: ObjectStorageReferenceType, URI: "s3://bucket/key", Size: 100, ContentType: "application/json"}
	if errs := ValidateReference(valid); len(errs) != 0 {
		t.Fatalf("valid reference errors = %v", errs)
	}
	invalid := Reference{URI: "", Size: -1}
	if errs := ValidateReference(invalid); len(errs) != 2 {
		t.Fatalf("invalid reference errors = %v, want 2", errs)
	}
}

func TestLooksLikeReference(t *testing.T) {
	if !LooksLikeReference(json.RawMessage(`{"type":"object_storage","uri":"s3://b/k"}`)) {
		t.Fatal("object storage reference not detected")
	}
	if LooksLikeReference(json.RawMessage(`{"hello":"world"}`)) {
		t.Fatal("plain object falsely detected")
	}
	if LooksLikeReference(json.RawMessage(`[]`)) {
		t.Fatal("array falsely detected")
	}
}
