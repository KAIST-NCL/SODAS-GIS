const ConfigParser = require('configparser');
const { Worker, MessageChannel } = require("worker_threads");
const dm = require('./DHDaemon');
const { ctrlConsumer, ctrlProducer } = require('./ctrlKafka');
const debug = require('debug')('sodas:daemon');
const fs = require("fs");

'use strict';
const { networkInterfaces } = require('os');
const nets = networkInterfaces();
const ips = Object.create(null); // Or just '{}', an empty object

exports.DHDaemon = function(){

    this.conf = new ConfigParser();
    this.conf.read('../setting.cfg');
    this.name = this.conf.get('Daemon', 'name');
    this.dm_network = this.conf.get('Daemon', 'networkInterface');
    this.dm_portNum = this.conf.get('Daemon', 'portNum');
    this.ds_portNum = this.conf.get('DHSearch', 'portNum');
    this.rm_portNum = this.conf.get('RMSync', 'portNum');
    this.rmSync_rootDir = this.conf.get('RMSync', 'rmSyncRootDir');
    this.sl_portNum = this.conf.get('SessionListener', 'portNum');
    this.bs_ip = this.conf.get('ReferenceHub', 'bootstrap_ip');
    this.bs_portNum = this.conf.get('ReferenceHub', 'bootstrap_portNum');
    this.rh_ip = this.conf.get('ReferenceHub', 'referenceHub_ip');
    this.rh_portNum = this.conf.get('ReferenceHub', 'referenceHub_portNum');
    this.kafka = this.conf.get('Kafka', 'ip');
    this.kafka_options = this.conf.get('Kafka', 'options');
    this.sync_interest_list = this.conf.get('Session', 'sync_interest_list');
    this.data_catalog_vocab = this.conf.get('Session', 'data_catalog_vocab');
    this.sync_time = this.conf.get('Session', 'sync_time');
    this.sync_count = this.conf.get('Session', 'sync_count');
    this.transfer_interface = this.conf.get('Session', 'transfer_interface');
    this.sn_options = {
        datamap_desc:{
            sync_interest_list: this.sync_interest_list.split(','),
            data_catalog_vocab: this.data_catalog_vocab.split(',')
        },
        sync_desc: {
            sync_time: this.sync_time.split(',').map(Number),
            sync_count: this.sync_count.split(',').map(Number),
            transfer_interface: this.transfer_interface.split(',')
        }
    };

    // get ip from local
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
            if (net.family === 'IPv4' && !net.internal) {
                if (!ips[name]) {
                    ips[name] = [];
                }
                ips[name].push(net.address);
            }
        }
    }
    this.dm_ip = ips[this.dm_network][0];
    debug('[LOG]: ip', this.dm_ip);
    debug('[LOG]: session negotiation option', this.sn_options);
    this.pubvc_root = this.conf.get('VersionControl', 'pubvc_root');
    this.subvc_root = this.conf.get('VersionControl', 'subvc_root');
    this.commit_period = this.conf.get('VersionControl', 'commit_period');

    process.env.DH_HOME = this.conf.get('ENV', 'DH_HOME');
    debug('[SETTING] DataHub daemon is running with %s:%s', this.dm_ip, this.dm_portNum);
    this.ctrlProducer = new ctrlProducer(this.kafka);
    // ctrlConsumer will be created in init()

    this.interest = [];
    this.bucketList = null;
};
exports.DHDaemon.prototype.init = async function(){
    // create kafka topic if doesn't exist
    self = this;
    await this.ctrlProducer.createCtrlTopics()
        .then(() => {
            self.ctrlConsumer = new ctrlConsumer(self.kafka, self.kafka_options, self, self.conf);
        })
        .catch((e) => {
            debug(e)
        });

    debug('[SETTING] init');
};
exports.DHDaemon.prototype.run = function(){

    // msg-channel(one-way) : VC -> sessionManager
    msgChn = new MessageChannel();
    // vc git flag
    const sharedArrayBuffer = new SharedArrayBuffer(Int8Array.BYTES_PER_ELEMENT);
    const mutex_flag = new Int8Array(sharedArrayBuffer);
    self = this;

    // setEnvironmentData
    const dmServerParam = {'dm_ip': this.dm_ip, 'dm_portNum': this.dm_portNum, 'name': this.name};
    const dhSearchParam = {'dm_ip': this.dm_ip, 'ds_portNum': this.ds_portNum, 'sl_portNum': this.sl_portNum, 'bootstrap_ip': this.bs_ip, 'bootstrap_portNum': this.bs_portNum};
    const vcParam = {'sm_port': msgChn.port1, 'rmsync_root_dir': this.rmSync_rootDir, 'kafka': this.kafka, 'kafka_options': this.kafka_options, 'pubvc_root': this.pubvc_root, 'commit_period': this.commit_period, 'mutex_flag': mutex_flag};
    const smParam = {'vc_port': msgChn.port2, 'dm_ip': this.dm_ip, 'sl_portNum': this.sl_portNum, 'sn_options':this.sn_options, 'pubvc_root': this.pubvc_root, 'subvc_root': this.subvc_root, 'mutex_flag': mutex_flag};
    const rmSyncParam = {'dm_ip': this.dm_ip, 'rm_port': this.rm_portNum, 'rh_ip': this.rh_ip, 'rh_portNum': this.rh_portNum, 'rmsync_root_dir': this.rmSync_rootDir};

    // run daemonServer
    this.daemonServer = new Worker('./daemonServer.js', { workerData: dmServerParam });
    this.dhSearch = new Worker('../DHSearch/dhSearch.js', { workerData: dhSearchParam });
    this.VC = new Worker('../VersionControl/vcModule.js', { workerData: vcParam, transferList: [msgChn.port1]});
    this.sessionManager = new Worker('../SessionManager/sessionManager.js', { workerData: smParam, transferList: [msgChn.port2]});
    this.rmSync = new Worker('../RMSync/rmSync.js', { workerData: rmSyncParam });
    //
    // setting on function
    this.daemonServer.on('message', function(message){self._dmServerListener(message)});
    this.dhSearch.on('message', function(message) {self._dhSearchListener(message)});
    this.VC.on('message', function(message) {self._vcListener(message)});
    this.sessionManager.on('message', function(message) {self._smListener(message)});
    this.rmSync.on('message', function(message){self._rmSyncListener(message)});

    // run ctrlConsumer
    this.ctrlConsumer.onMessage();
};
exports.DHDaemon.prototype.stop = function(){
    this.daemonServer.exit();
    this.dhSearch.exit();
    this.VC.exit();
    this.sessionManager.exit();
    this.rmSync.exit();
};

