.PHONY: test docker-build docker-push docker-test docker-start ensure-tag

DOCKER_SERVICE_NAME := pedef
DOCKER_REGISTRY := docker.nexus.ispa.cz/ispa/
DOCKER_IMAGE := $(DOCKER_REGISTRY)$(DOCKER_SERVICE_NAME):$(TAG)

ensure-tag:
ifndef TAG
	$(error mandatory env TAG is not set)
endif

docker-build: ensure-tag
	docker build -t $(DOCKER_IMAGE) .

docker-push: ensure-tag
	docker push $(DOCKER_IMAGE)

docker-test: ensure-tag
	docker run $(DOCKER_IMAGE) bash -c "rm -rf node_modules && npm install && npm run fulltest"

docker-start: ensure-tag
	docker run -it -p 8081:8081 $(DOCKER_IMAGE) bash -c "rm -rf node_modules && npm install && npm start"

