const ConfigParser = require('configparser');
const { Worker, MessageChannel } = require("worker_threads");
const { ctrlConsumer, ctrlProducer } = require('./ctrlKafka');
const fs = require("fs");
const bucketparser = require('../Lib/bucketparser');
'use strict';
const { networkInterfaces } = require('os');
const crypto = require("crypto");
const nets = networkInterfaces();
const ips = Object.create(null); // Or just '{}', an empty object
const ip = require('ip');
const path = require('path');
const debug = require('debug')('sodas:daemon\t\t|');

/**
 * DHDaemon 은 DIS 시스템의 데몬으로 생성자에서는 `setting.cfg`의 설정 내용을 바탕으로 DIS 프로그램에서 필요한 모듈들을 실행한다.
 * @constructor
 */
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

    this.disIp = ip.address();
    debug('[LOG]: ip', this.disIp);
    debug('[LOG]: session negotiation option');
    debug(this.snOptions);
    this.pubvcRoot = this.conf.get('VersionControl', 'pubvc_root');
    this.subvcRoot = this.conf.get('VersionControl', 'subvc_root');
    this.commitPeriod = this.conf.get('VersionControl', 'commit_period');

    process.env.DH_HOME = this.conf.get('ENV', 'DH_HOME');
    debug('[SETTING] DataHub daemon is running with %s:%s', this.disIp, this.dmPortNum);
    this.ctrlProducer = new ctrlProducer(this.kafka);
    // ctrlConsumer will be created in init()

    this.interest = [];
    this.bucketList = null;
    this.myNodeId = crypto.createHash('sha1').update(this.disIp + ':' + this.dsPortNum).digest('hex');
};
/**
 * DHDaemon 초기화 함수로, 처음 DIS가 시작할 때 호출됨.
 * DIS와 DataHub 통신에 필요한 Kafka Topic 생성.
 * @method
 * @returns {Promise<void>}
 * @see ctrlProducer.createCtrlTopics
 */
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

/**
 * 데몬 실행 함수로 각 서브 모듈들을 worker thread로 실행함.
 * 모든 worker thread 실행 후, ``recv.dataHub``로 들어오는 모든 이벤트를 처리하는 쓰레드 시작 (``ctrlConsumer.onMessage()``)
 * @method
 * @see daemonServer
 * @see dhSearch
 * @see vcModule
 * @see sessionManager
 * @see rmSync
 * @see ctrlConsumer.onMessage
 */
