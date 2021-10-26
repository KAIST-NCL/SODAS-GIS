// Local Git DB Location
const simpleGit = require('simple-git');
const fs = require('fs');
const execSync = require('child_process').execSync;

class Git {
    constructor(gitDIR_){
        this.gitDIR_ = gitDIR_;
    }
    async init(){
        !fs.existsSync(this.gitDIR_) && fs.mkdirSync(this.gitDIR_);
        this.git = await simpleGit(this.gitDIR_, { binary: 'git' });
        await this.git.init();
        const stdout = execSync('cd ' + this.gitDIR_ + '&& git rev-list --all --count');
        if(parseInt(stdout.toString()) === 0) await this._first_commit().then(()=> {console.log('Git repository is initialized & first commit is added')});
    }

    async _first_commit(){
        execSync('cd '+ this.gitDIR_ + '&& touch init.txt');
        await this.commit(['.'], 'initial commit').then();
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
