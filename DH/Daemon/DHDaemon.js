const ConfigParser = require('configparser');
const { Worker, MessageChannel } = require("worker_threads");
const dm = require('./DHDaemon');
const { ctrlConsumer, ctrlProducer } = require('./ctrlKafka');

exports.DHDaemon = function(){

    this.conf = new ConfigParser();
    this.conf.read('../setting.cfg');
    this.name = this.conf.get('Daemon', 'name');
    this.dm_ip = this.conf.get('Daemon', 'ip');
    this.dm_portNum = this.conf.get('Daemon', 'portNum');
    this.commit_period = this.conf.get('Daemon', 'commit_period');
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
        sync_interest_list: this.sync_interest_list,
        data_catalog_vocab: this.data_catalog_vocab,
        sync_time: this.sync_time,
        sync_count: this.sync_count,
        transfer_interface: this.transfer_interface
    };
    process.env.DH_HOME = this.conf.get('ENV', 'DH_HOME');
    console.log('[SETTING] DataHub daemon is running with %s:%s', this.dm_ip, this.dm_portNum);
    this.ctrlProducer = new ctrlProducer(this.kafka);
    // ctrlConsumer will be created in init()

    this.interest = [];
    this.bucketList = null;
};
exports.DHDaemon.prototype.init = async function(){
    // create kafka topic if doesn't exist
    await this.ctrlProducer.createCtrlTopics();
    this.ctrlConsumer = new ctrlConsumer(this.kafka, this.kafka_options, this, this.conf);
};
exports.DHDaemon.prototype.run = function(){

    // msg-channel(one-way) : VC -> sessionManager
    msgChn = new MessageChannel();
    self = this;

    // setEnvironmentData
    const dmServerParam = {'dm_ip': this.dm_ip, 'dm_portNum': this.dm_portNum, 'name': this.name};
    const dhSearchParam = {'dm_ip': this.dm_ip, 'ds_portNum': this.ds_portNum, 'sl_portNum': this.sl_portNum, 'bootstrap_ip': this.bs_ip, 'bootstrap_portNum': this.bs_portNum};
    const vcParam = {'sm_port': msgChn.port1, 'rmsync_root_dir': this.rmsync_root_dir, 'kafka': this.kafka, 'kafka_options': this.kafka_options, 'commit_period': this.commit_period};
    const smParam = {'vc_port': msgChn.port2, 'dm_ip': this.dm_ip, 'sl_port': this.sl_portNum, 'sn_options':this.sn_options};
    const rmSyncParam = {'dm_ip': this.dm_ip, 'rm_port': this.rm_portNum, 'rh_ip': this.rh_ip, 'rh_portNum': this.rh_portNum, 'rymsync_root_dir': this.rmSync_rootDir};

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
};

/* Worker threads Listener */
exports.DHDaemon.prototype._dmServerListener = function(message){
    switch(message.event){
        case 'UPDATE':
            // TODO: dmServer-side UPDATE should be implemented
            console.log('[SETTING] UPDATE is called !');
            var interest= message.data.interest;
            var rm = message.data.reference_model;
            var negotiationOption = message.data.negotiation_option;
            this._dhSearchUpdateInterestTopic(interest);
            this._vcUpdateReferenceModel(rm);
            this._smUpdateNegotiation(negotiationOption);
            break;
        case 'UPDATE_INTEREST_TOPIC':
            console.log('[SETTING] Interest Topic is Updated!');
            var interest= message.data.interest;
            this._dhSearchUpdateInterestTopic(interest);
            break;
        case 'START':
            this._rmSyncInit();
            break;
        case 'SYNC_ON':
            break;
        default:
            console.log('[ERROR] DM Server Listener Error ! event:', message.event);
    }
};
exports.DHDaemon.prototype._dhSearchListener = function(message){
    switch(message.event){
        case 'UPDATE_BUCKET_LIST':
            this.bucketList = message.data;
            this._dmServerSetBucketList(this.bucketList);
            break;
        default:
            console.log('[ERROR] DH Search Listener Error ! event:', message.event);
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
            console.log('[ERROR] Session Manager Listener Error ! event:', message.event);
            break;
    }
};
exports.DHDaemon.prototype._vcListener = function(message){
    switch(message.event){
        case '':
            break;
        default:
            console.log('[ERROR] Version Control Listener Error !');
            break;
    }
};
exports.DHDaemon.prototype._rmSyncListener = function(message){
    self = this;
    switch (message.event) {
        case 'UPDATE_REFERENCE_MODEL':
            const rmPath = message.data.path;
            const rmId = message.data.id;
            fs.readFile(rmPath, 'utf8', function(err, data){
                self.ctrlProducer.sendUpdate(rmId, data);
            });
            break;
        default:
            console.log('[ERROR] Reference Model Listener Error !');
            break;
    }
};

/* dhSearch methods */
exports.DHDaemon.prototype._dhSearchUpdateInterestTopic = function(interestTopic){
    this.dhSearch.postMessage({
        event: 'UPDATE_INTEREST_TOPIC',
        data: {interest: interestTopic}
    });
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
    })
};
exports.DHDaemon.prototype._smSyncOn = function(){
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
exports.DHDaemon.prototype._vcUpdateReferenceModel = function(){
    this.VC.postMessage({
        event: 'UPDATE_REFERENCE_MODEL',
        data: this.RM
    });
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


