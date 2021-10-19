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
    this.ds_portNum = this.conf.get('DHSearch', 'portNum');
    this.bs_ip = this.conf.get('ReferenceHub', 'bootstrap_ip');
    this.bs_portNum = this.conf.get('ReferenceHub', 'bootstrap_portNum');
    this.rh_ip = this.conf.get('ReferenceHub', 'referenceHub_ip');
    this.rh_portNum = this.conf.get('ReferenceHub', 'referenceHub_portNum');
    this.kafka = this.conf.get('Kafka', 'ip');
    this.kafka_options = this.conf.get('Kafka', 'options');
    process.env.DH_HOME = this.conf.get('ENV', 'DH_HOME');
    console.log('[SETTING] DataHub daemon is running with %s:%s', this.dm_ip, this.dm_portNum);

    this.ctrlConsumer = new ctrlConsumer(this.kafka, this.kafka_options, this, this.conf);
    this.ctrlProducer = new ctrlProducer('recv.ctrl');

    this.interest_topic = [];
};

exports.DHDaemon.prototype.run = function(){

    // msg-channel(one-way) : VC -> sessionManager
    msgChn = new MessageChannel();

    // setEnvironmentData
    const dmServerParam = {'dm_ip': this.dm_ip, 'dm_portNum': this.dm_portNum, 'name': this.name};
    const dhSearchParam = {'ds_portNum': this.ds_portNum, 'bootstrap_ip': this.bs_ip, 'bootstrap_portNum': this.bs_portNum};
    const vcParam = {'sm_port': msgChn.port1};
    const smParam = {'vc_port': msgChn.port2};
    const rmSyncParam = {};

    // run daemonServer
    this.daemonServer = new Worker('./daemonServer.js', { workerData: dmServerParam });
    this.dhSearch = new Worker('../DHSearch/dhSearch.js', { workerData: dhSearchParam });
    this.VC = new Worker('../VersionControl/dmVersionController.js', { workerData: vcParam, transferList: [msgChn.port1]});
    this.sessionManager = new Worker('../SessionManager/sessionManager.js', { workerData: smParam, transferList: [msgChn.port2]});
    this.rmSync = new Worker('../RMSync/rmsync.js', { workerData: rmSyncParam });

    // setting on function
    this.daemonServer.on('message', this.dmServerListener);
    this.dhSearch.on('message', this.dhSearchListener);
    this.VC.on('message', this.VCListener);
    this.sessionManager.on('message', this.SMListener);
    this.rmSync.on('message', this.RMSyncListener);

    // run ctrlConsumer
    this.ctrlConsumer.on_message();
};

/* Worker threads Listener */
exports.DHDaemon.prototype.dmServerListener = function(message){
    switch(message.event){
        case 'UPDATE_INTEREST_TOPIC':
            console.log('[SETTING] Interest Topic is Updated!');
            this.interest_topic = message.data.interest_topic;
            this.updateInterestTopic(this.interest_topic);
            break;
        case 'START':
            this.rmSyncInit();
            break;
        case 'SYNC_ON':
            this.smInit();
            break;
        default:
            console.log('[ERROR] DM Server Listener Error ! event:', message.event);
    }
};
exports.DHDaemon.prototype.dhSearchListener = function(message){
    switch(message.event){
        case 'UPDATE_BUCKET_LIST':
            this.bucket_list = message.data;
            this.dmServerSetBucketList(this.bucket_list);
            break;
        default:
            console.log('[ERROR] DH Search Listener Error ! event:', message.event);
        //
    }
};
exports.DHDaemon.prototype.SMListener = function(message){
    switch(message.event){
        case 'GET_SESSION_LIST_INFO':
            this.sessionList = message.data;
            this.dmServerSetSessionList(this.sessionList);
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
exports.DHDaemon.prototype.VCListener = function(message){
    switch(message.event){
        case '':
            break;
        default:
            console.log('[ERROR] Version Control Listener Error !');
            break;
    }
};
exports.DHDaemon.prototype.RMSyncListener = function(message){
    switch (message.event) {
        case 'UPDATE_REFERENCE_MODEL':
            this.RM = message.data;
            this.dmServerSetRM(this.RM);
            this.ctrlProducer.produce({
                event: 'UPDATE_REFERENCE_MODEL',
                data: this.RM
            });
            this.dhSearchInit();
            this.vcUpdateReferenceModel();
            break;
        default:
            console.log('[ERROR] Reference Model Listener Error !');
            break;
    }
};

/* dhSearch methods */
exports.DHDaemon.prototype.dhSearchInit = function(){
    this.dhSearch.postMessage({
        event: 'INIT',
        data: {bootstrap_server_ip: this.bs_ip, bootstrap_server_portNum: this.bs_portNum}
    });
};
exports.DHDaemon.prototype.updateInterestTopic = function(interest_topic){
    this.dhSearch.postMessage({
        event: 'UPDATE_INTEREST_TOPIC',
        data: {interest_topic: interest_topic}
    });
};
/* RMSync methods */
exports.DHDaemon.prototype.rmSyncInit = function(){
    this.rmSync.postMessage({
        event: 'INIT',
        data: {referencehub_ip:this.rh_ip, referencehub_port:this.rh_portNum}
    });
};
/* SessionManager methods */
exports.DHDaemon.prototype.smInit= function(){
    this.sessionManager.postMessage({
        event: 'INIT',
        data: {}
    });
};
exports.DHDaemon.prototype.updateNegotiation = function(){
    // TODO 세션 동기화 옵션 업데이트 후 작성
};
exports.DHDaemon.prototype.smSyncOn = function(){
    this.sessionManager.postMessage({
        event:'SYNC_ON',
        data: this.bucket_list
    })
};
/* Version Control methods */
exports.DHDaemon.prototype.vcInit = function(){
    this.VC.postMessage({
        event: 'INIT',
        data: {}
    });
};
exports.DHDaemon.prototype.vcUpdateReferenceModel = function(){
    this.VC.postMessage({
        event: 'UPDATE_REFERENCE_MODEL',
        data: this.RM
    });
};

/* Daemon Server methods */
exports.DHDaemon.prototype.dmServerSetBucketList = function(bucket_list){
    this.daemonServer.postMessage({
        event: 'UPDATE_BUCKET_LIST',
        data: bucket_list
    });
};
exports.DHDaemon.prototype.dmServerSetRM = function(reference_model){
    this.daemonServer.postMessage({
        event: 'UPDATE_REFERENCE_MODEL',
        data: reference_model
    });
};
exports.DHDaemon.prototype.dmServerSetSessionList = function(sessionList){
    this.daemonServer.postMessage({
        event: 'UPDATE_SESSION_LIST',
        data: sessionList
    });
};

/* stop */
exports.DHDaemon.prototype.stop = function(){
    this.daemonServer.exit();
    this.dhSearch.exit();
    this.VC.exit();
    this.sessionManager.exit();
};


const daemon = new dm.DHDaemon();
daemon.run();

process.on('SIGINT', () => {
    daemon.stop();
    process.exit();
});

process.on('SIGTERM', () => {
    daemon.stop();
    process.exit();
});


