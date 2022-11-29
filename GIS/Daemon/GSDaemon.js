const ConfigParser = require('configparser');
const { Worker, MessageChannel} = require("worker_threads");
const gs = require('./GSDaemon');
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

exports.GSDaemon.prototype.init = async function(){
    // todo: create kafka topic if doesn't exist
    self = this;
    await this.ctrlKafka._createCtrolTopics()
        .then(() => {
            debug('[SETTING] init');
            debug('complete to create topics')
        })
        .catch((e) => {debug(e)});
};
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

exports.GSDaemon.prototype._vcListener = function(message){
    switch(message.event){
        case '':
            break;
        default:
            debug('[ERROR] Version Control Listener Error !');
            break;
    }
};

exports.GSDaemon.prototype._rmSMInit = function() {
    this.rmSessionManager.postMessage({
        event: 'INIT',
        data: {}
    })
}

const daemon = new gs.GSDaemon();
daemon.init()
    .then(() => {
        debug('[SETTING] daemon init is complete')
        daemon.run();
    });

process.on('SIGINT', () => {
    daemon.stop();
    process.exit();
});

process.on('SIGTERM', () => {
    daemon.stop();
    process.exit();
});
