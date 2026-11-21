package scripts

import (
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/dop251/goja"
)

const (
	maximumScriptSize     = 256 * 1024
	maximumExecutionTime  = 250 * time.Millisecond
	maximumCallStackDepth = 256
)

var ErrScriptTooLarge = errors.New("script exceeds the maximum size")

type Context struct {
	Request            map[string]any `json:"request"`
	Response           map[string]any `json:"response"`
	Environment        map[string]any `json:"environment"`
	MutableEnvironment bool           `json:"-"`
}

type Result struct {
	Request     map[string]any `json:"request"`
	Response    map[string]any `json:"response"`
	Environment map[string]any `json:"environment"`
}

func Execute(source string, input Context) (Result, error) {
	if len(source) > maximumScriptSize {
		return Result{}, ErrScriptTooLarge
	}
	vm := goja.New()
	vm.SetMaxCallStackSize(maximumCallStackDepth)
	for name, value := range map[string]map[string]any{"request": nonNilMap(input.Request), "response": nonNilMap(input.Response), "environment": nonNilMap(input.Environment)} {
		encoded, err := json.Marshal(value)
		if err != nil {
			return Result{}, err
		}
		if err = vm.Set(name+"JSON", string(encoded)); err != nil {
			return Result{}, err
		}
	}
	if _, err := vm.RunString("var request = JSON.parse(requestJSON); var response = JSON.parse(responseJSON); var environment = JSON.parse(environmentJSON); Object.freeze(response);"); err != nil {
		return Result{}, err
	}
	if !input.MutableEnvironment {
		if _, err := vm.RunString("Object.freeze(environment);"); err != nil {
			return Result{}, err
		}
	}
	timer := time.AfterFunc(maximumExecutionTime, func() { vm.Interrupt("script execution timed out") })
	defer timer.Stop()
	if _, err := vm.RunString(source); err != nil {
		return Result{}, fmt.Errorf("script execution failed: %w", err)
	}
	result := Result{}
	if err := vm.ExportTo(vm.Get("request"), &result.Request); err != nil {
		return Result{}, err
	}
	if err := vm.ExportTo(vm.Get("response"), &result.Response); err != nil {
		return Result{}, err
	}
	if err := vm.ExportTo(vm.Get("environment"), &result.Environment); err != nil {
		return Result{}, err
	}
	return result, nil
}

func nonNilMap(value map[string]any) map[string]any {
	if value == nil {
		return map[string]any{}
	}
	return value
}
