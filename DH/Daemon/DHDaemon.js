const ConfigParser = require('configparser');
const { Worker, setEnvironmentData, } = require("worker_threads");
const tWorker = require("tiny-worker");
const dm = require('./DHDaemon');

exports.DHDaemon = function(){

    this.conf = new ConfigParser();
    this.conf.read('../setting.cfg');
    this.dm_ip = this.conf.get('Daemon', 'ip');
    this.dm_port = this.conf.get('Daemon', 'port');
    this.ds_ip = this.conf.get('DHSearch', 'ip');
    this.ds_port = this.conf.get('DHSearch', 'port');
    this.rh_bs = this.conf.get('ReferenceHub', 'bootstrap');
    let DH_HOME = this.conf.get('ENV', 'DH_HOME');
    process.env.DH_HOME = DH_HOME;
    console.log('[SETTING] DataHub daemon is running with %s:%s', this.dm_ip, this.dm_port);
};

exports.DHDaemon.prototype.run = function(){

    // setEnvironmentData
    setEnvironmentData('dm_ip', this.dm_ip);
    setEnvironmentData('dm_port', this.dm_port);
    setEnvironmentData('ds_port', this.ds_port);
    setEnvironmentData('rh_bs', this.rh_bs);

    // run daemonServer
    this.daemonServer = new Worker('./daemonServer.js');
    this.dhSearch = new Worker('../DHSearch/dhSearch.js');
    // this.sessionManager = new Worker('../SessionManager/sessionManager.js');

    // port setting
    // msg-channel: daemonServer <-> dhSearch two-way channel
    this.daemonServer.once('message', value => {
        console.log('Get port from daemonServer');
        this.dhSearch.postMessage({
            port: value.port
        }, [value.port]);
    });
    this.dhSearch.once('message', value => {
        console.log('Get port from dhSearch');
        this.daemonServer.postMessage({
            port: value.port
        }, [value.port]);
    });
};

exports.DHDaemon.prototype.dhsearch_handler = function (ev){
    console.log(ev.data);
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


