const PROTO_PATH = __dirname + '/protos/dhdaemon.proto';
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const ConfigParser = require('configparser');

class dhClient {
    constructor() {
        const conf = new ConfigParser();
        const packageDefinition = protoLoader.loadSync(
            PROTO_PATH,
            {
                keepCase:true,
                longs: String,
                enums: String,
                defaults: true,
            }
        );
        conf.read('../DH/setting.cfg');
        const dm_ip = conf.get('Daemon', 'ip');
        const dm_portNum = conf.get('Daemon', 'portNum');
        const dhDaemon = grpc.loadPackageDefinition(packageDefinition).daemonserver;
        this.client  = new dhDaemon.daemonServer.daemonServer(dm_ip + ':' + dm_portNum, grpc.credentials.createInsecure());
    }

    get dhList(){
        this.client.getDHList(null, function(error, feature){
            console.table(feature, ['Name', 'IP', 'PortNum', 'Sync keywords']);
        });
    }

    setInterest(interests){
        this.client.setInterest({syncKeywords: interests}, function(error, feature){
            console.log(error);
        });
    }
}

exports.dhClient = dhClient;

