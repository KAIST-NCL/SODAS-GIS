// ----------------------------------------------- //
// 읽어올 폴더 트리 구조 //
// 03-domain
// 04-group
// 05-taxonomy
// 06-taxonomy-version
// 각각의 읽어올 내용 정리 //
// domain: id
// group: id, domainId
// taxonomy: id, tenantGroupId
// taxonomyVersion: id, taxonomyId, previousVersionId, categories
// categories 내부: id, versionId, parentId
// parentId가 null이면 taxonomy가 상위, null이 아니면 해당 category가 상위
// ----------------------------------------------- //
// 자료 관리 구조 //
// ref_parser에 domain, group, taxonomy, category Map 생성
// 모두 다음과 같은 key, value 구조를 같는다 : id, {parent: {id: class}, child: {id: class, }}
// 이 때, domain은 예외로 parent는 항상 null을 가지며 taxonomy는 version 항목을 갖는다
// }

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const debug = require('debug')('sodas:lib:ref-parser\t\t|');

// ------------------------------------------ 외부 동작 함수 ------------------------------------------ //
/**
 * Reference Model을 파싱하여 폴더구조를 생성하기 위한 모듈
 * @param {string} root - ref_parser를 호출하는 모듈의 gitDB root 경로
 * @param {string} refRootdir - reference model이 저장되어 있는 최상위 폴더 경로
 */
exports.ref_parser = function(root, refRootdir) {
    this.root = root; //gitDB의 root 디렉토리
    this.refRootdir = refRootdir + '/gitDB'; // ref 파일들이 저장된 최상위 폴더
    this.refItems = {};
    // typeName에 정의된 목록만큼 Map을 생성한다
    Object.values(typeName).forEach((type) => {
        this.refItems[type] = new Map();
    });
}

/**
 * 신규 Reference Model이 추가되었을 때 이를 ref_parser에 반영하기 위한 함수
 * @param {Array} ReferenceModel 
 */
exports.ref_parser.prototype.addReferenceModel = function(ReferenceModel) {
    // ReferenceModel은 reference model 정보가 들은 배열이다
    // 우선, 분류를 한 뒤 정렬한다
    const sorted_list = sortFileList(this, ReferenceModel);
    // 배열된 결과는 sorted dict {domain: [], group: [], taxonomy: [], taxonomyVersion: []} 의 형태로 저장되어 나온다
    // 각각의 배열에 대해 iterate를 해준다
    sorted_list.domain.forEach((element) => { domainParser(this, element); });
    sorted_list.tenantGroup.forEach((element) => {
        const result = groupParser(this, element);
        if (result != errorType.NO_ERROR) {
            // groupParser에서 에러가 나왔다는 건 상위 domain이 미등록된 상태란 의미이다
            debug(result.description);
            debug("Error by " + element);
        }
    })
    sorted_list.taxonomy.forEach((element) => {
        const result = taxonomyParser(this, element);
        if (result != errorType.NO_ERROR) {
            // taxonomyParser에서 에러가 나왔다는 건 상위 group이 미등록된 상태란 의미이다
            debug(result.description);
            debug("Error by " + element);
        }
    })
    sorted_list.taxonomyVersion.forEach((element) => {
        const result = taxonomyVersionParser(this, element);
        if (result != errorType.NO_ERROR) {
            // taxonomyVersionParser에서 에러가 나왔다는 건 버전이 맞지 않다는 의미이거나 상위 taxonomy가 미등록 상태이거나 category 구조에 문제가 있다는 의미이다
            debug(result.description);
            debug("Error by " + element);
            if (result == errorType.VERSION_NOT_MATCHING) {
                // 버전이 맞지 않는 경우
            }
            // taxonomy가 미등록인 경우
            else if (result == errorType.NOT_REGISTERED) {
                // category 구조에 문제가 있는 경우
            }
        }
    })
}

/**
 * related 정보가 들어왔을 때 이를 해당하는 폴더 경로로 변환하기 위한 함수
 * @param {dictionary} related
 * @returns - 해당 폴더 경로
 */
