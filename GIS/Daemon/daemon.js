const ConfigParser = require('configparser');
const { Worker, MessageChannel} = require("worker_threads");
const kafka = require('kafka-node');
const deasync = require('deasync');
var msgChn = new MessageChannel();
const debug = require('debug')('sodas:GSDaemon');
const { ctrlConsumer } = require('./GSctrlKafka');
const ip = require('ip');

'use strict';
const { networkInterfaces } = require('os');
const nets = networkInterfaces();
const ips = Object.create(null); // Or just '{}', an empty object

/**
 * GSDaemon 은 GIS 시스템의 데몬으로 생성자에서는 `setting.cfg`의 설정 내용을 바탕으로 GIS 프로그램에서 필요한 모듈들을 실행한다.
 * @constructor
 */
exports.GSDaemon = function(){

    this.conf = new ConfigParser();
    this.conf.read('../setting.cfg');
    this.name = this.conf.get('Daemon', 'name');
    this.gsNetwork = this.conf.get('Daemon', 'networkInterface');
    this.bsIp = this.conf.get('BootstrapServer', 'ip');
    this.bsPortNum = this.conf.get('BootstrapServer', 'portNum');
    this.smIp = this.conf.get('RMSessionManager', 'ip');
    this.smPortNum = this.conf.get('RMSessionManager', 'portNum');
    this.kafka = this.conf.get('Kafka', 'ip');
    this.kafkaOptions = this.conf.get('Kafka', 'options');
    this.pubvcRoot = __dirname + this.conf.get('VersionControl', 'pubvc_root');
    this.kafkaClient = new kafka.KafkaClient({kafkaHost: this.kafka});
    this.ctrlKafka = new ctrlConsumer(this.kafka, this.kafkaOptions, this, this.conf);
};

/**
 * GSDaemon 초기화 함수로, 처음 GIS 가 시작할 때 호출됨.
 * GIS 와 거버넌스 시스템 통신에 필요한 Kafka Topic 생성.
 * @method
 * @returns {Promise<void>}
 * @see ctrlConsumer.createControlTopics
 */
exports.GSDaemon.prototype.init = async function(){
    // todo: create kafka topic if doesn't exist
    self = this;
    await this.ctrlKafka.createControlTopics()
        .then(() => {
            debug('[SETTING] init');
            debug('complete to create topics')
        })
        .catch((e) => {debug(e)});
};

/**
 * 데몬 실행 함수로 각 서브 모듈들을 worker thread로 실행함.
 * 모든 worker thread 실행 후, ``recv.governanceSystem`` 로 들어오는 모든 이벤트를 처리하는 쓰레드 시작 (``ctrlConsumer.onMessage()``)
 * @method
 * @see bootstrapServer
 * @see rmSessionManager
 * @see versionControl
 * @see ctrlConsumer.onMessage
 */
exports.GSDaemon.prototype.run = function(){

    debug('[SETTING] run is called')
    // msg-channel(one-way) : VC -> sessionManager
    msgChn = new MessageChannel();

    // vc git flag
    const sharedArrayBuffer = new SharedArrayBuffer(Int8Array.BYTES_PER_ELEMENT);
    const mutexFlag = new Int8Array(sharedArrayBuffer);
    self = this;

    // setEnvironmentData
    const bsParam = {'bsIp': this.bsIp, 'bsPortNum': this.bsPortNum};
    const smParam = {'vcPort': msgChn.port1, 'smIp': this.smIp, 'smPortNum': this.smPortNum, 'pubvcRoot': this.pubvcRoot, 'mutexFlag': mutexFlag};
    const vcParam = {'smPort': msgChn.port2, 'kafka': this.kafka, 'kafkaOptions':this.kafkaOptions, 'pubvcRoot': this.pubvcRoot, 'mutexFlag': mutexFlag};

    // run daemonServer
    this.bootstrapServer = new Worker('../BootstrapServer/bootstrapServer.js', { workerData: bsParam });
    this.rmSessionManager = new Worker('../RMSync/rmSessionManager.js', { workerData: smParam, transferList: [msgChn.port1] });
    this.VC = new Worker('../VersionControl/vcModule.js', { workerData: vcParam, transferList: [msgChn.port2] });

    // setting on function
    this.bootstrapServer.on('message', function(message){self._bsServerListener(message)});
    this.rmSessionManager.on('message', function(message) {self._rmSessionManagerListener(message)});
    this.VC.on('message', function(message) {self._vcListener(message)});

    this.ctrlKafka.onMessage();

};

/**
 * :ref:`bootstrapServer` 에서 전달되는 스레드 메시지를 수신하는 이벤트 리스너.
 * @method
 * @private
 * @param {dictionary(event,data)} message - 스레드 메시지
 * @param {string} message:event - ``UPDATE_SEEDNODE_LIST``
 * @see BootstrapServer._dmUpdateSeedNodeList
 */
exports.GSDaemon.prototype._bsServerListener = function(message){
    switch(message.event){
        case 'UPDATE_SEEDNODE_LIST':
            debug('GSDaemon thread receive [UPDATE_SEEDNODE_LIST] event from BootstrapServer')
            debug(message.data);
            break;
        default:
            debug('[ERROR] BootstrapServer Listener Error ! event:', message.event);
            break;
    }
};

/**
 * :ref:`rmSessionManager` 에서 전달되는 스레드 메시지를 수신하는 이벤트 리스너.
 * @method
 * @private
 * @param {dictionary(event,data)} message - 스레드 메시지
 * @param {string} message:event - ``GET_SESSION_LIST_INFO``
 */
exports.GSDaemon.prototype._rmSessionManagerListener = function(message){
    switch(message.event){
        case 'GET_SESSION_LIST_INFO':
            debug('GSDaemon thread receive [GET_SESSION_LIST_INFO] event from RMSessionManager')
            debug(message.data);
            break;
        default:
            debug('[ERROR] RMSessionManager Listener Error ! event:', message.event);
            break;
    }
};

/**
 * :ref:`versionControl` 에서 전달되는 스레드 메시지를 수신하는 이벤트 리스너.
 * @method
 * @private
 * @param {dictionary(event,data)} message - 스레드 메시지
 * @param {string} message:event - ````
 */
exports.GSDaemon.prototype._vcListener = function(message){
    switch(message.event){
        case '':
            break;
        default:
            debug('[ERROR] Version Control Listener Error !');
            break;
    }
};

/**
 * rmSessionManager 모듈로 ``INIT`` 메시지를 전달하는 메서드
 * @method
 * @private
 * @see RMSessionManager._gsDaemonListener
 */
exports.GSDaemon.prototype._rmSMInit = function() {
    this.rmSessionManager.postMessage({
        event: 'INIT',
        data: {}
    })
}
