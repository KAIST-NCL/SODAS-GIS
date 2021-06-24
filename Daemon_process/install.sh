#!/bin/bash

# Directory Settings
echo " * create /opt/Sodas_Kaist/"
sudo mkdir -p /opt/Sodas_Kaist/
sudo mkdir -p /var/log/Sodas_Kaist/

# Copy files / Copy service file
echo " * copy all files to /opt/Sodas_Kaist"
sudo cp -r ../ /opt/Sodas_Kaist/
sudo cp ./Sodas_Kaist.service /etc/systemd/system/

# Dependency installations
echo " * Install Dependency modules"
# ...

# Loading service & Register service on booting area
echo " * Register service on booting area"
sudo -E systemctl enable Sodas_Kaist.service
sudo -E systemctl start Sodas_Kaist.service
sudo -E systemctl status Sodas_Kaist.service
sudo -E systemctl daemon-reload