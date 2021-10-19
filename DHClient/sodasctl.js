#!/usr/bin/env node
const dhClient = require('./dhclient');
const client = new dhClient.dhClient();
console.log( "Hello!" );
client.dhList;
