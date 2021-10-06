// Local Git DB Location
const simpleGit = require('simple-git');

// Options
const DEL = "DELETE";
const EDIT = "EDIT";

var fs = require('fs');
var execSync = require('child_process').execSync;
var vc = require('./versionControl');

// Export Variables
exports.EDIT = EDIT;
exports.DEL = DEL;

class Git {
    constructor(gitDIR_){
        this.gitDIR_ = gitDIR_;
    }
    async init(){
        !fs.existsSync(this.gitDIR_) && fs.mkdirSync(this.gitDIR_);
        this.git = await simpleGit(this.gitDIR_, { binary: 'git' });
        await this.git.init();
    }

    async commit(filepath, message){
        await this.git.add([filepath]);
        const comm = await this.git.commit(message);
        return comm.commit;
    }

    diff(comID1, comID2, diff_dir){
        execSync('cd ' + this.gitDIR_ + ' && git diff '+comID1+' '+' '+comID2+' -- '+ diff_dir + ' >>  ../' + comID2 + '.patch', { stdio: 'ignore'});
    }

    apply(patch_name){
         execSync('cd ' + this.gitDIR_ + ' && git apply '+ patch_name);
    }

    getInitCommit(){
        const stdout  = execSync('cd ' + this.gitDIR_ + ' && git rev-list --max-parents=0 HEAD');
        let initCommitID = stdout.toString().replace(/(\r\n|\n|\r)/gm, "");
        return initCommitID;
    }

    getCurCommit(){
        const stdout = execSync('cd ' + this.gitDIR_ + ' && git log -1 | grep ^commit | cut -d " " -f 2');
        this.currentCommitID = stdout.toString().replace(/(\r\n|\n|\r)/gm, "");
        return this.currentCommitID;
    }
}


exports.Git = Git;

/*************************** 정원 코드 *************************/
exports.create = async function(gitDIR_) {
    // 우선 Local Git DB 폴더가 생성되었는 지 확인 후 생성
    !fs.existsSync(gitDIR_) && fs.mkdirSync(gitDIR_);
    // simpleGit init 시작
    const git = await simpleGit(gitDIR_, { binary: 'git' });
    await git.init();
    return git;
};

// git commit function
exports.commit = async function(git, message) {
    // git add
    await git.add(['.']);
    // git commit
    const comm = await git.commit(message);
    // git commit 결과 파싱
    // git commit 해쉬 반환
    return comm.commit;
};

// git diff with comID
exports.diff = async function(gitDIR_, comID1, comID2, diff_dir) {
    if(comID1)
    stdout = await execSync('cd ' + gitDIR_ + ' && git diff '+comID1+' '+' '+comID2+' '+ diff_dir);
    return stdout.toString();
};


// file delete/edit function
exports.file_manager = async function(options, gitDIR_, folder, id, contents) {
    // hierarchy로부터 파일 이름 생성하기
    // 폴더 존재 여부 확인 하면서 하나 씩 생성
    var files = gitDIR_ + '/' + folder + id + '.rdf';

    // 만약 options가 delete면 Local Git DB에서 파일 삭제
    if (options == DEL) {
        // 파일 위치 확인 후 삭제
        await fs.existsSync(files) && fs.unlink(files, function (err) {
            if (err) {
                console.log("Error: ", err);
            }
        });
    }

    // 아니면 Local Git DB에 파일 추가/변경
    else if (options == EDIT) {
        // 파일 위치 확인 후 변경
        await fs.writeFile(files, contents, 'utf8', function (error) {
            if (error) console.log("Error: ", err);
        });
    }
    return files
};

exports.main_directory = async function() {
    const stdout = execSync('pwd');
    console.log(stdout.toString());
};