exports.ref_parser.prototype.related_to_filepath = function(related) {
    // related의 경우에는 [{operation: , id: , type: }]의 구조를 갖는다
    // 효율적인 iteration을 위해서 중간 결과물로 {domain: ,group: ,taxonomy: ,category:[]}을 둔다
    var temp = {domain:null, tenantGroup:null, taxonomy:null, category:null};
    related.forEach((element) => {
        switch (element.type) {
            case typeName.domain:
                temp.domain = element.id;
                break;
            case typeName.tenantGroup:
                temp.tenantGroup = element.id;
                break;
            case typeName.taxonomy:
                temp.taxonomy = element.id;
                break;
            case typeName.category:
                if (!temp.category) temp.category = [];
                temp.category.push(element.id);
                break;
            default:
                break;
        }
    })
    // 무결성 체크를 하면서 filepath를 뽑아낸다
    var filePath = "";
    const keys = [typeName.domain, typeName.tenantGroup, typeName.taxonomy, typeName.category];
    for(var i = 0; i < 4; i++) {
        var value = temp[keys[i]];
        if (!value) {
            // 내 뒤에도 전부 null인지 체크 후 모두 null이면 멈추고 아니면 에러 메시지 반환ㄴ
            for (var j = i + 1; j < 4; j++) {
                if (temp[keys[j]]) return errorType.NOT_CONTINUOUS;
            }
            break; 
        }
        switch (i) {
            case 0:
                // domain인 경우
                // 무결성 체크
                if (!this.refItems.domain.get(value)) return errorType.NOT_REGISTERED;
                filePath += value;
                break;
            case 3:
                // category인 경우
                // top category 찾은 다음 child를 타고 가면서 체크
                var current_index = -1;
                var previous_info = null;
                for (var j = 0; j < value.length; j++) {
                    var previous_info = this.refItems.category.get(value[j]);
                    if (!previous_info) return errorType.NOT_REGISTERED;
                    if (previous_info.parent[temp[keys[i-1]]] == keys[i-1]) {
                        current_index = j;
                        break;
                    }
                }
                if (current_index == -1) return errorType.NOT_CONTINUOUS;
                // 찾은 top category부터 iterate
                filePath += ('/' + value.splice(current_index, 1)[0]);      
                while (value.length > 0) {
                    // previous_info에서 current_index 구하기 - 남은 항목 중 previous_info의 child에 속하는 것이 있어야만 한다
                    current_index = value.findIndex((id) => {
                        if (previous_info.child[id]) return true;
                    });
                    if (current_index == -1) return errorType.NOT_CONTINUOUS;
                    // 현재 내용을 배열에서 제거 및 filePath에 잇기
                    previous_info = this.refItems.category.get(value[current_index]);
                    filePath += ('/' + value.splice(current_index, 1)[0]);
                }
                break;
            default:
                // gropu, taxonomy의 경우
                // 무결성 체크
                var self_info = (i == 1) ? this.refItems.tenantGroup.get(value) : this.refItems.taxonomy.get(value);
                if (!self_info) return errorType.NOT_REGISTERED;
                if (self_info.parent[temp[keys[i-1]]] != keys[i-1]) return errorType.TYPE_NOT_MATCHING; // parent의 ID가 다르거나 type이 다른 경우
                filePath += ('/' + value);
                break;
        }
    }
    return filePath;
}

/**
 * 원하는 위치에 폴더를 생성하는 함수
 * @private
 * @param {string} target - 폴더 경로
 */
exports.ref_parser.prototype._folder_create = function(target) {
    !fs.existsSync(target) && fs.mkdirSync(target, {recursive: true});
}

/**
 * 주어진 타입과 id에 해당하는 폴더/파일 경로를 검색하는 함수
 * @param {string} type - domain / group /  taxonomy / category / asset
 * @param {string} id - 식별자
 * @returns - 해당하는 폴더 / 파일 경로
 */
