#!/bin/sh
docker run -it --rm --network sodas confluentinc/cp-kafka /bin/kafka-console-producer --bootstrap-server sodas.gs.broker:9094 --topic $1
