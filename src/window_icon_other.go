//go:build !linux || !cgo || gtk3

package main

import "github.com/wailsapp/wails/v3/pkg/application"

func setLinuxWindowIcon(_ *application.WebviewWindow) {}
