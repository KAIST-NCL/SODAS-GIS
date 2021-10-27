const { Git } = require(__dirname + '/../Lib/git');
const fs = require('fs');
const { ref_parser } = require('../Lib/ref_parser');

class VC {

    // static class variable (mutex)
    static Flag = false;
    constructor(gitDir, referenceModel) {
        this.vcRoot = gitDir;
        this.git = new Git(this.vcRoot);
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

    _createReferenceDir(){
        const rp = new ref_parser(this.vcRoot);
        // TODO: this.RM을 파싱하고 디렉토리 구조를 생성
        // domainVersion00.rdf 기준
        // 1. doamin-version
        // <dct:isVersionOf ~/> 내에 domain 폴더 정보가 있다.
        // <sodas:taxonomy ~/> 내에 domain에 속하는 taxonomy 정보가 있다.
        // 2. taxonomy
        // <skos:hasTopConcept ~/> 내에 하위 폴더 정보가 있다.
        // 3. category
        // <skos:topConceptOf ~/> 내에 상위 폴더 정보가 있다.
        // <skos:narrower ~/> 내에 하위 폴더더 정보가 있다.
        // <skos:braoder ~/> 내에 상위 폴더 정보가 있다.
        // <rdf:type
        const content = fs.readFileSync(this.referenceModel).toString();
        // 줄단위로 자르기
        var contentArray = content.split('\n');
        // 구역 나누기
        var partition = rp._partition(contentArray);
        // 구역마다 돌면서 종류 확인 후 내용 처리
        // domain_version: [{dv: , name: , tax: []}, ]
        // taxonomy: [{dv: , name: , cat: []}, ]
        // cat: [{upper: , name: , below: []}, ]
        for (var i = 0; i < partition.length; i++) {
            // domain-version
            if (partition[i][0].indexOf('/domain-version/') != -1) {
                rp._domainparser(partition[i])
            }
            // taxonomy
            else if (partition[i][0].indexOf('/taxonomy/') != -1) {
                rp._taxonomyparser(partition[i])
            }
            // category
            else if (partition[i][0].indexOf('/category/') != -1) {
                rp._categoryparser(partition[i])
            }
        }
        // 무결성 검사
        for (var i = 0; i < rp.cat_dir.length; i++) {
            if (rp.cat_dir[i].upper.indexOf('taxonomy') != -1) {
                rp.check_cat_tax(rp.cat_dir[i])
            }
            else if (rp.cat_dir[i].upper.indexOf('category') != -1) {
                rp.check_cat_cat(rp.cat_dir[i])
            }
            else {
                // Error
            }
        }
        for (var i=0; i < rp.tax_dir.length; i++) {
            rp.check_tax_dom(rp.tax_dir[i])
        }
        // below가 없는 category만 갖고 우선 디렉토리를 뽑아낸다.
        for (var i = 0; i < rp.cat_dir.length; i++) {
            if (rp.cat_dir[i].below.length == 0) {
                rp.dir_list.push(rp.mkdir_from_category(rp.cat_dir[i]));
            }
        }
        // taxonomy 중 cat이 빈 애만 갖고 디렉토리를 뽑아낸다.
        for (var i = 0; i < rp.tax_dir.length; i++) {
            if (rp.tax_dir[i].cat.length == 0) {
                rp.dir_list(rp.mkdir_from_taxonomy(rp.tax_dir[i]));
            }
        }
        // domain 중 tax가 빈 애만 갖고 디렉토리를 뽑아낸다.
        for (var i = 0; i < rp.dom_dir.length; i++) {
            var t = [];
            if (rp.dom_dir[i].tax.length == 0) {
                t.push(rp.dom_dir[i].name);
                rp.dir_list.push(t);
            }
        }
        // 뽑아낸 dir_list로 디렉토리를 생성한다.
        for (var i = 0; i < rp.dir_list.length; i++) {
            rp.array_to_filetree(rp.dir_list[i]);
        }
    }
}

class publishVC extends VC{
    constructor(gitDir, referenceModel) {
        super(gitDir, referenceModel);
    }
}

class subscribeVC extends VC{
    constructor(gitDir, referenceModel) {
        super(gitDir, referenceModel);
    }
    async commit(filepath, message){
        await this.git.commit(filepath, message);
    }
}


exports.VC = VC;
exports.publishVC = publishVC;
exports.subscribeVC = subscribeVC;
