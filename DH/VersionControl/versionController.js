const { Git } = require(__dirname + '/../Lib/git');
const { ref_parser } = require('../Lib/ref_parser');

class VC {

    // static class variable (mutex)
    static Flag = false;
    constructor(gitDir, refRootdir) {
        this.vcRoot = gitDir;
        this.git = new Git(this.vcRoot);
        this.dir_list = [];
        this.isInit = false;
        this.rp = new ref_parser(this.vcRoot, refRootdir);
    }

    async init(){
        await this.git.init();
        this.isInit = true;
    }

    addReferenceModel(ReferenceModel) {
        this.rp.addReferenceModel(ReferenceModel);
    }
}

class publishVC extends VC{
    constructor(gitDir, referenceModel) {
        super(gitDir, referenceModel);
    }
    async commit(filepath, message){
        if(this.constructor.name.Flag){
            // retry commit
            const timeOut = 100;
            setTimeout(this.commit.bind(this), timeOut, filepath, message);
        }else{
            // MUTEX ON
            this.constructor.name.Flag = true;
            let commitNum = '';
            await this.git.commit(filepath, message).then((commit_number) => commitNum = (' ' + commit_number).slice(1));
            // MUTEX OFF
            this.constructor.name.Flag = false;
            return commitNum;
        }
    }
}

class subscribeVC extends VC{
    constructor(gitDir, referenceModel) {
        super(gitDir, referenceModel);
    }
    
    async commit(filepath, message){
        // commit 처리할 때 mutex 없게 수정해야함
        await this.git.commit(filepath, message);
    }

    async apply(gitPatch) {
        this.git.apply(gitPatch);
    }
}


exports.VC = VC;
exports.publishVC = publishVC;
exports.subscribeVC = subscribeVC;
