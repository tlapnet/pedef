.PHONY: install build lint test fulltest docker-build docker-push docker-run docker-start docker-test docker-test-api

# Registry prefix for docker-push, e.g. registry.example.com/team (empty = local image only)
DOCKER_REGISTRY ?=
DOCKER_SERVICE_NAME ?= pedef
# Image tag: the git tag/commit (git describe), falling back to the version from package.json
DOCKER_TAG ?= $(shell git describe --tags --always --dirty 2>/dev/null || node -p "require('./package.json').version")
DOCKER_IMAGE := $(if $(DOCKER_REGISTRY),$(DOCKER_REGISTRY)/)$(DOCKER_SERVICE_NAME):$(DOCKER_TAG)
PORT ?= 8081

install:
	npm ci

build:
	npm run build

lint:
	npm run lint

test: build
	npm test

fulltest:
	npm run fulltest

docker-build:
	docker build -t $(DOCKER_IMAGE) .

docker-push:
	@test -n "$(DOCKER_REGISTRY)" || { echo "Set DOCKER_REGISTRY, e.g. make docker-push DOCKER_REGISTRY=registry.example.com/team"; exit 1; }
	docker push $(DOCKER_IMAGE)

docker-run docker-start:
	docker run --rm -it -p $(PORT):8081 $(DOCKER_IMAGE)

# Black-box API tests against the built image
docker-test docker-test-api:
	test/api/run-against-image.sh $(DOCKER_IMAGE)
