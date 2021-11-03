const fs = require('fs');

class ref_parser {
    // reference model을 읽어 폴더 구조로 변환하는 코드
    // 목표 1. Reference 파일을 읽어 Domain, Taxonomy, Category 별로 내용 추출
    // 목표 2. message.related <-> filepath 변환 기능 제공
    // 목표 3. Reference Model이 바뀔 때 업데이트 기능 제공

    // message.related 양식: [{operation: '', id: '', type: ''}, {...}]
    constructor(root, referenceModel) {
        this.root = root; // gitDB의 root 디렉토리
        this.referenceModel = referenceModel; // reference Model의 파일 경로
        // 완성된 root 폴더부터 leaf 폴더들까지의 경로가 저장될 배열
        // ex) [[domain, taxonomy, category, category, ..., category], [...]];
        this.dir_list = [];
        // referenceModel로부터 뽑아낸 관계 정보가 담긴 linked list의 배열
        this.dom_related_list = [];
        this.tax_related_list = [];
        this.cat_related_list = [];
    }

    // ---------------------  외부 노출 함수 ----------------------- //
    // Reference Model을 파싱하여 폴더 트리를 생성하는 함수
    createReferenceDir() {
        // Reference Model을 읽어드린 후 Pre-Process ==> <rdf:Description> 구역 단위로 파티션들을 만든다.
        var content = fs.readFileSync(this.referenceModel).toString();
        var partition = this._partition(content.split('\n'));

        // 각 파티션들을 Domain, Taxonomy, Category로 분류한 다음 각각 linked_list를 만든다.
        partition.forEach((element) => {
            if (element[0].indexOf('/domain-version') >= 0) this._domainparser(element);
            else if (element[0].indexOf('/taxonomy/') >= 0) this._taxonomyparser(element);
            else if (element[0].indexOf('/category/') >= 0) this._categoryparser(element);
        });

        // 현재 linked_list의 next와 prev에는 string 혹은 dictionary가 들어있는데, 이를 바로잡아 준다.
        if (this._linked_list_correction_all()) return false;
        else {
            // next가 없는 category만 갖고 우선 디렉토리를 뽑아낸다.
            this.cat_related_list.forEach((element) => {
                if (element.next.length == 0) {
                    this.dir_list.push(this._mkdirarray(element));
                }
            });
            // next가 없는 taxonomy만 갖고 우선 디렉토리를 뽑아낸다.
            this.tax_related_list.forEach((element) => {
                if (element.next.length == 0) {
                    this.dir_list.push(this._mkdirarray(element));
                }
            });
            // next가 없는 domain만 갖고 우선 디렉토리를 뽑아낸다.
            this.dom_related_list.forEach((element) => {
                if (element.next.length == 0) {
                    this.dir_list.push(this._mkdirarray(element));
                }
            });

            // 뽑아낸 디렉토리 목록으로 디렉토리를 생성한다.
            this._mkdir_from_list();

            return true;
        }
    }

    // related 정보가 들어오면 이를 바탕으로 filepath를 만들어주는 함수
    related_to_filepath() {

    }

    // Reference Model 변경 시 update하는 함수
    update(referenceModel) {
        // 정보 백업
        this.old_dir_list = this.dir_list;
        // 내부 변수 초기화
        this.referenceModel = referenceModel;
        this.dir_list = [];
        this.dom_related_list = [];
        this.tax_related_list = [];
        this.cat_related_list = [];

        // 폴더 트리 다시 생성
        this.createReferenceDir();

        // 현재 dir_list와 맞지 않는 폴더들 처리
    }

    // ---------------------  내부 동작용 함수 ----------------------- //
    // 해당 경로에 폴더를 생성하는 함수
    _folder_create(target) {
        !fs.existsSync(target) && fs.mkdirSync(target);
    }

    // 필요한 내용이 들은 줄이 파티션 내에서 몇 번째 인덱스에 해당하는지 반환하는 함수.
    // 검색할 파티션, 검색할 스트링
    // 인덱스 배열 반환
    _findLine(partition, toFind) {
        var line = [];
        partition.forEach((element, index) => {
            if (element.indexOf(toFind) >= 0) {
                line.push(index);
            }
        });
        return line;
    }

