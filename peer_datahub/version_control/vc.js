// Local Git DB Location
const gitDIR = './gitDB';
const simpleGit = require('simple-git');

// Options
const DEL = "DELETE";
const EDT = "EDIT";

var fs = require('fs');
var execSync = require('child_process').execSync;

// git init function
exports.init = async function(gitDIR_) {
    // 우선 Local Git DB 폴더가 생성되었는 지 확인 후 생성
    !fs.existsSync(gitDIR_) && fs.mkdirSync(gitDIR_);
    // simpleGit init 시작
    const git = simpleGit(gitDIR, { binary: 'git' });
    await git.init();
    return git;
}

// git commit function
exports.git_commit = async function(git, message) {
    // git add
    await git.add(["."]);
    // git commit
    const comm = await git.commit(message);
    // git commit 결과 파싱
    // git commit 해쉬 반환
    return comm.commit;
}

// git diff with comID
exports.diff = async function(comID) {
    const stdout = execSync('cd ./gitDB && git diff '+comID);
    return stdout.toString();
}

// file delete/edit function
exports.file_manager = async function(options, files, contents) {
    // 만약 options가 delete면 Local Git DB에서 파일 삭제
    if (options == "DELETE") {
        // 파일 위치 확인 후 삭제
        fs.existsSync(files) && fs.unlink(files, function (err) {
            if (err) {
                console.log("Error: ", err);
            }
        });
    }
    // 아니면 Local Git DB에 파일 추가/변경
    else if (options == "EDIT") {
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
    file_manager(EDT, './gitDB/temp', 'hello');
}

exports.main_directory = async function() {
    const stdout = execSync('pwd');
    console.log(stdout.toString());
}
