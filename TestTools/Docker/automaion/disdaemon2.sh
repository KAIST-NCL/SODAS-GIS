#!/bin/sh
docker run --rm --network=sodas --name=sodas.datahub2 -it sodas/dhdaemon2:v01 node DHDaemon.js
