const {Worker, MessageChannel} = require('worker_threads');
const ConfigParser = require('configparser');
const { ctrlConsumer, ctrlProducer } = require('/home/ncl/jwlee/KAIST_SODAS/DH/Daemon/ctrlKafka');

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
        this.conf.read('/home/ncl/jwlee/KAIST_SODAS/DH/setting.cfg');
        this.sl_portNum = this.conf.get('SessionListener', 'portNum');
        this.kafka = this.conf.get('Kafka', 'ip');
        this.kafka_options = this.conf.get('Kafka', 'options');

        // 쓰레드 설정
        this.msgChn = new MessageChannel();
        this.ip = '127.0.0.1';
        this.pubvc_root = '/home/ncl/jwlee/KAIST_SODAS/DH/test/JWL/pubvc_root';
        this.subvc_root = '/home/ncl/jwlee/KAIST_SODAS/DH/test/JWL/subvc_root';

        // workderData로 보낼 내용들
        this.SessionManagerParam = {
            'vc_port': this.msgChn.port1,
            sn_options: {
                datamap_desc: {
                    sync_interest_list: ['domain01', 'taxonomy001', 'category0001'],
                    data_catalog_vocab: ['DCATv2']
                },
                sync_desc: {
                    sync_time: [2, 43],
                    sync_count: [3, 5],
                    transfer_interface: ['gRPC']
                }, 
            },
            dm_ip: '127.0.0.1',
            sl_portNum: this.sl_portNum,
            pubvc_root: this.pubvc_root,
            subvc_root: this.subvc_root
        };

        this.vcModuleParam = {
            rmsync_root_dir: '/home/ncl/jwlee/KAIST_SODAS/DH/rdf_files/reference-model/domain-version',
            sm_port: this.msgChn.port2,
            kafka: this.kafka,
            kafka_options: this.kafka_options,
            pubvc_root: this.pubvc_root
        };
    }

    // 1. SessionManager 쓰레드 활성
    initSessionManager() {
        console.log("%%%%%%% SESSION_MANAGER CREATE");
        this.sessionManager = new Worker('/home/ncl/jwlee/KAIST_SODAS/DH/test/JWL/SessionManager.js', 
                                        { workerData: this.SessionManagerParam,
                                          transferList: [this.msgChn.port1]});
    }

    // 2. vcModule 쓰레드 활성
    initvcModule() {
        console.log("%%%%%%% VC_MODULE CREATE");
        this.VC = new Worker('/home/ncl/jwlee/KAIST_SODAS/DH/VersionControl/vcModule.js', { 
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
setTimeout(()=>Test.updateRM(), 3000);