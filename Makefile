.PHONY: test docker-build docker-push docker-test docker-start

DOCKER_TAG := master
DOCKER_SERVICE_NAME := pedef
DOCKER_REGISTRY := docker.nexus.ispa.cz/ispa
DOCKER_IMAGE := $(DOCKER_REGISTRY)/$(DOCKER_SERVICE_NAME):$(DOCKER_TAG)

docker-build:
	docker build -t $(DOCKER_IMAGE) .

docker-push:
	docker push $(DOCKER_IMAGE)

docker-test:
	docker run $(DOCKER_IMAGE) bash -c "rm -rf node_modules && npm install && npm run fulltest"

docker-start:
	docker run -it -p 8081:8081 $(DOCKER_IMAGE) bash -c "rm -rf node_modules && npm install && npm start"

docker-dev:
	docker run -it -p 8081:8081 -v $(CURDIR):/app $(DOCKER_IMAGE) bash
