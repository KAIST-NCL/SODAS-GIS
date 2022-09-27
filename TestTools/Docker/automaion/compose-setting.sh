#!/bin/bash
cd ../DIS && docker-compose up -d
cd DH2 && docker-compose up -d
cd ../../GIS && docker-compose up -d
