const PROTO_PATH = __dirname + '/protos/dhdaemon.proto';
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const ConfigParser = require('configparser');

class dhClient {
    constructor() {
        const conf = new ConfigParser();
        const packageDefinition = protoLoader.loadSync(
            PROTO_PATH,
            {keepCase: true,
                longs: String,
                enums: String,
                defaults: true,
                oneofs: true
            });
        conf.read('../DH/setting.cfg');
        const dm_ip = conf.get('Daemon', 'ip');
        const dm_portNum = conf.get('Daemon', 'portNum');
        const dhDaemon = grpc.loadPackageDefinition(packageDefinition).daemonServer;
        this.dhClient  = new dhDaemon.daemonServer(dm_ip + ':' + dm_portNum, grpc.credentials.createInsecure());
    }

    get dhList(){
        this.dhClient.getDhList({}, function(error, feature){
            console.table(feature.dhList, ['name', 'ip', 'portNum', 'syncInterestList']);
        });
    }

    get sessionList(){
        this.dhClient.getSessionList({}, function(error, feature){
            console.table(feature.sessionList, ['name', 'ip', 'portNum', 'syncInterestList', 'minSyncTime', 'maxSyncTime', 'syncCount', 'transferInterface', 'dataCatalogVocab']);
        });
    }

    setInterest(interests){
        this.dhClient.setInterest({syncKeywords: interests}, function(error, feature){
            if(!error){
                console.log('[SUCCESS] Complete to set new interests');
                console.table([feature], ['name', 'ip', 'portNum', 'syncInterestList']);
            }
        });
    }
}

exports.dhClient = dhClient;

