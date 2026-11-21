package postman

import (
	"encoding/json"
	"errors"
	"fmt"
)

const postmanV2 = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"

type Environment struct {
	ID     string            `json:"id,omitempty"`
	Name   string            `json:"name"`
	Values map[string]string `json:"values"`
}

type postmanEnvironment struct {
	Name   string `json:"name"`
	Values []struct {
		Key     string `json:"key"`
		Value   string `json:"value"`
		Enabled bool   `json:"enabled"`
	} `json:"values"`
}

func ImportEnvironment(data []byte) (Environment, error) {
	var input postmanEnvironment
	if err := json.Unmarshal(data, &input); err != nil {
		return Environment{}, fmt.Errorf("decode Postman environment: %w", err)
	}
	if input.Name == "" {
		return Environment{}, errors.New("Postman environment name is required")
	}
	result := Environment{Name: input.Name, Values: make(map[string]string)}
	for _, item := range input.Values {
		if item.Enabled {
			result.Values[item.Key] = item.Value
		}
	}
	return result, nil
}

func ExportEnvironment(environment Environment) ([]byte, error) {
	if environment.Name == "" {
		return nil, errors.New("environment name is required")
	}
	values := make([]map[string]any, 0, len(environment.Values))
	for key, value := range environment.Values {
		values = append(values, map[string]any{"key": key, "value": value, "enabled": true, "type": "default"})
	}
	return json.MarshalIndent(map[string]any{"name": environment.Name, "values": values, "_postman_exported_at": ""}, "", "  ")
}

func ValidateCollection(data []byte) error {
	var input struct {
		Info struct {
			Schema string `json:"schema"`
			Name   string `json:"name"`
		} `json:"info"`
	}
	if err := json.Unmarshal(data, &input); err != nil {
		return fmt.Errorf("decode Postman collection: %w", err)
	}
	if input.Info.Name == "" || input.Info.Schema != postmanV2 {
		return errors.New("unsupported Postman collection format")
	}
	return nil
}
