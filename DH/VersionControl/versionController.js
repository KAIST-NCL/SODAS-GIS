const { Git } = require(__dirname + '/../Lib/git');
const { ref_parser } = require('../Lib/ref_parser');

class VC {

    // static class variable (mutex)
    static Flag = false;
    constructor(gitDir, referenceModel) {
        this.vcRoot = gitDir;
        this.git = new Git(this.vcRoot);
        this.dir_list = [];
        if(typeof(referenceModel) != null){
            this.setReferenceModel(referenceModel);
        }
        this.isInit = false;
    }

    async init(){
        await this.git.init();
        this.isInit = true;
    }

    setReferenceModel(referenceModel){
        this.RM = referenceModel;
        this._createReferenceDir();
    }

    _createReferenceDir() {
        // 만약 최초 실행인 경우
        if(typeof this.rp === 'undefined') {
            this.rp = new ref_parser(this.vcRoot, this.RM);
            this.rp.createReferenceDir();
        }
        // 업데이트인 경우
        else this.rp.update(this.RM);
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
            const commitNum = await this.git.commit(filepath, message);
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
