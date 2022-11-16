const ConfigParser = require('configparser');
const { Worker, MessageChannel } = require("worker_threads");
const dm = require('./DHDaemon');
const { ctrlConsumer, ctrlProducer } = require('./ctrlKafka');
const debug = require('debug')('sodas:daemon');
const fs = require("fs");
const bucketparser = require('../Lib/bucketparser');
'use strict';
const { networkInterfaces } = require('os');
const crypto = require("crypto");
const nets = networkInterfaces();
const ips = Object.create(null); // Or just '{}', an empty object
const ip = require('ip');
const path = require('path');

exports.DHDaemon = function(){

    this.conf = new ConfigParser();
    this.conf.read('../setting.cfg');
    this.name = this.conf.get('Daemon', 'name');
    this.dmNetwork = this.conf.get('Daemon', 'networkInterface');
    this.dmPortNum = this.conf.get('Daemon', 'portNum');
    this.dsPortNum = this.conf.get('DHSearch', 'portNum');
    this.rmPortNum = this.conf.get('RMSync', 'portNum');
    this.rmSyncRootDir = this.conf.get('RMSync', 'rmSyncRootDir');
    this.slPortNum = this.conf.get('SessionListener', 'portNum');
    this.bsIp = this.conf.get('GovernanceSystem', 'bootstrap_ip');
    this.bsPortNum = this.conf.get('GovernanceSystem', 'bootstrap_portNum');
    this.gsIp = this.conf.get('GovernanceSystem', 'governanceSystem_ip');
    this.gsPortNum = this.conf.get('GovernanceSystem', 'governanceSystem_portNum');
    this.kafka = this.conf.get('Kafka', 'ip');
    this.kafkaOptions = this.conf.get('Kafka', 'options');
    this.syncInterestList = this.conf.get('Session', 'sync_interest_list');
    this.dataCatalogVocab = this.conf.get('Session', 'data_catalog_vocab');
    this.syncTime = this.conf.get('Session', 'sync_time');
    this.syncCount = this.conf.get('Session', 'sync_count');
    this.transferInterface = this.conf.get('Session', 'transfer_interface');
    this.snOptions = {
        datamapDesc:{
            syncInterestList: this.syncInterestList.split(','),
            dataCatalogVocab: this.dataCatalogVocab.split(',')
        },
        syncDesc: {
            syncTime: this.syncTime.split(',').map(Number),
            syncCount: this.syncCount.split(',').map(Number),
            transferInterface: this.transferInterface.split(',')
        }
    };

    this.dmIp = ip.address();
    debug('[LOG]: ip', this.dmIp);
    debug('[LOG]: session negotiation option', this.snOptions);
    this.pubvcRoot = this.conf.get('VersionControl', 'pubvc_root');
    this.subvcRoot = this.conf.get('VersionControl', 'subvc_root');
    this.commitPeriod = this.conf.get('VersionControl', 'commit_period');

    process.env.DH_HOME = this.conf.get('ENV', 'DH_HOME');
    debug('[SETTING] DataHub daemon is running with %s:%s', this.dmIp, this.dmPortNum);
    this.ctrlProducer = new ctrlProducer(this.kafka);
    // ctrlConsumer will be created in init()

    this.interest = [];
    this.bucketList = null;
    this.dhId = crypto.createHash('sha1').update(this.dmIp + ':' + this.dsPortNum).digest('hex');
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
    const mutexFlag = new Int8Array(sharedArrayBuffer);
    self = this;

    // setEnvironmentData
    const dmServerParam = {'dmIp': this.dmIp, 'dmPortNum': this.dmPortNum, 'name': this.name};
    const dhSearchParam = {'dmIp': this.dmIp, 'dsPortNum': this.dsPortNum, 'slPortNum': this.slPortNum, 'bootstrapIp': this.bsIp, 'bootstrapPortNum': this.bsPortNum};
    const vcParam = {'smPort': msgChn.port1, 'rmsyncRootDir': this.rmSyncRootDir, 'kafka': this.kafka, 'kafkaOptions': this.kafkaOptions, 'pubvcRoot': this.pubvcRoot, 'commitPeriod': this.commitPeriod, 'mutexFlag': mutexFlag};
    const smParam = {'vcPort': msgChn.port2, 'kafka': this.kafka, 'dhId': this.dhId, 'dmIp': this.dmIp, 'slPortNum': this.slPortNum, 'snOptions':this.snOptions, 'pubvcRoot': this.pubvcRoot, 'subvcRoot': this.subvcRoot, 'mutexFlag': mutexFlag};
    const rmSyncParam = {'dmIp': this.dmIp, 'rmPort': this.rmPortNum, 'gsIp': this.gsIp, 'gsPortNum': this.gsPortNum, 'rmsyncRootDir': this.rmSyncRootDir};

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
            var interest= message.data.interest.interestList;
            var rm = message.data.interest.referenceModel;
            this._dhSearchUpdateInterestTopic(interest);
            this._smUpdateInterestTopic(interest);
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
            this.ctrlProducer._produce( 'recv.dataHubList', {
                operation: 'UPDATE',
                content: JSON.stringify(bucketparser.bucketToList(this.bucketList))
            });
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
            this.ctrlProducer._produce( 'recv.sessionList', {
                operation: 'UPDATE',
                content: JSON.stringify(this.sessionList)
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
            // init.txt는 제외 대상이다.
            for (var i=0; i < message.data.path.length; i++) {
                if (message.data.path[i] == 'init.txt') {
                    message.data.path.splice(i, 1);
                    i--;
                }
            }
            message.data.path.sort(function(a,b) {
                const a_path = self.rmSyncRootDir+ '/gitDB/' + a;
                const b_path = self.rmSyncRootDir+ '/gitDB/' + b;

                const a_msg = JSON.parse(fs.readFileSync(a_path).toString())
                const b_msg = JSON.parse(fs.readFileSync(b_path).toString())

                // a가 먼저면 음수 반환, b가 먼저면 양수 반환
                return a_msg.timestamp - b_msg.timestamp;
            })


            for (var i = 0; i < message.data.path.length; i++) {
                // 파일 내용 추출
                const rmPath = self.rmSyncRootDir+ '/gitDB/' + message.data.path[i];
                debug('[DEBUG] read ' + rmPath + ' file (reference models...)')

                // referenceModel인지 dictionary인지 분간
                var topic = "";
                var t = rmPath.split(path.sep);
                switch (t[t.length-3]) {
                    case "referenceModel":
                        topic = topic + "recv.referenceModel";
                        break;
                    case "dictionary":
                        topic = topic + "recv.dictionary";
                        break;
                    default:
                        debug("Something Wrong");
                        break;
                }
                if (topic == "") continue;

                const msg_ = JSON.parse(fs.readFileSync(rmPath, 'utf8').toString());
                const content = msg_.content
                const operation = (message.data.operation == 'CREATE') ? message.data.operation : msg_.operation

                // 내용 operation, type, id, content, publishingType, timestamp
                // 임시 방편으로 operation은 UPDATE 고정
                var msg = {
                    "operation": operation,
                    "type": msg_.type,
                    "id": msg_.id,
                    "content": content,
                    "publishingType": msg_.publishingType
                }

                debug("Producing [" + topic + "] Message with type " + msg_.type);
                self.ctrlProducer._produce(topic, msg);
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
        data: {syncInterestList: interestTopic}
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
exports.DHDaemon.prototype._smUpdateInterestTopic = function(interestTopic){
    this.sessionManager.postMessage({
        event: 'UPDATE_INTEREST_TOPIC',
        data: {syncInterestList: interestTopic}
    });
    debug('[Function Test / UPDATE Process] UPDATE interest topic with ', interestTopic);
};
exports.DHDaemon.prototype._smUpdateNegotiation = function(session_negotiation_option){
    this.sessionManager.postMessage({
        event: 'UPDATE_NEGOTIATION_OPTIONS',
        data: {snOptions: session_negotiation_option}
    });
    debug('[Function Test / UPDATE Process] UPDATE negotiation option ', session_negotiation_option);
};
exports.DHDaemon.prototype._smSyncOn = function(datahubs){
    debug('[Function Test / SYNCON Process] SYNC_ON event detected');
    if(this.bucketList == null) return -1;
    // datahubs와 this.bucketList 비교해서 필요한 것만 추출하는 함수
    _bucketList = bucketparser.nodeIDSearcher(this.bucketList, datahubs);
    this.sessionManager.postMessage({
        event:'SYNC_ON',
        data: _bucketList
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