/* Worker threads Listener */
exports.DHDaemon.prototype._dmServerListener = function(message){
    switch(message.event){
        case 'UPDATE':
            // TODO: dmServer-side UPDATE should be implemented
            debug('[SETTING] UPDATE is called !');
            var interest= message.data.interest.interest_list;
            var rm = message.data.interest.reference_model;
            this._dhSearchUpdateInterestTopic(interest);
            this._vcUpdateReferenceModel(rm);
            break;
        case 'UPDATE_INTEREST_TOPIC':
            debug('[SETTING] Interest Topic is Updated!');
            var interest= message.data.interest;
            this._dhSearchUpdateInterestTopic(interest);
            break;
        case 'START':
            this._rmSyncInit();
            break;
        case 'SYNC_ON':
            this._smSyncOn();
            break;
        default:
            debug('[ERROR] DM Server Listener Error ! event:', message.event);
    }
};
exports.DHDaemon.prototype._dhSearchListener = function(message){
    switch(message.event){
        case 'UPDATE_BUCKET_LIST':
            this.bucketList = message.data;
            this._dmServerSetBucketList(this.bucketList);
            break;
        default:
            debug('[ERROR] DH Search Listener Error ! event:', message.event);
        //
    }
};
exports.DHDaemon.prototype._smListener = function(message){
    switch(message.event){
        case 'GET_SESSION_LIST_INFO':
            this.sessionList = message.data;
            this._dmServerSetSessionList(this.sessionList);
            this.ctrlProducer.produce({
                event: 'UPDATE_SESSION_LIST',
                data: this.sessionList
            });
            break;
        default:
            debug('[ERROR] Session Manager Listener Error ! event:', message.event);
            break;
    }
};
exports.DHDaemon.prototype._vcListener = function(message){
    switch(message.event){
        case '':
            break;
        default:
            debug('[ERROR] Version Control Listener Error !');
            break;
    }
};
exports.DHDaemon.prototype._rmSyncListener = function(message){
    self = this;
    switch (message.event) {
        case 'UPDATE_REFERENCE_MODEL':
            debug('[DEBUG] UPDATE_REFERENCE_MODEL is passed. The reference models are transferred to ctrlProducer', message.data);
            for (var i = 0; i < message.data.path.length; i++) {
                const rmPath = self.rmSync_rootDir+ '/gitDB/' + message.data.path[i];
                debug('[DEBUG] read ' + rmPath + ' file (reference models...)')
                fs.readFile(rmPath, 'utf8', function(err, data){
                    self.ctrlProducer.sendUpdate(rmPath, data);
                });
            }
            debug('[Function Test / UPDATE REFERENCE MODEL] UPDATE event is sent to Kafka');
            this._vcUpdateReferenceModel(message.data.path);
            break;
        default:
            debug('[DAEMON/ERROR] Reference Model Listener Error !');
            break;
    }
};

