package execution

import "testing"

func TestSummarizeTaskFailure(t *testing.T) {
	cases := []struct {
		name string
		runs []TaskRun
		want string
	}{
		{
			name: "no failed task falls back to a generic reason",
			runs: []TaskRun{{TaskID: "a", Status: "succeeded"}, {TaskID: "b", Status: "blocked"}},
			want: "task failed",
		},
		{
			name: "names the failed task and includes its reason",
			runs: []TaskRun{{TaskID: "fetch", Status: "failed", FailureReason: "HTTP 500"}},
			want: "task \"fetch\" failed: HTTP 500",
		},
		{
			name: "names the failed task when it has no reason",
			runs: []TaskRun{{TaskID: "fetch", Status: "failed"}},
			want: "task \"fetch\" failed",
		},
		{
			name: "blank reason is treated as missing",
			runs: []TaskRun{{TaskID: "fetch", Status: "failed", FailureReason: "   "}},
			want: "task \"fetch\" failed",
		},
		{
			name: "several failures report the earliest by id",
			runs: []TaskRun{
				{TaskID: "z", Status: "failed", FailureReason: "boom"},
				{TaskID: "a", Status: "failed", FailureReason: "kaput"},
			},
			want: "task \"a\" failed: kaput",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := summarizeTaskFailure(tc.runs); got != tc.want {
				t.Fatalf("summarizeTaskFailure() = %q, want %q", got, tc.want)
			}
		})
	}
}