    // reference model rdf 파일을 구역별로 쪼개는 함수
    // 줄단위로 읽어드린 rdf 파일의 스트링을 입력값으로 넣어준다.
    _partition(contentArray) {
        let partition = [];
        let toStore = false; // 0이면 true, 1이면 false
        let temp = [];
        contentArray.forEach((element) => {
            if (!toStore) {
                // rdf:Description을 발견하면 temp에 저장하기 시작
                if (element.indexOf('<rdf:Description') >= 0) {
                    toStore = true;
                    temp.push(element);
                }
            } else {
                temp.push(element);
                // </rdf:Description>을 발견하면 저장을 멈추고 temp를 partition에 추가한 다음 비운다.
                if (element.indexOf('</rdf:Description>') >= 0) {
                    toStore = false;
                    partition.push(temp);
                    temp = [];
                }
            }
        });
        return partition;
    }

    // 파티션들에서 파싱한 정보를 갖고 linked_list를 만든다.
    // 아래 함수들에선 임시로 prev와 next를 문자열로 저장. 추후에 pop을 통하여 정비할 예정
    _domainparser(i_partition) {
        // <dct:isVersionOf ~/> 내에 domain 폴더 정보가 있다.
        var line_isVersion = this._findLine(i_partition, '<dct:isVersionOf');
        // id, dv를 구한다.
        var dv = i_partition[0].split('/domain-version/')[1].split('"')[0];
        var id = i_partition[line_isVersion[0]].split('/domain/')[1].split('"')[0];
        // Linked List 생성
        var LL = new linked_list(id, "domain", dv);
        // <sodas:taxonomy ~/> 내에 domain에 속하는 taxonomy 정보가 있다.
        var line_isTax = this._findLine(i_partition, '<sodas:taxonomy');
        line_isTax.forEach((element) => {
            LL.next.push(i_partition[element].split('/taxonomy/')[1].split('"')[0])
        });
        this.dom_related_list.push(LL);
    }
    _taxonomyparser(i_partition) {
        // id, dv를 구한다.
        var id = i_partition[0].split('/taxonomy/')[1].split('"')[0];
        // <skos:inScheme ~/> 내에 상위 폴더 정보가 있다.
        var line_inScheme = this._findLine(i_partition, '<skos:inScheme');
        var dv = i_partition[line_inScheme[0]].split('/domain-version/')[1].split('"')[0];
        // Linked List 생성
        var LL = new linked_list(id, "taxonomy");
        LL._setPrev(dv);
        // <skos:hasTopConcept ~/> 내에 하위 폴더 정보가 있다.
        var line_hasTop = this._findLine(i_partition, '<skos:hasTopConcept');
        line_hasTop.forEach((element) => {
            LL.next.push(i_partition[element].split('/category/')[1].split('"')[0]);
        });
        this.tax_related_list.push(LL);
    }
    _categoryparser(i_partition) {
        // id를 구한다.
        var id = i_partition[0].split('/category/')[1].split('"')[0];
        var LL = new linked_list(id, "category");
        // category는 broader을 갖는 경우 상위가 category이다.
        var line_nar = this._findLine(i_partition, '<skos:narrower');
        var line_bro = this._findLine(i_partition, '<skos:broader');
        if (line_bro.length === 0) {
            // topConceptOf가 상위
            var line_top = this._findLine(i_partition, '<skos:topConceptOf');
            LL._setPrev({type: "tax", id: i_partition[line_top[0]].split('/taxonomy/')[1].split('"')[0]});
        }
        else {
            // broader가 상위
            LL._setPrev({type: "cat", id: i_partition[line_bro[0]].split('/category/')[1].split('"')[0]});               
        }
        // narrower가 하위
        line_nar.forEach((element) => {
            LL.next.push(i_partition[element].split('/category/')[1].split('"')[0]);
        });
        this.cat_related_list.push(LL);
    }

