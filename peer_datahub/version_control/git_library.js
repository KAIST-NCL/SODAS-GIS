// Local Git DB Location
const gitDIR = './gitDB';
const assetDIR = './gitDB/asset'
const categDIR = './gitDB/category'
const simpleGit = require('simple-git');

// Options
const DEL = "DELETE";
const EDT = "EDIT";

var fs = require('fs');
var execSync = require('child_process').execSync;

// git init function
async function git_init() {
    // 우선 Local Git DB 폴더가 생성되었는 지 확인 후 생성
    !fs.existsSync(gitDIR) && fs.mkdirSync(gitDIR);
    // Git DB 내에 필요한 폴더 존재 여부 확인 후 생성
    !fs.existsSync(assetDIR) && fs.mkdirSync(assetDIR);
    !fs.existsSync(categDIR) && fs.mkdirSync(categDIR);
    // simpleGit init 시작
    const git = simpleGit(gitDIR, { binary: 'git' });
    await git.init();
    return git;
}

// git commit function
async function git_commit(git, message) {
    // git add
    await git.add(["."]);
    // git commit
    const comm = await git.commit(message);
    // git commit 결과 파싱
    // git commit 해쉬 반환
    return comm.commit;
}

async function git_diff(comID) {
    const stdout = execSync('cd ./gitDB && git diff '+comID);
    return stdout.toString();
}

// file delete/edit function
async function db_file_manager(options, files, contents) {
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
    await git_commit(git, "testtest").then((value) => comm_commit = value.slice());
    console.log(comm_commit);
}

async function main_diff() {
    const git = simpleGit(gitDIR, { binary: 'git' });
    var comm_commit = 0;
    await git_diff(git).then((value) => comm_commit = value.slice());
    console.log(comm_commit);
}

async function main_diff_commitID() {
    diff = await git_diff_comID('8fbb50cc9d772610a0991f76f740fcd645e908b2');
    console.log(diff)
}

async function main_delete() {
    db_file_manager(DEL, './gitDB/temp');
}

async function main_edit() {
    db_file_manager(EDT, './gitDB/temp', 'hello');
}