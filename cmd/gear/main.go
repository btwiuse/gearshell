package main

import (
	"context"
	"errors"
	"os"

	"charm.land/fang/v2"
)

func main() {
	err := fang.Execute(context.Background(), NewRootCommand())
	if err == nil {
		return
	}
	var ee *exitError
	if errors.As(err, &ee) {
		os.Exit(ee.code)
	}
	os.Exit(1)
}
