#!/bin/sh
docker run --rm --network=sodas --name=sodas.governancesystem -it sodas/gsdaemon:v01 node GSDaemon.js
