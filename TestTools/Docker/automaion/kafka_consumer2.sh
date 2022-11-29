#!/bin/sh
docker run -it --rm --network sodas confluentinc/cp-kafka /bin/kafka-console-consumer --bootstrap-server sodas.dh1.broker:9095 --topic $1