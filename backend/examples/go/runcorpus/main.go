// Command runcorpus runs the published hydration corpus against this implementation.
//
// Every case is a screen, a payload, the document a device should receive, and the expressions that
// should have been reported as unresolved. If all of them pass, this implementation agrees with
// every other one -- which is the only definition of correct that means anything here.
//
//	go run ./runcorpus [path/to/corpus]
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"

	"heimui.io/hydration"
)

type testCase struct {
	Options struct {
		OnUnresolved string `json:"onUnresolved"`
	} `json:"options"`
	Screen             map[string]any `json:"screen"`
	Data               map[string]any `json:"data"`
	Expected           map[string]any `json:"expected"`
	ExpectedUnresolved []struct {
		NodeID     string `json:"nodeId"`
		Property   string `json:"property"`
		Expression string `json:"expression"`
	} `json:"expectedUnresolved"`
}

func main() {
	dir := "../../corpus"
	if len(os.Args) > 1 {
		dir = os.Args[1]
	}

	files, err := filepath.Glob(filepath.Join(dir, "*.json"))
	if err != nil || len(files) == 0 {
		fmt.Fprintf(os.Stderr, "no cases found in %s\n", dir)
		os.Exit(1)
	}
	sort.Strings(files)

	var failures []string
	for _, path := range files {
		raw, err := os.ReadFile(path)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		var c testCase
		if err := json.Unmarshal(raw, &c); err != nil {
			fmt.Fprintf(os.Stderr, "%s: %v\n", filepath.Base(path), err)
			os.Exit(1)
		}

		policy := hydration.Keep
		if c.Options.OnUnresolved == "blank" {
			policy = hydration.Blank
		}
		result := hydration.HydrateWithReport(c.Screen, c.Data, policy)

		name := filepath.Base(path)
		before := len(failures)
		if !reflect.DeepEqual(result.Document, c.Expected) {
			failures = append(failures, fmt.Sprintf("%s: document\n  expected %s\n  but was  %s",
				name, compact(c.Expected), compact(result.Document)))
		}

		wanted := make([]string, 0, len(c.ExpectedUnresolved))
		for _, u := range c.ExpectedUnresolved {
			wanted = append(wanted, u.NodeID+"|"+u.Property+"|"+u.Expression)
		}
		got := make([]string, 0, len(result.Unresolved))
		for _, u := range result.Unresolved {
			got = append(got, u.NodeID+"|"+u.Property+"|"+u.Expression)
		}
		if strings.Join(wanted, ",") != strings.Join(got, ",") {
			failures = append(failures, fmt.Sprintf("%s: unresolved\n  expected %v\n  but was  %v", name, wanted, got))
		}

		if len(failures) == before {
			fmt.Println("  ok   " + name)
		} else {
			fmt.Println("  FAIL " + name)
		}
	}

	fmt.Println()
	if len(failures) > 0 {
		fmt.Fprintln(os.Stderr, strings.Join(failures, "\n"))
		os.Exit(1)
	}
	fmt.Printf("%d/%d cases pass.\n", len(files), len(files))
}

func compact(v any) string {
	encoded, _ := json.Marshal(v)
	return string(encoded)
}
