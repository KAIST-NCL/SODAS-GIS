#!/usr/bin/env node
const dhClient = require('./dhclient');
const yargs = require('yargs');
const client = new dhClient.dhClient();
const options = yargs
    .usage("Usage: -l <options> -i <list of interests> ")
    .option("l", { alias: 'list', describe: 'list of entities <datahub> or <session>', type: 'string'})
    .option("i", { alias: 'set-interest', describe: 'set list of interests <interests>', type: 'array'})
    .argv;

switch(options.list){
    case 'datahub':
    case 'dh':
        client.dhList;
        return;
    case 'session':
        client.sessionList;
        return;
}
if(options.i){
    client.setInterest(options.i);
    return
}
yargs.showHelp();
