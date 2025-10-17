SHELL := /bin/bash

.PHONY: help install clean lint lint-fix test test-api test-e2e test-templates verify build build-all build-client build-lambda dev deploy sam-build sam-deploy coverage

help:
	@echo "Available targets:"
	@echo "  install        Install root and client dependencies"
	@echo "  clean          Remove generated build, coverage, and SAM artifacts"
	@echo "  lint           Run eslint across the monorepo"
	@echo "  lint-fix       Auto-fix lint violations where possible"
	@echo "  test           Execute the full Jest suite"
	@echo "  test-api       Run API/integration tests"
	@echo "  test-e2e       Run end-to-end flows"
	@echo "  test-templates Run regression coverage for document templates"
	@echo "  verify         Run lint + unit/integration/e2e/template tests"
	@echo "  build          Build client and lambda bundles"
	@echo "  build-all      Clean and rebuild everything"
	@echo "  build-client   Build the React client bundle"
	@echo "  build-lambda   Build serverless functions"
	@echo "  dev            Start the local API server"
	@echo "  deploy         Build & deploy with SAM using cached layers"
	@echo "  sam-build      Run 'sam build --cached --parallel'"
	@echo "  sam-deploy     Run 'sam deploy' with current configuration"
	@echo "  coverage       Run tests with coverage output"

install:
	npm ci && cd client && npm ci

clean:
	npm run clean

lint:
	npm run lint

lint-fix:
	npm run fix

test:
	npm run test

test-api:
	npm run test:api

test-e2e:
	npm run test:e2e

test-templates:
	npm run test:templates

verify:
	npm run verify

build:
	npm run build

build-all:
	npm run build:all

build-client:
	npm run build:client

build-lambda:
	npm run build:lambda

dev:
	npm run dev

deploy:
	npm run deploy:sam

sam-build:
	sam build --cached --parallel

sam-deploy:
	sam deploy

coverage:
	npm run test -- --coverage
