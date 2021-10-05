// Local Git DB Location
const gitDIR = './gitDB';
const simpleGit = require('simple-git');

// Options
const DEL = "DELETE";
const EDIT = "EDIT";

var fs = require('fs');
var execSync = require('child_process').execSync;

// Export Variables
exports.EDIT = EDIT;
exports.DEL = DEL;

// git init function
exports.create = async function(gitDIR_) {
    // 우선 Local Git DB 폴더가 생성되었는 지 확인 후 생성
    !fs.existsSync(gitDIR_) && fs.mkdirSync(gitDIR_);
    // simpleGit init 시작
    const git = simpleGit(gitDIR, { binary: 'git' });
    await git.init();
    return git;
}

// git commit function
exports.commit = async function(git, message) {
    // git add
    await git.add(["."]);
    // git commit
    const comm = await git.commit(message);
    // git commit 결과 파싱
    // git commit 해쉬 반환
    return comm.commit;
}

// git diff with comID
exports.diff = async function(gitDIR_, comID, filename) {
    const stdout = execSync('cd ' + gitDIR_ + ' && git diff '+comID+' '+filename);
    return stdout.toString();
}

// file delete/edit function
exports.file_manager = async function(options, gitDIR_, folder, id, contents) {
    // hierarchy로부터 파일 이름 생성하기
    // 폴더 존재 여부 확인 하면서 하나 씩 생성
    var files = gitDIR_ + folder + id + '.rdf';

    // 만약 options가 delete면 Local Git DB에서 파일 삭제
    if (options == DEL) {
        // 파일 위치 확인 후 삭제
        fs.existsSync(files) && fs.unlink(files, function (err) {
            if (err) {
                console.log("Error: ", err);
            }
        });
    }

    // 아니면 Local Git DB에 파일 추가/변경
    else if (options == EDIT) {
        // 파일 위치 확인 후 변경
        fs.writeFile(files, contents, 'utf8', function (error) {
            if (error) console.log("Error: ", err);
        });
    }
}

// Example functions for Test
async function main_commit() {
    const git = simpleGit(gitDIR, { binary: 'git' });
    var comm_commit = 0;
    await commit(git, "testtest").then((value) => comm_commit = value.slice());
    console.log(comm_commit);
}

async function main_diff() {
    const git = simpleGit(gitDIR, { binary: 'git' });
    var comm_commit = 0;
    await diff(git).then((value) => comm_commit = value.slice());
    console.log(comm_commit);
}

async function main_diff_commitID() {
    diff = await diff('8fbb50cc9d772610a0991f76f740fcd645e908b2');
    console.log(diff)
}

async function main_delete() {
    file_manager(DEL, './gitDB/temp');
}

async function main_edit() {
    file_manager(EDIT, './gitDB/temp', 'hello');
}

exports.main_directory = async function() {
    const stdout = execSync('pwd');
    console.log(stdout.toString());
}
