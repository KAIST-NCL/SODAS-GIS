const { Git } = require(__dirname + '/../Lib/git');
const { ref_parser } = require('../Lib/ref_parser');
const debug = require('debug')('sodas:versionController|');

/**
 * versionController
 * @constructor
 * @param {string} gitDir - asset을 저장할 gitDB 의 최상위 경로
 * @param {string} refRootdir - 분류 구조를 참조하기 위한 reference model이 저장된 경로
 */
class VC {

    static Flag = false;
    static FirstCommit = 'asdfasdf';

    constructor(gitDir, refRootdir) {
        this.vcRoot = gitDir;
        this.git = new Git(this.vcRoot);
        this.dir_list = [];
        this.isInit = false;
        if(typeof refRootdir === 'string') this.rp = new ref_parser(this.vcRoot, refRootdir);
    }

    async init(){
        var value = '';
        await this.git.init()
            .then((commnum) => {
            value = (' ' + commnum).slice(1);
            })
            .catch((e) => {debug(e)});
        this.isInit = true;
        return value;
    }

    /**
     * 참조할 reference model 목록 추가 함수
     * @param {VC} self 
     * @param {Array} ReferenceModel - reference model 목록
     */
    addReferenceModel(self, ReferenceModel) {
        self.rp.addReferenceModel(ReferenceModel);
    }

    /**
     * 지정된 경로의 gitDB로부터 최초 commit 번호를 추출하는 함수
     * @param {VC} self 
     * @param {string} dir - gitDB 경로
     * @returns commitNumber - 최초 coommit 번호
     */
    returnFirstCommit(self, dir) {
        return self.git.getInitCommit(dir);
    }
}

/**
 * vcModule 에서 관리하는 gitDB 와 연동된 VC 상속 클래스
 * @constructor
 * @param {string} gitDir - asset을 저장할 gitDB 의 최상위 경로
 * @param {string} refRootdir - 분류 구조를 참조하기 위한 reference model이 저장된 경로
 */
class publishVC extends VC{
    // static class variable (mutex)
    constructor(gitDir, refRootdir) {
        super(gitDir, refRootdir);
    }

    /**
     * gitDB의 변동사항을 git에 add하고 commit한 다음 :ref:`rmSessionManager에 commit 번호를 전달하는 함수
     * @method
     * @param {string} filepath - 파일 경로
     * @param {string} message - commit message
     * @param {vcModule} vm - vcModule 객체
     * @see vcModule.reportCommit
     * @see Git.commit
     */    
    async commit(filepath, message, vm){
        // Flag가 0이면 열린 상태, 1이면 잠긴 상태
        if(vm.flag[0] == 1){
            // retry commit
            const timeOut = 100;
            setTimeout(this.commit.bind(this), timeOut, filepath, message, vm);
        }else{
            // MUTEX ON
            vm.lockMutex(vm);
            debug('[PublishVC Event]: - bind because of Mutex');
            debug(message);
            var commitNum = await this.git.commit(filepath, message);
            debug(commitNum);
            // MUTEX OFF
            vm.unlockMutex(vm);
            debug('[PublishVC Event]: - Mutex unlock');
            debug(message);
            if (commitNum != '') vm.reportCommit(vm, commitNum);
        }
    }
}

/**
 * subscribeVC
 * session에서 관리하는 gitDB와 연동된 VC 상속 클래스
 * @constructor
 * @param {string} gitDir - asset을 저장할 gitDB 의 최상위 경로
 * @param {string} refRootdir - 분류 구조를 참조하기 위한 reference model이 저장된 경로
 */
class subscribeVC extends VC{
    constructor(gitDir, refRootdir) {
        super(gitDir, refRootdir);
    }
    
    /**
     * gitDB의 변동사항을 git에 add하고 commit하는 함수
     * @param {string} filepath - 파일 경로
     * @param {string} message - commit message
     */
    async commit(filepath, message){
        // commit 처리할 때 mutex 없게 수정해야함
        await this.git.commit(filepath, message);
    }

    /**
     * 상대 session에서 보내온 git Diff 기반 patch 파일을 자신의 gitDB에 적용하는 함수
     * @param {string} gitPatch - git Diff 추출물
     */
    apply(gitPatch) {
        this.git.apply(gitPatch);
    }
}


exports.VC = VC;
exports.publishVC = publishVC;
exports.subscribeVC = subscribeVC;