/* dhSearch methods */
exports.DHDaemon.prototype._dhSearchUpdateInterestTopic = function(interestTopic){
    this.dhSearch.postMessage({
        event: 'UPDATE_INTEREST_TOPIC',
        data: {sync_interest_list: interestTopic}
    });
    debug('[Function Test / UPDATE Process] UPDATE interest topic with ', interestTopic);
};
/* RMSync-related methods */
exports.DHDaemon.prototype._rmSyncInit = function(){
    this.rmSync.postMessage({
        event: 'INIT',
        data: {}
    });
};
/* SessionManager-related methods */
exports.DHDaemon.prototype._smInit= function(){
    this.sessionManager.postMessage({
        event: 'INIT',
        data: {}
    });
};
exports.DHDaemon.prototype._smUpdateNegotiation = function(session_negotiation_option){
    this.sessionManager.postMessage({
        event: 'UPDATE_NEGOTIATION_OPTIONS',
        data: {sn_options: session_negotiation_option}
    });
    debug('[Function Test / UPDATE Process] UPDATE negotiation option ', session_negotiation_option);
};
exports.DHDaemon.prototype._smSyncOn = function(){
    debug('[Function Test / SYNCON Process] SYNC_ON event detected');
    if(this.bucketList == null) return -1;
    this.sessionManager.postMessage({
        event:'SYNC_ON',
        data: this.bucketList
    });
    return 1;
};
/* Version Control methods */
exports.DHDaemon.prototype._vcInit = function(){
    this.VC.postMessage({
        event: 'INIT',
        data: {}
    });
};
exports.DHDaemon.prototype._vcUpdateReferenceModel = function(referenceModel){
    this.VC.postMessage({
        event: 'UPDATE_REFERENCE_MODEL',
        data: referenceModel
    });
    debug('[Function Test / UPDATE Process] UPDATE reference model ', referenceModel);
};

/* Daemon Server methods */
exports.DHDaemon.prototype._dmServerSetBucketList = function(bucket_list){
    this.daemonServer.postMessage({
        event: 'UPDATE_BUCKET_LIST',
        data: bucket_list
    });
};
exports.DHDaemon.prototype._dmServerSetRM = function(referenceModel){
    this.daemonServer.postMessage({
        event: 'UPDATE_REFERENCE_MODEL',
        data: referenceModel
    });
};
exports.DHDaemon.prototype._dmServerSetSessionList = function(sessionList){
    this.daemonServer.postMessage({
        event: 'UPDATE_SESSION_LIST',
        data: sessionList
    });
};
exports.DHDaemon.prototype._raiseError = function(errorCode){
    debug(errorCode);
    this.ctrlProducer.sendError(errorCode);
};

const daemon = new dm.DHDaemon();
daemon.init().then(() => {daemon.run();});

process.on('SIGINT', () => {
    daemon.stop();
    process.exit();
});

process.on('SIGTERM', () => {
    daemon.stop();
    process.exit();
});


