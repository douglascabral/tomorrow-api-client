//go:build linux && cgo && !gtk3

package main

/*
#cgo pkg-config: gtk4
#include <gtk/gtk.h>
#include <stdlib.h>

static void setWindowIconName(void *window, const char *name) {
	gtk_window_set_icon_name(GTK_WINDOW(window), name);
}
*/
import "C"

import (
	"unsafe"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func setLinuxWindowIcon(window *application.WebviewWindow) {
	application.InvokeAsync(func() {
		nativeWindow := window.NativeWindow()
		if nativeWindow == nil {
			return
		}
		iconName := C.CString(linuxIconThemeName)
		defer C.free(unsafe.Pointer(iconName))
		C.setWindowIconName(nativeWindow, iconName)
	})
}
