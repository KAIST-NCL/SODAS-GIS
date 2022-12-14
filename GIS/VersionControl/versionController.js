const { Git } = require(__dirname + '/../Lib/git');
const debug = require('debug')('sodas:versionController');
const fs= require('fs');

/**
 * VersionController
 * @constructor
 * @param {string} RMgitDir - referenceModel, dictionary 를 저장할 gitDB 의 최상위 경로
 */
class VC {
    static Flag = false;
    static FirstCommit = 'asdfasdf';

    constructor(RMgitDir) {
        this.vcRoot = RMgitDir;
        this.git = new Git(this.vcRoot);
        this.isInit = false;
    }

    /**
     * pubvc gitDB 초기화 함수.
     * @method
     */
    async init(){
        var value = '';
        var self = this;
        await this.git.init()
            .then((commnum) => {
                //Create 2 folders for each rdf type
                value = (' ' + commnum).slice(1);
                var makeFolder = function(self, typeName) {
                    if (!fs.existsSync(self.vcRoot+'/'+typeName)){
                        fs.mkdirSync(self.vcRoot+'/'+typeName);
                    };
                }
                // dictionary 폴더 생성
                makeFolder(self, 'dictionary');
                makeFolder(self, 'dictionary/codeSystem');
                makeFolder(self, 'dictionary/vocabulary');
                makeFolder(self, 'dictionary/standard');
                // referenceModel 폴더 생성
                makeFolder(self, 'referenceModel');
                makeFolder(self, 'referenceModel/domain');
                makeFolder(self, 'referenceModel/tenantGroup');
                makeFolder(self, 'referenceModel/taxonomy');
                makeFolder(self, 'referenceModel/taxonomyVersion');
            })
            .catch((e) => {debug(e)});
        this.isInit = true;
        return value;
    }

    /**
     * 지정된 경로의 gitDB 로부터 최초 commit 번호를 추출
     * @method
     * @param {VC} self - VC 객체
     * @param {string} dir - gitDB 경로
     * @returns commitNumber - 최초 commit 번호
     */
    returnFirstCommit(self, dir) {
        return self.git.getInitCommit(dir);
    }
}

/**
 * vcModuel 에서 관리하는 gitDB 와 연동된 VC 상속 클래스
 * @constructor
 * @param {string} RMgitDir - referenceModel, dictionary를 저장할 gitDB의 최상위 경로
 */
class publishVC extends VC{
    constructor(RMgitDir) {
        super(RMgitDir);
    }

    /**
     * gitDB의 변동사항을 git에 add하고 commit하는 함수
     * @method
     * @param {string} filepath - 파일 경로
     * @param {string} message - commit message
     * @param {vcModule} vm - vcModule 객체
     */
    async commit(filepath, message, vm){
        // Flag=1 means not be able to commit, 0 means be able to commit
        if(vm.flag[0] == 1){
            // retry commit after timeout
            const timeOut = 100;
            setTimeout(this.commit.bind(this), timeOut, filepath, message, vm);
        }else{
            vm.lockMutex(vm);
            debug('[PublishVC Event]: ' + message + ' - bind because of Mutex');
            var commitNum = await this.git.commit(filepath, message);
            debug(commitNum);
            vm.unlockMutex(vm);
            debug('[PublishVC Event]: ' + message + ' - Mutex unlock');
            if (commitNum != '') vm.reportCommit(vm, commitNum);
        }
    }
}

exports.VC = VC;
exports.publishVC = publishVC;
