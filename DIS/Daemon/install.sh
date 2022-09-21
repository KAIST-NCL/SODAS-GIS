#!/bin/bash

# Directory Settings
echo " * create /opt/DHDaemon/"
sudo mkdir -p /opt/DHDaemon/
sudo mkdir -p /var/log/DHDaemon/

# Copy files / Copy service file
echo " * copy all files to /opt/DHDaemon"
sudo cp -r ../ /opt/DHDaemon/
sudo cp ./DHDaemon.service /etc/systemd/system/

# Dependency installations
echo " * Install Dependency modules"
# ...

# Loading service & Register service on booting area
echo " * Register service on booting area"
sudo -E systemctl enable DHDaemon.service
sudo -E systemctl start DHDaemon.service
sudo -E systemctl status DHDaemon.service
sudo -E systemctl daemon-reload