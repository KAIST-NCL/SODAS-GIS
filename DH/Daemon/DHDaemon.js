const ConfigParser = require('configparser');
const { Worker, setEnvironmentData, } = require("worker_threads");
const dm = require('./DHDaemon');

exports.DHDaemon = function(){
    this.conf = new ConfigParser();
    this.conf.read('../setting.cfg');
    this.dm_ip = this.conf.get('Daemon', 'ip');
    this.dm_port = this.conf.get('Daemon', 'port');
    console.log('[SETTING] DataHub daemon is running with %s:%s', this.dm_ip, this.dm_port);
};

exports.DHDaemon.prototype.run = function(){

    setEnvironmentData('dm_ip', this.dm_ip);
    setEnvironmentData('dm_port', this.dm_port);
    const daemonServer = new Worker('./daemonServer.js');
    const sessionManager = new Worker('../SessionManager/sessionManager.js');
    const dhSearch = new Worker('../DHSearch/dhSearch.js')

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


