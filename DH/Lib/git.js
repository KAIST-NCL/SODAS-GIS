// Local Git DB Location
const simpleGit = require('simple-git');
const fs = require('fs');
const execSync = require('child_process').execSync;
const debug = require('debug')('sodas:lib:git');

class Git {
    constructor(gitDIR_){
        this.gitDIR_ = gitDIR_;
    }
    async init(){
        // callback, argDict는 optional.
        !fs.existsSync(this.gitDIR_) && fs.mkdirSync(this.gitDIR_);
        this.git = await simpleGit(this.gitDIR_, { binary: 'git' });
        await this.git.init();
        const stdout = execSync('cd ' + this.gitDIR_ + '&& git rev-list --all --count');
        if(parseInt(stdout.toString()) === 0) {
            var commnum;
            await this._first_commit().then((commit_number)=> {
                commnum = (' '+commit_number).slice(1);
            });
            return commnum;
        }
    }

    async _first_commit(){
        execSync('cd '+ this.gitDIR_ + '&& touch init.txt');
        /*
        await this.commit(['.'], 'initial commit').then((comm) => {
            if (typeof callback !== 'undefined' && typeof argDict !== 'undefined') {
                callback("firstCommit", [], "firstCommit", comm);
            }
        });*/
        var commnum = '';
        await this.commit(['.'], 'initial commit').then((commit_number) => commnum = (' ' + commit_number).slice(1));
        return commnum;
    }

    async commit(filepath, message){
        await this.git.add([filepath]);
        const comm = await this.git.commit(message);
        return comm.commit;
    }

    diff(comID1, comID2, diff_dir){
        execSync('cd ' + this.gitDIR_ + ' && git diff '+comID1+' '+' '+comID2+' -- '+ diff_dir + ' >>  ../' + comID2 + '.patch', { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    }

    // 인자로 반드시 patch 파일의 이름, 패치할 대상을 넣는다.
    // 오버로딩 1. patch 파일의 이름만 들어온 경우 전체 패치를 진행한다.
    // 오버로딩 2. patch 파일 이름과 대상으 들어온 경우 해당 대상만 패치한다.
    apply(patch_name) {
        // 적용 가능 여부 체크하고 싶을 시엔
        // var result = execSync('cd' + this.gitDIR_ + ' && git apply --check ' + patch_name).toString()
        // 위 코드 실행 후 result가 빈 string인지 확인하면 된다.
        if (arguments.length == 1) {
            execSync('cd ' + this.gitDIR_ + ' && git apply '+ patch_name);
        }
        else if (arguments.length == 2) {
            execSync('cd ' + this.gitDIR_ + ' && git apply --reject --whitespace=fix --3way ' + patch_name);
        }
        else {
            debug("Error: # of Arguments must be either 1 or 2");
        }
    }

    getInitCommit(dir){
        const stdout  = execSync('cd ' + dir + ' && git rev-list --max-parents=0 HEAD');
        let initCommitID = stdout.toString().replace(/(\r\n|\n|\r)/gm, "");
        return initCommitID;
    }

    getCurCommit(){
        const stdout = execSync('cd ' + this.gitDIR_ + ' && git log -1 | grep ^commit | cut -d " " -f 2');
        this.currentCommitID = stdout.toString().replace(/(\r\n|\n|\r)/gm, "");
        return this.currentCommitID;
    }

    editFile(filepath, content) {
        fs.writeFileSync(filepath, content);
    }

    deleteFile(filepath) {
        fs.existsSync(filepath) && fs.unlink(filepath, function (err) {
            if (err) {
                debug("Error: ", err);
            }
        });
    }    
}

exports.Git = Git;
