// [asset:UPDATE] 이벤트 파싱
// VersionControl의 vcConsumer를 테스트해야한다.
// 방법: vcConsumer의 constructor 인자로 테스트용 클래스 전달
//       vcConsumer에서 Kafka 메시지 수신한 내용 출력
//       테스트용 클래스로 전달되온 파싱 내용 출력

const ConfigParser = require('configparser');
const { vcConsumer } = require('../../../VersionControl/vcConsumer');
const { publishVC } = require(__dirname + '/../../../VersionControl/versionController');
class TestvcConsumer {
    constructor() {
        this.conf = new ConfigParser();
        this.conf.read(__dirname+'/../../../setting.cfg');
        // kafka 수신 관련 설정
        this.kafka = this.conf.get('Kafka', 'ip');
        this.kafka_options = this.conf.get('Kafka', 'options');
        // vcConsumer 생성
        var self = this;
        this.vc=new publishVC('./pubvc',__dirname+'/../../../rdf_files/reference-model/domain-version'); 
        this.vc.init().then((commit_number) => this.vc.addReferenceModel(this.vc, 'domainVersion00.rdf'));
        this.vcConsumer = new vcConsumer(this.kafka, this.kafka_options, self);
    }

    run_vcConsumer() {
        // vcConsumer 실행
        this.vcConsumer.run();
    }

    async editFile(event, filepath, content) {
        console.log('==== TestvcConsumer: parsed data ====');
        console.log('operation: ' + event);
        console.log('filepath from related: ' + filepath);
        console.log('content of asset: ' + content);
        console.log('======================================');
    }

    commit(self, filepath, commitMessage, message_) {
    }
}

// 테스트 진행
// 1. vcConsumer 세팅
var tc = new TestvcConsumer();
tc.run_vcConsumer();
