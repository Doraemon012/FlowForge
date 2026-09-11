// Package trial contains the server-side bookkeeping for the public free trial:
// the AI usage limits applied to disposable trial accounts and the durable
// repository that counts usage against them.
//
// The limits exist to bound the cost of unauthenticated AI usage. They are
// enforced here, in the control plane, so a client cannot raise them by editing
// a counter in the browser.
package trial

import "errors"

// ErrLimitExceeded is returned when a trial account has already consumed its
// allowance for the requested kind of AI use.
var ErrLimitExceeded = errors.New("trial AI limit exceeded")

// Kind identifies which AI operation a usage record belongs to. Generation and
// edit are counted separately as well as in a combined total.
type Kind string

const (
	// KindGeneration is AI workflow generation (a prompt becomes a definition).
	KindGeneration Kind = "generation"
	// KindEdit is AI workflow editing/refinement of an existing definition.
	KindEdit Kind = "edit"
)

// Limits is the server-enforced allowance for a single trial account. A value
// of zero for any field disables that particular cap; the total cap is what
// ultimately bounds overall cost when the per-kind caps are generous.
type Limits struct {
	Generation int `json:"generation"`
	Edit       int `json:"edit"`
	Total      int `json:"total"`
}

// DefaultLimits returns the trial allowance shipped with FlowForge: five
// generations, five edits, and ten AI uses overall.
func DefaultLimits() Limits {
	return Limits{Generation: 5, Edit: 5, Total: 10}
}

// Usage is how much of a trial account's allowance has been consumed.
type Usage struct {
	Generation int `json:"generation"`
	Edit       int `json:"edit"`
	Total      int `json:"total"`
}

// Remaining reports how much of each allowance is left. Values never go
// negative, so a client can render them directly.
func (l Limits) Remaining(u Usage) Usage {
	return Usage{
		Generation: clampRemaining(l.Generation, u.Generation),
		Edit:       clampRemaining(l.Edit, u.Edit),
		Total:      clampRemaining(l.Total, u.Total),
	}
}

// Exhausted reports whether any allowance that is enforced has run out, which
// is when the UI should stop offering AI actions.
func (l Limits) Exhausted(u Usage) bool {
	remaining := l.Remaining(u)
	if l.Generation > 0 && remaining.Generation <= 0 {
		return true
	}
	if l.Edit > 0 && remaining.Edit <= 0 {
		return true
	}
	return l.Total > 0 && remaining.Total <= 0
}

func clampRemaining(limit, used int) int {
	if limit <= 0 {
		return 0
	}
	if used >= limit {
		return 0
	}
	return limit - used
}
