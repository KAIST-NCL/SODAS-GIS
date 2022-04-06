// Publish Side 3, 4를 위한 검증 코드
// VersionControl에서 SessionManager를 거쳐 Session까지 UPDATE_PUB_ASSET을 전달하는 것을 확인하는 코드

// Publsih_2_git_commit의 daemon을 재탕하되 SessionManager를 추가로 호출하고 세션을 생성 하나 생성하여 UPDATE_PUB_ASSET이 말단까지 잘 전달되는 지 확인한다.

const ConfigParser = require('configparser');
const { Worker, MessageChannel } = require("worker_threads");

const sharedArrayBuffer = new SharedArrayBuffer(Int8Array.BYTES_PER_ELEMENT);
const mutex_flag = new Int8Array(sharedArrayBuffer);

class DHDaemon {
    constructor() {
        this.conf = new ConfigParser();
        this.conf.read(__dirname+'/../../setting.cfg');
        this.pubvc_root = __dirname + '/pubvc';
        this.subvc_root = __dirname + '/subvc';
        this.rmsync_root_dir = '/home/ncl/jwlee/my_branch/KAIST_SODAS/DH/rdf_files/reference-model/domain-version';
        this.RM = 'domainVersion00.rdf';
        this.msgChn = new MessageChannel();
        this.dm_ip = this.conf.get('Daemon', 'ip'); 
        this.sl_portNum = this.conf.get('SessionListener', 'portNum');

        this.sn_options = {
            datamap_desc: {
                sync_interest_list: ['domain01', 'taxonomy01', 'category001'],
                data_catalog_vocab: ['DCATv2']
            }, 
            sync_desc: {
                sync_time: [2, 43],
                sync_count: [3, 5],
                transfer_interface: ['gRPC']
            }
        };
    }

    init() {
        const smParam = {'vc_port': this.msgChn.port2, 
                         'dm_ip': this.dm_ip, 
                         'sl_portNum': 53000, 
                         'sn_options':this.sn_options, 
                         'pubvc_root': this.pubvc_root, 
                         'subvc_root': this.subvc_root, 
                         'mutex_flag':mutex_flag
                        };
        this.SM = new Worker('../../SessionManager/sessionManager.js', {workerData: smParam, transferList: [this.msgChn.port2]})

        this.SM.on('message', message => {
            switch(message.event){
                case 'GET_SESSION_LIST_INFO':
                    console.log('DHDaemon thread receive [GET_SESSION_LIST_INFO] event from SessionManager')
                    console.log(message.data);
                    break;
                default:
                    console.log('[ERROR] Session Manager Listener Error ! event:', message.event);
                    break;
            }
        });
    }

}

const daemon = new DHDaemon();

daemon.init();

process.on('SIGINT', () => {
    // daemon.stop();
    process.exit();
});

process.on('SIGTERM', () => {
    // daemon.stop();
    process.exit();
});