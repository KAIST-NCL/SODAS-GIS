// Local Git DB Location
const fs = require('fs');
const execSync = require('child_process').execSync;
const debug = require('debug')('sodas:lib:git\t\t|');
const tools = require('./tools')

/**
 * Git
 * @constructor
 * @param {string} gitDIR_ - 관리할 gitDB 경로
 */
class Git {
    constructor(gitDIR_){
        this.gitDIR_ = gitDIR_;
    }

    /**
     * gitDB를 git init하고 1회 commit한 다음 최초 commit 번호를 반환하는 함수
     * @returns - 최초 commit 번호
     */
    async init(){
        // callback, argDict는 optional.
        !fs.existsSync(this.gitDIR_) && tools.mkdirSyncRecursive(this.gitDIR_);

        // if not initialized, then init the git
        const isInitialized = fs.existsSync(this.gitDIR_ + '/.git');
        if (!isInitialized) {
            // init
            execSync('cd ' + this.gitDIR_ + ' && git init');
            // configuration
            execSync('cd ' + this.gitDIR_ + ' && git config --local user.name "SODAS" && git config --local user.email ""');
            // const stdout2 = execSync('cd ' + this.gitDIR_ + '&& git rev-list --all --count');
            var commnum = this._first_commit();
            return commnum;
        }
    }

    /**
     * 최초 commit을 진행하는 함수
     * @returns - 최초 commit 번호
     */
    _first_commit(){
        execSync('cd '+ this.gitDIR_ + '&& touch init.txt');
        var commnum = this.commit('./init.txt', 'initial commit');
        return commnum;
    }

    /**
     * git commit을 진행하는 함수
     * @param {string} filepath - commit 대상 경로
     * @param {string} message - commit message
     * @returns - commit 번호
     */
    commit(filepath, message){
        execSync('cd ' + this.gitDIR_ + ' && git add ' + filepath);
        var stdout = execSync('cd ' + this.gitDIR_ + ' && git commit -m "' + message + '" && git rev-parse HEAD');
        var printed = stdout.toString().split('\n');
        printed.pop();
        var comm = printed.pop();
        return comm;
    }

    /**
     * git diff를 추출하는 함수
     * @param {string} comID1 - 시작 커밋 번호
     * @param {string} comID2 - 종료 커밋 번호
     * @param {string} diff_dir - diff 추출할 경로
     */
    diff(comID1, comID2, diff_dir){
        execSync('cd ' + this.gitDIR_ + ' && git diff '+comID1+' '+' '+comID2+' -- '+ diff_dir + ' >>  ../' + comID2 + '.patch', { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    }

    /**
     * git diff 추출물을 patch로서 적용하는 함수
     * @param {string} patch_name - git diff 추출물의 경로
     */
    apply(patch_name) {
        // 적용 가능 여부 체크하고 싶을 시엔
        // var result = execSync('cd' + this.gitDIR_ + ' && git apply -3 --whitespace=fix --check ' + patch_name).toString()
        // 위 코드 실행 후 result가 빈 string인지 확인하면 된다.
        if (arguments.length == 1) {
            execSync('cd ' + this.gitDIR_ + ' && git apply -3 --whitespace=fix ' + patch_name);
        }
        else if (arguments.length == 2) {
            execSync('cd ' + this.gitDIR_ + ' && git apply -3 --whitespace=fix ' + patch_name);
        }
        else {
            debug("Error: # of Arguments must be either 1 or 2");
        }
    }

    /**
     * 최초 commit 번호를 구하는 함수
     * @param {string} dir - 최초 commit 번호를 조회할 gitDB 경로
     * @returns - 최초 commit 번호
     */
    getInitCommit(dir){
        const stdout  = execSync('cd ' + dir + ' && git rev-list --max-parents=0 HEAD');
        let initCommitID = stdout.toString().replace(/(\r\n|\n|\r)/gm, "");
        return initCommitID;
    }

    /**
     * 현재 마지막 commit 번호를 구하는 함수
     * @returns - 현재 마지막 commit 번호
     */
    getCurCommit(){
        const stdout = execSync('cd ' + this.gitDIR_ + ' && git log -1 | grep ^commit | cut -d " " -f 2');
        this.currentCommitID = stdout.toString().replace(/(\r\n|\n|\r)/gm, "");
        return this.currentCommitID;
    }

    /**
     * 들어온 content를 파일로 작성하여 저장하는 함수
     * @param {string} filepath 
     * @param {string} content 
     */
    editFile(filepath, content) {
        fs.writeFileSync(filepath, content);
    }

    /**
     * 지정된 파일을 삭제하는 함수
     * @param {string} filepath 
     */
    deleteFile(filepath) {
        fs.existsSync(filepath) && fs.unlink(filepath, function (err) {
            if (err) {
                debug("Error: ", err);
            }
        });
    }    
}

exports.Git = Git;
