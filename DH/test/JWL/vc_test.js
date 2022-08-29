const {Worker, MessageChannel} = require('worker_threads');
const ConfigParser = require('configparser');
const { ctrlConsumer, ctrlProducer } = require('/home/ncl/jwlee/KAIST_SODAS/DIS/Daemon/ctrlKafka');
const fs = require('fs')

// Test 순서
// 1. SessionManager 쓰레드 활성화
// 2. vcModule 쓰레드 활성화
// 3. SessionManager에서 Session 2개 생성
// 4. 외부에서 kafka Message를 쏴서 받아지는지 확인
// 5. SessionManager에서 받아지는 쓰레드 메시지 내용 확인
// 6. Session에서 받아지는 쓰레드 메시지 내용 확인
// 7. kafka Message를 외부에 쏴서 잘 받아지는지 확인


class vc_test {
    constructor() {
        // Kafka 설정
        this.conf = new ConfigParser();
        this.conf.read('/home/ncl/KAIST_SODAS/DIS/setting.cfg');
        this.sl_portNum = this.conf.get('SessionListener', 'portNum');
        this.kafka = this.conf.get('Kafka', 'ip');
        this.kafka_options = this.conf.get('Kafka', 'options');

        // 쓰레드 설정
        this.msgChn = new MessageChannel();
        this.ip = '127.0.0.1';
        this.pubvc_root = '/home/ncl/KAIST_SODAS/DIS/test/JWL/pubvc_root';
        this.subvc_root = '/home/ncl/KAIST_SODAS/DIS/test/JWL/subvc_root';
        !fs.existsSync(this.subvc_root) && fs.mkdirSync(this.subvc_root);

        // workderData로 보낼 내용들
        this.SessionManagerParam = {
            'vc_port': this.msgChn.port1,
            sn_options: {
                datamap_desc: {
                    sync_interest_list: ['domain01', 'domain01/taxonomy001', 'domain01/taxonomy001/category0001'],
                    data_catalog_vocab: ['DCATv2']
                },
                sync_desc: {
                    sync_time: [8, 12],
                    sync_count: [4, 6],
                    transfer_interface: ['gRPC']
                },
            },
            dm_ip: '127.0.0.1',
            sl_portNum: 55000,
            pubvc_root: this.pubvc_root,
            subvc_root: this.subvc_root
        };

        this.vcModuleParam = {
            rmsync_root_dir: '/home/ncl/KAIST_SODAS/DIS/rdf_files/reference-model/domain-version',
            sm_port: this.msgChn.port2,
            kafka: this.kafka,
            kafka_options: this.kafka_options,
            pubvc_root: this.pubvc_root
        };
        this.bucket = {
            '157' : [ {
                nodeID: '3f3f481702f05ccd74063a0e45dd67cee4731a2d',
                address: '127.0.0.1',
                port: 53000,
                lastSeen: 1636006599297
            } ]
        }
    }

    // 1. SessionManager 쓰레드 활성
    initSessionManager() {
        console.log("%%%%%%% SESSION_MANAGER CREATE");
        this.sessionManager = new Worker('/home/ncl/KAIST_SODAS/DIS/SessionManager/sessionManager.js',
                                        { workerData: this.SessionManagerParam,
                                          transferList: [this.msgChn.port1]});
    }

    syncSessionManager() {
        this.sessionManager.postMessage({event: 'SYNC_ON', data: this.bucket})
    }


    // 2. vcModule 쓰레드 활성
    initvcModule() {
        console.log("%%%%%%% VC_MODULE CREATE");
        this.VC = new Worker('/home/ncl/KAIST_SODAS/DIS/VersionControl/vcModule.js', {
            workerData: this.vcModuleParam,
           transferList: [this.msgChn.port2]});
    }

    updateRM() {
        this.VC.postMessage({
            event: 'UPDATE_REFERENCE_MODEL',
            RM: ['domainVersion00.rdf']
        });
    }
}

const Test = new vc_test();
Test.initSessionManager();
Test.initvcModule();
setTimeout(()=>Test.updateRM(), 1000);
setTimeout(()=>Test.syncSessionManager(), 3000);


// async function process() {
//     await sm.postMessage({event: 'INIT', data: null});
//     await new Promise((resolve, reject) => setTimeout(resolve, 2000));
//
//     await sm.postMessage({event: 'UPDATE_NEGOTIATION_OPTIONS', data: sessionNegotiationOptions});
//     await new Promise((resolve, reject) => setTimeout(resolve, 2000));
//
//     await sm.postMessage({event: 'SYNC_ON', data: bucket})
//     await new Promise((resolve, reject) => setTimeout(resolve, 2000));
// }
// process();
