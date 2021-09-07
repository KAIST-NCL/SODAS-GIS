// Local Git DB Location
const gitDIR = './gitDB';
const simpleGit = require('simple-git');

async function git_init() {
    // 우선 Local Git DB 폴더가 생성되었는 지 확인 후 생성
    !fs.existsSync(gitDIR) && fs.mkdirSync(gitDIR);
    // Git DB 내에 필요한 폴더 존재 여부 확인 후 생성

    // simpleGit init 시작
    const git = simpleGit(gitDIR, { binary: 'git' });
    await git.init();
    return git;
}

async function git_commit(git, message) {
    // git add
    await git.add(["."]);
    // git commit
    const comm = await git.commit(message);
    // git commit 결과 파싱
    // git commit 해쉬 반환
    return comm.commit;
}

async function git_diff(git, hash1, hash2) {
    // git diff hash1 hash2
    const diff = await git.diff();
    console.log(diff);
}

function db_file_manager(options, files) {
    // 만약 options가 delete면 Local Git DB에서 파일 삭제
    if (options == "DELETE") {
        // 파일 위치 확인 후 삭제
    }
    // 아니면 Local Git DB에 파일 추가/변경
    else if (options == "EDIT") {
        // 파일 위치 확인 후 변경경

        // git에 등록
        
        //
    }
}

const git = simpleGit(gitDIR, { binary: 'git' });
var comm_commit = 0;
git_commit(git, "testtest").then((value) => comm_commit = value.slice());
console.log(comm_commit);