exports.ref_parser.prototype.search_filepath = function(type, id) {
    if (!Object.values(typeName).includes(type)) {
        debug("Wrong Type Given: " + type + ", " + id);
        return errorType.TYPE_NOT_MATCHING;
    }
    // id와 type 기반으로 등록 여부 확인
    var current = null;
    current = this.refItems[type].get(id);
    if (!current) return errorType.NOT_REGISTERED;
    // 위로 타고 들어가면서 폴더 경로 생성
    var filePath = id;
    while(current.parent != null) {
        // 검색
        var currentId = Object.keys(current.parent)[0];
        current = this.refItems[current.parent[currentId]].get(currentId);
        // 파일 경로에 추가
        filePath = currentId + '/' + filePath;
    }
    return filePath;
}

/**
 * ref_parser 동작 확인 함수
 * @param {*} folderPath 
 */
exports.ref_parser.prototype.test = function(folderPath) {
    // 반드시 folderPath는 03-domain, 04-tenant-group, 05-taxonomy, 06-taxonomy-version을 갖고 있어야한다.
    const folder_list = [refFolder.domain, refFolder.group, refFolder.taxonomy, refFolder.taxonomyVersion];
    var filePath_list = [];
    folder_list.forEach((element) => {
        var fileList = fs.readdirSync(folderPath+'/'+element).filter(filename => filename.includes(".json"));
        fileList.forEach((e) => filePath_list.push(element+'/'+e));
    })
    this.refRootdir = folderPath;
    // 만들어진 파일 목록으로 프로그램 테스트
    this.addReferenceModel(filePath_list);
    // 저장된 결과물 확인
    var print_map = function(map) {
        const mapIterator = map.entries();
        var current = mapIterator.next();
        while (!current.done) {
            const [key, value] = current.value;
            console.log("[ " + key + ' | ' + JSON.stringify(value).replace(/:/g, ": ").replace(/,/g, ", ") + ' ]');
            current = mapIterator.next();
        }
    }
    Object.values(this.refItems).forEach((map) => print_map(map));

    // related_to_filepath 기능 점검
    console.log("\n Related_to_FilePath 기능 점검입니다. related를 입력하여 기능을 점검하거나 exit을 입력하여 종료하세요");
    var r = readline.createInterface({input: process.stdin, output: process.stdout});
    r.setPrompt('> ');
    r.prompt();
    var self = this;
    r.on('line', function(line) {
        if (line == 'exit') {
            r.close();
        }
        console.log(self.related_to_filepath(JSON.parse(line)));
        r.prompt();
    });
    r.on('close', function() {
        process.exit();
    });
}

// ------------------------------------------ 내부 동작 함수 ------------------------------------------ //
/**
 * JSON 파일을 읽어와 Dictionary로 반환하는 함수
 * @private
 * @param {string} filepath - JSON 파일 경로
 * @returns - dictionary 반환
 */
function readJsonToDict(filepath) {
    const jsonFile = fs.readFileSync(filepath, 'utf8');
    const msg_ = JSON.parse(jsonFile);
    const dict = JSON.parse(msg_.content)
    return dict;
}

/**
 * Domain에 해당하는 파일 파싱 함수
 * @param {ref_parser} parser 
 * @param {string} filepath 
 */
function domainParser(parser, filepath) {
    const dict = readJsonToDict(filepath);
    // 읽어올 내용은 id 하나 뿐이다
    const domainId = dict.id;
    var new_domain = {parent: null, child: {}};
    // parser의 domain에 해당 내용 추가
    parser.refItems.domain.set(domainId, new_domain);
    // 폴더 생성하기
    parser._folder_create(parser.root + '/' + parser.search_filepath(typeName.domain, domainId));
}

/**
 * Group에 해당하는 파일 파싱 함수
 * @param {ref_parser} parser 
 * @param {string} filepath 
 * @returns - 에러 종류 반환
 */
function groupParser(parser, filepath) {
    const dict = readJsonToDict(filepath);
    // 읽어올 내용은 id, domainId 두개이다
    const tenantGroupId = dict.id;
    const domainId = dict.domainId;
    // domain이 존재하는지 확인
    var domain = parser.refItems.domain.get(domainId); // 없으면 undefined
    if (!domain) return errorType.NOT_REGISTERED;
    // 해당 도메인의 child에 tenantGroup 추가
    domain.child[tenantGroupId] = typeName.tenantGroup;
    // parser의 tenantGroup에 내용 추가
    var new_tenantGroup = {parent: {}, child: {}};
    new_tenantGroup.parent[domainId] = typeName.domain;
    parser.refItems.tenantGroup.set(tenantGroupId, new_tenantGroup);
    // 폴더 생성하기
    parser._folder_create(parser.root + '/' + parser.search_filepath(typeName.tenantGroup, tenantGroupId));
    return errorType.NO_ERROR;
}