exports.DHDaemon.prototype.run = function(){

    // msg-channel(one-way) : VC -> sessionManager
    msgChn = new MessageChannel();
    // vc git flag
    const sharedArrayBuffer = new SharedArrayBuffer(Int8Array.BYTES_PER_ELEMENT);
    const mutexFlag = new Int8Array(sharedArrayBuffer);
    self = this;

    // setEnvironmentData
    const dmServerParam = {'disIp': this.disIp, 'dmPortNum': this.dmPortNum, 'name': this.name};
    const dhSearchParam = {'disIp': this.disIp, 'dsPortNum': this.dsPortNum, 'slPortNum': this.slPortNum, 'bootstrapIp': this.bsIp, 'bootstrapPortNum': this.bsPortNum};
    const vcParam = {'smPort': msgChn.port1, 'rmsyncRootDir': this.rmSyncRootDir, 'kafka': this.kafka, 'kafkaOptions': this.kafkaOptions, 'pubvcRoot': this.pubvcRoot, 'commitPeriod': this.commitPeriod, 'mutexFlag': mutexFlag};
    const smParam = {'vcPort': msgChn.port2, 'kafka': this.kafka, 'myNodeId': this.myNodeId, 'disIp': this.disIp, 'slPortNum': this.slPortNum, 'snOptions':this.snOptions, 'pubvcRoot': this.pubvcRoot, 'subvcRoot': this.subvcRoot, 'mutexFlag': mutexFlag};
    const rmSyncParam = {'disIp': this.disIp, 'rmPort': this.rmPortNum, 'gsIp': this.gsIp, 'gsPortNum': this.gsPortNum, 'rmsyncRootDir': this.rmSyncRootDir};

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

/**
 * DIS 데몬 종료
 * @method
 */
exports.DHDaemon.prototype.stop = function(){
    this.daemonServer.exit();
    this.dhSearch.exit();
    this.VC.exit();
    this.sessionManager.exit();
    this.rmSync.exit();
};

/**
 * 데몬용 CLI API를 처리하기위한 daemon server listener
 * @param {dictionary(event, message)} message - event와 message key 값을 가진 메시지
 * @private
 */
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

/**
 * dhSearch 모듈로부터 전달되는 메시지를 처리하기위한 Listener로 ``UPDATE_BUCKET_LIST`` 이벤트가 들어오는 경우
 * 탐색된 버킷 리스트를 ``recv.dataHubList`` 토픽으로 전송함.
 * @param {dictionary(event, message)}message - 이벤트 종류와 메시지를 저장한 딕셔너리 구조
 * @private
 * @see DHSearch._dmUpdateBucketList
 */
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

/**
 * sessionManager 모듈로부터 전달되는 메시지를 처리하기 위한 Listener로 ``GET_SESSION_LIST_INFO`` 메시지가 들어오는 경우
 * 획득된 session list 정보를 ``recv.sessionList`` 토픽으로 전달
 * @param message
 * @private
 */
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

/**
 * VersionControl 모듈로부터 전달되는 메시지를 처리하기 위한 Listener
 * @param message
 * @private
 */
exports.DHDaemon.prototype._vcListener = function(message){
    switch(message.event){
        case '':
            break;
        default:
            debug('[ERROR] Version Control Listener Error !');
            break;
    }
};

/**
 * rmSync 모듈 (참조 모델 동기화 모듈)로부터 전달되는 메시지를 처리하기 위한 Listener로
 * ``UPDATE_REFERENCE_MODEL`` 이벤트가 들어오는 경우 데이터 허브로 들어온 오픈 참조 모델을 데이터 허브로 전달
 * @param message
 * @private
 * @see RMSync._dmUpdateReferenceModel
 */
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
/**
 * 데이터 허브의 관심 주제 (interest topic)이 업데이트 되는 경우 ``dhSearch`` 모듈로 해당 이벤트를 전달하는 메서드
 * @param interestTopic
 * @private
 * @see DHSearch._dhDaemonListener
 */
exports.DHDaemon.prototype._dhSearchUpdateInterestTopic = function(interestTopic){
    this.dhSearch.postMessage({
        event: 'UPDATE_INTEREST_TOPIC',
        data: {syncInterestList: interestTopic}
    });
    debug('[Function Test / UPDATE Process] UPDATE interest topic with ', interestTopic);
};

/**
 * rmSync 모듈로 ``INIT`` 메시지를 전달하는 메서드
 * @private
 * @see RMSync._dhDaemonListener
 */
exports.DHDaemon.prototype._rmSyncInit = function(){
    this.rmSync.postMessage({
        event: 'INIT',
        data: {}
    });
};

/**
 * sessionManager 모듈로 ``INIT`` 메시지를 전달하는 메서드
 * @private
 * @see SessionManager._dhDaemonListener
 */
exports.DHDaemon.prototype._smInit= function(){
    this.sessionManager.postMessage({
        event: 'INIT',
        data: {}
    });
};

/**
 * sessionManager로 관심 토픽 정보를 전달하는 메서드
 * @param {list(string)} interestTopic - 관심 토픽 정보 리스트
 * @private
 * @see SessionManager._dhDaemonListener
 */
exports.DHDaemon.prototype._smUpdateInterestTopic = function(interestTopic){
    this.sessionManager.postMessage({
        event: 'UPDATE_INTEREST_TOPIC',
        data: {syncInterestList: interestTopic}
    });
    debug('[Function Test / UPDATE Process] UPDATE interest topic with ', interestTopic);
};

/**
 * sessionManager로 협상 옵션 정보를 전달하는 메서드
 * @param {dictionary} session_negotiation_option
 * @private
 * @see SessionManager._dhDaemonListener
 */
exports.DHDaemon.prototype._smUpdateNegotiation = function(session_negotiation_option){
    this.sessionManager.postMessage({
        event: 'UPDATE_NEGOTIATION_OPTIONS',
        data: {snOptions: session_negotiation_option}
    });
    debug('[Function Test / UPDATE Process] UPDATE negotiation option ', session_negotiation_option);
};

/**
 * sessionManager로 SYNC_ON 메시지를 전달하는 메서드로
 * datahub 아이디 리스트가 주어지면 해당 리스트의 노드 ID 정보로부터 버킷 정보를 추출하여
 * sessionManager 모듈에 SYNC_ON 메시지와 함께 전달
 * [postMessage] to sessionManager {'event':'SYNC_ON'}
 * @param {list(string)} datahubs
 * @returns {number}
 * @private
 * @see SessionManager._dhDaemonListener
 */
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

/**
 * initialize Version Control module
 * [postMessage] to versionControl module {'event':'INIT'}
 * @private
 */
exports.DHDaemon.prototype._vcInit = function(){
    this.VC.postMessage({
        event: 'INIT',
        data: {}
    });
};

/**
 * 참조 모델 (reference model)을 governance system으로부터 전달받은 경우 (CREATE/UPDATE)
 * 수정된 참조 모델을 바탕으로 파일 트리를 형성하도록 해당 정보를 version control 모듈로 전달함
 *  <p> [postMessage] to versionControl module ``{'event': 'UPDATE_REFERENCE_MODEL', 'data': referenceModel}`` </p>
 * @param referenceModel
 * @private
 */
exports.DHDaemon.prototype._vcUpdateReferenceModel = function(referenceModel){
    this.VC.postMessage({
        event: 'UPDATE_REFERENCE_MODEL',
        data: referenceModel
    });
    debug('[Function Test / UPDATE Process] UPDATE reference model ', referenceModel);
};

/**
 * CLI 데이터 업데이트를 위해 데몬이 가진 정보를 dmServer 모듈로 전달
 * 수정된 버킷 리스트 정보를 dmServer 모듈로 전달함.
 * [postMessage] to daemonServer
 * @param bucket_list
 * @private
 */
exports.DHDaemon.prototype._dmServerSetBucketList = function(bucket_list){
    this.daemonServer.postMessage({
        event: 'UPDATE_BUCKET_LIST',
        data: bucket_list
    });
};

/**
 * CLI 데이터 업데이트를 위해 데몬이 가진 정보를 dmServer 모듈로 전달
 * 수정된 참조 모델 (referenceModel) 정보를 dmServer 모듈로 전달함.
 * [postMessage] to daemonServer
 * @param referenceModel
 * @private
 */
exports.DHDaemon.prototype._dmServerSetRM = function(referenceModel){
    this.daemonServer.postMessage({
        event: 'UPDATE_REFERENCE_MODEL',
        data: referenceModel
    });
};


/**
 * CLI 데이터 업데이트를 위해 데몬이 가진 정보를 dmServer 모듈로 전달
 * 수정된 세션 리스트 정보를 dmServer 모듈로 전달함.
 * [postMessage] to daemonServer
 * @param {list(string)}sessionList
 * @private
 */
exports.DHDaemon.prototype._dmServerSetSessionList = function(sessionList){
    this.daemonServer.postMessage({
        event: 'UPDATE_SESSION_LIST',
        data: sessionList
    });
};

/**
 * 에러 메시지 전달
 * @param errorCode
 * @private
 */
exports.DHDaemon.prototype._raiseError = function(errorCode){
    debug(errorCode);
    this.ctrlProducer.sendError(errorCode);
};
