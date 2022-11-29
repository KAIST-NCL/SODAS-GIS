#!/bin/sh

# Docker Container에서 돌릴 수 있게끔 코드를 수정하고 컨테이너를 올리는 프로그램
# 토근 파일 존재 여부 확인 후 없으면 입력받는다
if [ -f "./token" ]; then
    echo "Token found"
    read -r token < ./token
else
    # 토큰 입력 받기
    echo "Enter your Token for Git: "
    read -r token
fi

echo " *** Docker network create"
sudo docker network create sodas

echo " *** Docker network set-up"
cd Docker/DIS && sudo docker-compose up -d
cd ../..
cd Docker/GIS && sudo docker-compose up -d
cd ../..
cd Docker/DIS/DH2 && sudo docker-compose up -d
cd ../../..

echo " *** Build DH1"
sudo docker build -t sodas/dhdaemon:v01 --build-arg REPO_TOKEN="${token}" Docker/DIS --no-cache

echo " *** Build DH2"
sudo docker build -t sodas/dhdaemon2:v01 --build-arg REPO_TOKEN="${token}" Docker/DIS/DH2 --no-cache

echo " *** Build GS"
sudo docker build -t sodas/gsdaemon:v01 --build-arg REPO_TOKEN="${token}" Docker/GIS --no-cache

echo "Go to Docker automation folder for Automated scripts"
echo "compose-setting.sh - Reconfigure docker compose files if network malfunctions"
echo "disdaemon1.sh - Run docker cotainer of DIS1 and execute program automatically"
echo "disdaemon2.sh - Run docker cotainer of DIS2 and execute program automatically"
echo "gisdaemon.sh - Run docker cotainer of GIS and execute program automatically"
echo "kafka_producer1.sh <topic> - Open a kafka producer for DIS1 with topic of <topic>"
echo "kafka_producer2.sh <topic> - Open a kafka producer for DIS2 with topic of <topic>"
echo "kafka_consumer1.sh <topic> - Open a kafka consumer for DIS1 with topic of <topic>"
echo "kafka_consumer2.sh <topic> - Open a kafka consumer for DIS2 with topic of <topic>"