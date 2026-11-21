GO ?= go
NPM ?= npm
LIZARD ?= lizard
LIZARD_DUPLICATE_RATE ?= 5
GITLEAKS ?= gitleaks
TRIVY ?= trivy

FRONTEND_DIR := src/frontend
GO_DIR := src
BUILD_DIR := build
BINARY := $(BUILD_DIR)/tomorrow
LINUX_SHARE_DIR := $(BUILD_DIR)/share
LINUX_DESKTOP_ENTRY := $(LINUX_SHARE_DIR)/applications/org.tomorrow.Tomorrow.desktop
PACKAGE_VERSION := 0.1.0
PACKAGE_ROOT := $(BUILD_DIR)/linux-deb-root
APP_ICON_SIZES := 16 32 48 128 256

.DEFAULT_GOAL := help
.PHONY: help install dev frontend-dev storybook build-storybook build linux-desktop-data build-windows build-macos package-linux-deb release run test check e2e lint security clean

help: ## Show available commands
	@awk 'BEGIN {FS = ":.*##"; print "Tomorrow development commands:"} /^[a-zA-Z0-9_-]+:.*##/ {printf "  %-16s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install frontend dependencies from the lockfile
	$(NPM) --prefix $(FRONTEND_DIR) ci

dev: ## Start the frontend development server
	$(NPM) --prefix $(FRONTEND_DIR) run dev

frontend-dev: dev ## Alias for dev

storybook: ## Start the frontend component documentation
	$(NPM) --prefix $(FRONTEND_DIR) run storybook

build-storybook: ## Build the frontend component documentation
	$(NPM) --prefix $(FRONTEND_DIR) run build-storybook

build: ## Build the frontend and desktop application
	$(NPM) --prefix $(FRONTEND_DIR) run build
	mkdir -p $(BUILD_DIR)
	cd $(GO_DIR) && $(GO) build -o ../$(BINARY) .
	$(MAKE) linux-desktop-data

linux-desktop-data: ## Prepare Linux desktop metadata and icon theme assets
	mkdir -p $(LINUX_SHARE_DIR)/applications
	sed 's|@EXEC_PATH@|$(abspath $(BINARY))|g' src/linux/org.tomorrow.Tomorrow.desktop > $(LINUX_DESKTOP_ENTRY)
	for size in $(APP_ICON_SIZES); do \
		icon_dir="$(LINUX_SHARE_DIR)/icons/hicolor/$${size}x$${size}/apps"; \
		mkdir -p "$$icon_dir"; \
		cp "src/icons/tomorrow-$${size}.png" "$$icon_dir/tomorrow.png"; \
	done

build-windows: ## Build the Windows x64 executable with the application icon
	$(NPM) --prefix $(FRONTEND_DIR) run build
	mkdir -p $(BUILD_DIR)/windows
	cd $(GO_DIR) && WAILS_PUREGO=1 GOOS=windows GOARCH=amd64 $(GO) build -o ../$(BUILD_DIR)/windows/Tomorrow.exe .

build-macos: ## Build macOS Intel and Apple Silicon executables with the application icon
	$(NPM) --prefix $(FRONTEND_DIR) run build
	mkdir -p $(BUILD_DIR)/macos
	cd $(GO_DIR) && WAILS_PUREGO=1 GOOS=darwin GOARCH=amd64 $(GO) build -tags=purego -o ../$(BUILD_DIR)/macos/Tomorrow-amd64 .
	cd $(GO_DIR) && WAILS_PUREGO=1 GOOS=darwin GOARCH=arm64 $(GO) build -tags=purego -o ../$(BUILD_DIR)/macos/Tomorrow-arm64 .

package-linux-deb: build ## Package the Linux x64 application as a .deb with desktop and icon assets
	mkdir -p $(PACKAGE_ROOT)/DEBIAN $(PACKAGE_ROOT)/usr/bin $(PACKAGE_ROOT)/usr/share/applications
	install -m 0755 $(BINARY) $(PACKAGE_ROOT)/usr/bin/tomorrow
	sed 's|@EXEC_PATH@|tomorrow|g' src/linux/org.tomorrow.Tomorrow.desktop > $(PACKAGE_ROOT)/usr/share/applications/org.tomorrow.Tomorrow.desktop
	for size in $(APP_ICON_SIZES); do \
		icon_dir="$(PACKAGE_ROOT)/usr/share/icons/hicolor/$${size}x$${size}/apps"; \
		mkdir -p "$$icon_dir"; \
		install -m 0644 "src/icons/tomorrow-$${size}.png" "$$icon_dir/tomorrow.png"; \
	done
	printf 'Package: tomorrow-api-client\nVersion: $(PACKAGE_VERSION)\nSection: devel\nPriority: optional\nArchitecture: amd64\nMaintainer: Tomorrow API Client\nDescription: Offline-first HTTP API client\n' > $(PACKAGE_ROOT)/DEBIAN/control
	dpkg-deb --root-owner-group --build $(PACKAGE_ROOT) $(BUILD_DIR)/tomorrow_$(PACKAGE_VERSION)_amd64.deb

release: build-windows build-macos package-linux-deb ## Build Windows, macOS, and Linux .deb release artifacts

ifeq ($(shell uname -s),Linux)
run: build ## Build and run the desktop application
	XDG_DATA_DIRS="$(abspath $(LINUX_SHARE_DIR)):$${XDG_DATA_DIRS:-/usr/local/share:/usr/share}" ./$(BINARY)
else
run: build ## Build and run the desktop application
	./$(BINARY)
endif

test: ## Run Go unit tests and frontend type checks
	cd $(GO_DIR) && $(GO) test ./...
	$(NPM) --prefix $(FRONTEND_DIR) run check

check: test build ## Run tests, type checks, and production build

e2e: ## Run Playwright end-to-end tests
	$(NPM) --prefix $(FRONTEND_DIR) run test:e2e

lint: ## Run the configured Lizard complexity and duplication checks
	@report=$$(mktemp); \
	trap 'rm -f "$$report"' EXIT; \
	if ! $(LIZARD) . --CCN 15 --length 50 --Threshold nloc=50 --arguments 5 --extension cognitive --CogC 15 --extension duplicate --warnings_only --ignore_warnings 0 --exclude 'src/frontend/node_modules/*' --exclude 'src/frontend/dist/*' --exclude './src/frontend/storybook-static/*' --exclude './src/frontend/test-results/*' --exclude './src/frontend/playwright-report/*' --exclude './src/frontend/coverage/*' --exclude './src/frontend/src/**/*.stories.ts' --exclude 'src/node_modules/*' --exclude 'build/*' --exclude '.env' --exclude '**/.env.*' > "$$report"; then \
		cat "$$report"; \
		exit 1; \
	fi; \
	cat "$$report"; \
	awk -v limit='$(LIZARD_DUPLICATE_RATE)' '/^Total duplicate rate:/ { rate = $$4; sub(/%$$/, "", rate); found = 1; if (rate > limit) { printf "Duplicate rate %.2f%% exceeds limit %.2f%%\n", rate, limit; failed = 1 } } END { if (!found) { print "Lizard duplicate rate was not reported"; exit 1 } if (failed) exit 1 }' "$$report"

security: ## Scan tracked source with Gitleaks and dependencies/configuration with Trivy
	GITLEAKS=$(GITLEAKS) TRIVY=$(TRIVY) ./scripts/security-scan.sh

clean: ## Remove generated build and frontend output
	rm -rf $(BUILD_DIR) $(FRONTEND_DIR)/dist