    // 위에서 만든 linked list에서 prev와 next를 전부 다른 linked_list로 바꿔준다.
    _linked_list_correction_all() {
        var fault = false;
        fault = fault || this.dom_related_list.some((element) => {
            if(!this._linked_list_correction(element)) {
                console.log("Error");
                return true;
            }
        });
        if (fault) return false;
        fault = fault || this.tax_related_list.some((element) => {
            if(!this._linked_list_correction(element)) {
                console.log("Error");
                return true;
            }
        });
        if (fault) return false;
        fault = fault || this.cat_related_list.some((element) => {
            if(!this._linked_list_correction(element)) {
                console.log("Error");
                return true;
            }
        });
        if (fault) return false;
    }
    _linked_list_correction(LL) {
        // domain에 해당하는 경우 next와 taxonomy를 이어준다.
        if (LL.type == "domain") {
            // next correction
            for (var i = 0; i < LL.next.length; i++) {
                // 각각에 대하여 마지막 것을 제거하고 앞에 삽입한다.
                var tax_id = LL.next.pop();
                // - tax_id에 해당하는 linked_list를 찾는다.
                const tax_ll = this.tax_related_list.find((element) => {
                    if (element.id === tax_id) return true;
                });
                LL.next.unshift(tax_ll);
            }
        }
        // taxonomy에 해당하는 경우 prev를 domain과, next를 category와 이어준다.
        else if (LL.type == "taxonomy") {
            // next correction
            for (var i = 0; i < LL.next.length; i++) {
                // 각각에 대하여 마지막 것을 제거하고 앞에 삽입한다.
                var cat_id = LL.next.pop();
                // - cat_id에 해당하는 linked_list를 찾는다.
                const cat_ll = this.cat_related_list.find((element) => {
                    if (element.id === cat_id) return true;
                });
                LL.next.unshift(cat_ll);
            }
            // prev correction
            LL.prev = this.dom_related_list.find((element) => {
                if (element.dv === LL.prev) return true;
            });
        }
        // category인 경우
        else {
            // next correction
            for (var i = 0; i < LL.next.length; i++) {
                // 각각에 대하여 마지막 것을 제거하고 앞에 삽입한다.
                var cat_id = LL.next.pop();
                // - cat_id에 해당하는 linked_list를 찾는다.
                const cat_ll = this.cat_related_list.find((element) => {
                    if (element.id === cat_id) return true;
                });
                LL.next.unshift(cat_ll);
            }
            // prev correction
            if (LL.prev.type === 'cat') {
                LL.prev = this.cat_related_list.find((element) => {
                    if (element.id === LL.prev.id) return true;
                });
            }
            else {
                LL.prev = this.tax_related_list.find((element) => {
                    if (element.id === LL.prev.id) return true;
                });                
            }
        }
        // 문제 여부 확인 - 상위 분류가 먼저 전부 correction이 끝났다고 가정한다.
        var noFault = true;
        if (LL.next.some((element) => { return (typeof(element) === 'string'); })) noFault = false;
        if (LL.prev != null) noFault = noFault && LL._checkRelation();
        return noFault;
    }

    // linked list들로부터 파일 트리 정보가 담긴 array를 만든다.
    _mkdirarray(LL) {
        var temp_dir_list = [LL.id];
        // prev가 null일 때까지 검색해 들어가면서 temp_dir_list에 [상위, .. , 하위] 순서로 id를 쌓는다.
        if (LL.prev) temp_dir_list = this._mkdirarray(LL.prev).concat(temp_dir_list);
        return temp_dir_list;
    }

    // dir_list를 갖고 root 폴더 아래에 폴더들을 만든다.
    _mkdir_from_list() {
        this.dir_list.forEach((dirarray) => {
            var folder_dir = this.root
            dirarray.forEach((element) => {
                folder_dir = folder_dir + '/' + element;
                this._folder_create(folder_dir);
            });
        });
    }    
}

// Linked list의 원본 클래스
class linked_list {
    // prev는 반드시 하나의 class 객체야 한다.
    constructor(id, type, dv=null) {
        this.id = id; // Domain/Taxonomy/Category 의 id
        this.type = type; 
        this.dv = dv; // Domain과 Taxonomy에서만 사용된다. root에 해당하는 Domain의 Version을 뜻한다.
        this.prev = null;
        this.next = [];
    }
    
    // prev 세팅
    _setPrev(prev) {
        this.prev = prev;
    }

    // next 추가
    _addNext(next) {
        this.next.push(next);
    }

    // 상위 클래스와의 비교를 통해 오류 점검 - 문제 발생 시 false 반환
    _checkRelation() {
        if (typeof(this.prev) === 'string') return false;
        if (this.prev.next.indexOf(this) < 0) return false;
        else return true;         
    }
}

exports.ref_parser = ref_parser;