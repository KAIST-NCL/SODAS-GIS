const ConfigParser = require('configparser');
const { Worker, MessageChannel} = require("worker_threads");
const rh = require('./RHDaemon');
var msgChn = new MessageChannel();
const debug = require('debug')('sodas:RHDaemon');

exports.RHDaemon = function(){

    this.conf = new ConfigParser();
    this.conf.read('../setting.cfg');
    this.name = this.conf.get('Daemon', 'name');
    this.bs_ip = this.conf.get('BootstrapServer', 'ip');
    this.bs_portNum = this.conf.get('BootstrapServer', 'portNum');
    this.sm_ip = this.conf.get('RMSessionManager', 'ip');
    this.sm_portNum = this.conf.get('RMSessionManager', 'portNum');
    this.kafka = this.conf.get('Kafka', 'ip');
    this.kafka_options = this.conf.get('Kafka', 'options');
    this.pubvc_root = __dirname + this.conf.get('VersionControl', 'pubvc_root');

};
exports.RHDaemon.prototype.init = async function(){
    // todo: create kafka topic if doesn't exist
    self = this;
    debug('[SETTING] init');
};
exports.RHDaemon.prototype.run = function(){

    // msg-channel(one-way) : VC -> sessionManager
    msgChn = new MessageChannel();

    // vc git flag
    const sharedArrayBuffer = new SharedArrayBuffer(Int8Array.BYTES_PER_ELEMENT);
    const mutex_flag = new Int8Array(sharedArrayBuffer);
    self = this;

    // setEnvironmentData
    const bsParam = {'bs_ip': this.bs_ip, 'bs_portNum': this.bs_portNum};
    const smParam = {'vc_port': msgChn.port1, 'sm_ip': this.sm_ip, 'sm_portNum': this.sm_portNum, 'pubvc_root': this.pubvc_root, 'mutex_flag': mutex_flag};
    const vcParam = {'sm_port': msgChn.port2, 'kafka': this.kafka, 'kafka_options':this.kafka_options, 'pubvc_root': this.pubvc_root, 'mutex_flag': mutex_flag};

    // run daemonServer
    this.bootstrapServer = new Worker('../BootstrapServer/bootstrapServer.js', { workerData: bsParam });
    this.rmSessionManager = new Worker('../RMSync/rmSessionManager.js', { workerData: smParam, transferList: [msgChn.port1] });
    this.VC = new Worker('../VersionControl/vcModule.js', { workerData: vcParam, transferList: [msgChn.port2] });

    // setting on function
    this.bootstrapServer.on('message', function(message){self._bsServerListener(message)});
    this.rmSessionManager.on('message', function(message) {self._rmSessionManagerListener(message)});
    this.VC.on('message', function(message) {self._vcListener(message)});

};

exports.RHDaemon.prototype._bsServerListener = function(message){
    switch(message.event){
        case 'UPDATE_SEEDNODE_LIST':
            debug('RHDaemon thread receive [UPDATE_SEEDNODE_LIST] event from BootstrapServer')
            debug(message.data);
            break;
        default:
            debug('[ERROR] BootstrapServer Listener Error ! event:', message.event);
            break;
    }
};

exports.RHDaemon.prototype._rmSessionManagerListener = function(message){
    switch(message.event){
        case 'GET_SESSION_LIST_INFO':
            debug('RHDaemon thread receive [GET_SESSION_LIST_INFO] event from RMSessionManager')
            debug(message.data);
            break;
        default:
            debug('[ERROR] RMSessionManager Listener Error ! event:', message.event);
            break;
    }
};

exports.RHDaemon.prototype._vcListener = function(message){
    switch(message.event){
        case '':
            break;
        default:
            debug('[ERROR] Version Control Listener Error !');
            break;
    }
};

const daemon = new rh.RHDaemon();
daemon.init().then(() => {daemon.run();});

process.on('SIGINT', () => {
    daemon.stop();
    process.exit();
});

process.on('SIGTERM', () => {
    daemon.stop();
    process.exit();
});