/**
 * Taxonomy에 해당하는 파일 파싱 함수
 * @param {ref_parser} parser 
 * @param {string} filepath 
 * @returns - 에러 종류 반환
 */
function taxonomyParser(parser, filepath) {
    const dict = readJsonToDict(filepath);
    // 읽어올 내용은 id, tenantGroupId이다
    const taxonomyId = dict.id;
    const tenantGroupId = dict.tenantGroupId;
    // group이 존재하는지 확인
    var tenantGroup = parser.refItems.tenantGroup.get(tenantGroupId);
    if (!tenantGroup) return errorType.NOT_REGISTERED;
    // 해당 tenantGroup의 child에 taxonomy 추가
    tenantGroup.child[taxonomyId] = typeName.taxonomy;
    // parser의 taxonomy에 내용 추가
    var new_taxonomy = {parent: {}, child: {}, previousVersion: null};
    new_taxonomy.parent[tenantGroupId] = typeName.tenantGroup;
    parser.refItems.taxonomy.set(taxonomyId, new_taxonomy);
    // 폴더 생성하기
    parser._folder_create(parser.root + '/' + parser.search_filepath(typeName.taxonomy, taxonomyId));
    return errorType.NO_ERROR;
}

/**
 * TaxonomyVersion에 해당하는 파일 파싱 함수
 * @param {ref_parser} parser 
 * @param {string} filepath 
 * @returns - 에러 종류 반환
 */
function taxonomyVersionParser(parser, filepath) {
    const dict = readJsonToDict(filepath);
    // 읽어올 내용은 id,taxonomyId, previousVersionId, categories
    const current_versionId = dict.id;
    const previous_versionId = dict.previousVersionId;
    const taxonomyId = dict.taxonomyId;
    const categories = dict.categories;
    // Taxonomy 존재여부 확인
    var taxonomy = parser.refItems.taxonomy.get(taxonomyId);
    if (!taxonomy) return errorType.NOT_REGISTERED;
    // 버전 체크
    if (taxonomy.previousVersion != previous_versionId) return errorType.VERSION_NOT_MATCHING;
    // 버전이 일치한다면 버전을 갱신한 다음 category를 파싱한다
    taxonomy.previousVersion = current_versionId;
    // categories 읽어들이기
    while (categories.length > 0) {
        // 앞에서부터 하나씩
        var current = categories.shift();
        if (categoryParser(parser, taxonomyId, current) != errorType.NO_ERROR) {
            // 만약 에러가 발생한다면 일단 뒤로 보낸다
            categories.push(current);
        }
    }
    return errorType.NO_ERROR;
}

/**
 * TaxonomyVersion 내의 category 항목 파싱 함수
 * @param {ref_parser} parser 
 * @param {string} taxonomyId - 해당 category가 속하는 Taxonomy의 ID
 * @param {dictionary} category - 해당 category 정보가 담긴 dictionary
 * @returns - 에러 종류 반환
 */
function categoryParser(parser, taxonomyId, category) {
    // 읽어들일 내용: id, parentId
    const categoryId = category.id;
    const parentId = category.parentId;
    // 우선 parent가 등록된 바 있는 지 확인
    if (parentId == null) {
        // taxonomy가 parent인 경우
        var taxonomy = parser.refItems.taxonomy.get(taxonomyId);
        // 해당 taxonomy의 child에 category 추가
        taxonomy.child[categoryId] = typeName.category;
        // parser의 category에 내용 추가
        var new_category = {parent: {}, child: {}};
        new_category.parent[taxonomyId] = typeName.taxonomy;
        parser.refItems.category.set(categoryId, new_category);
        // 폴더 생성하기
        parser._folder_create(parser.root+ '/' + parser.search_filepath(typeName.category, categoryId));
        return errorType.NO_ERROR;
    }
    else {
        // category가 parent인 경우
        var parent_category = parser.refItems.category.get(parentId);
        if (parent_category) {
            // 해당 category의 child에 category 추가
            parent_category.child[categoryId] = typeName.category;
            // parser의 category에 내용 추가
            var new_category = {parent: {}, child:{}};
            new_category.parent[parentId] = typeName.category;
            parser.refItems.category.set(categoryId, new_category);
            // 폴더 생성하기
            parser._folder_create(parser.root + '/' + parser.search_filepath(typeName.category, categoryId));
            return errorType.NO_ERROR;
        }
        else {
            // 아직 부모 카테고리가 미등록 상태인 경우
            return errorType.NOT_REGISTERED;
        }
    }
}

