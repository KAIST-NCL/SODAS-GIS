#!/bin/sh
docker run -it --rm --network sodas confluentinc/cp-kafka /bin/kafka-console-producer --bootstrap-server sodas.broker:9093 --topic $1
