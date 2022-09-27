#!/bin/sh
docker run --rm --network=sodas --name=sodas.datahub -it sodas/dhdaemon:v01 node DHDaemon.js