/**
 * 해당 파일의 최종 수정 시간을 확인하는 함수
 * @param {string} filepath 
 * @returns - 최종 수정 시간 반환
 */
function getModifiedTime(filepath) {
    const content = readJsonToDict(filepath);
    return new Date(content.modified);
}

/**
 * 파일 목록을 종류 별로 나누고 수정 시간에 따라 정렬하는 함수
 * @param {ref_parser} parser 
 * @param {Array} filepathList 
 * @returns - 정렬된 파일 배열
 */
function sortFileList(parser, filepathList) {
    // 파일 목록을 보고 domain, tenantGroup, taxonomy, taxonomyVersion 별로 나눈다
    // 각각 분류 내에서 파일 수정 시간에 따라 순서를 정렬한다
    var sorted = {domain:[], tenantGroup:[], taxonomy:[], taxonomyVersion:[]};
    // 우선 분류
    filepathList.forEach((filepath) => {
        var fullDir = path.dirname(filepath);
        var upperDir = fullDir.split(path.sep).pop();
        switch (upperDir) {
            case refFolder.domain:
                sorted.domain.push(parser.refRootdir + '/' + filepath);
                break;
            case refFolder.tenantGroup:
                sorted.tenantGroup.push(parser.refRootdir + '/' + filepath);
                break;
            case refFolder.taxonomy:
                sorted.taxonomy.push(parser.refRootdir + '/' + filepath);
                break;
            case refFolder.taxonomyVersion:
                sorted.taxonomyVersion.push(parser.refRootdir + '/' + filepath);
                break;
            default:
                debug('Not the target Folder: ' + filepath);
                break;
        }
    });
    // 정렬
    // 정렬은 taxonomyVersion만 하면 된다
    if (sorted.taxonomyVersion.length > 2) {
        sorted.taxonomyVersion.sort(function(a,b) {
            return getModifiedTime(a) - getModifiedTime(b);
        });
    }
    return sorted;
}

// ------------------------------------------ ENUM ------------------------------------------ //
const errorType = Object.freeze({
    NOT_REGISTERED: Symbol('item is not registered yet'),
    VERSION_NOT_MATCHING: Symbol('version is not matching'),
    TYPE_NOT_MATCHING: Symbol('type and id is not matching'),
    NOT_CONTINUOUS: Symbol('input related is disconnected'),
    NO_ERROR: Symbol('no error')
});

const typeName = Object.freeze({
    domain: 'domain',
    tenantGroup: 'tenantGroup',
    taxonomy: 'taxonomy',
    category: 'category'
});

const refFolder = Object.freeze({
    domain: 'domain',
    tenantGroup: 'tenantGroup',
    taxonomy: 'taxonomy',
    taxonomyVersion: 'taxonomyVersion'
});


// 예시 related
// [{"operation": "UPDATE", "id": "domain01", "type": "domain"}, {"operation": "UPDATE", "id": "group01", "type": "group"}, {"operation": "UPDATE", "id": "taxonomy01", "type": "taxonomy"}, {"operation": "UPDATE", "id": "category0001", "type": "category"}, {"operation": "UPDATE", "id": "category00011", "type": "category"}]


// 틀린 예시 related
// [{"operation": "UPDATE", "id": "domain01", "type": "domain"}, {"operation": "UPDATE", "id": "taxonomy01", "type": "taxonomy"}, {"operation": "UPDATE", "id": "category0001", "type": "category"}, {"operation": "UPDATE", "id": "category00011", "type": "category"}]

