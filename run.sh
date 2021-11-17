#!/usr/bin/env bash
docker run \
--rm \
--tty \
--volume "${PWD}:${PWD}" \
--workdir "${PWD}" \
buildkite/puppeteer \
main.js