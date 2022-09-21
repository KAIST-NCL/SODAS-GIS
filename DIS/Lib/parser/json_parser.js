const { forEach } = require('async');
const { linked_list } = require('./linked_list');
const fs = require('fs');

exports.json_parser = function(ref) {
    this.ref = ref;
}

exports.json_parser.prototype._createReferenceDir = function(Ref) {
    // ReferenceModel을 파싱해서 폴더 트리를 생성하는 함수
    this.ref.referenceModel.push(Ref);
    var content = fs.readFileSync(Ref).toString();
    // JSON이니까 parse
    var jc = JSON.parse(content);
    
    var temp_dom = [];
    var temp_tax = [];
    var temp_cat = [];

    // 우선 Linked List 형태로 Domain, Taxonomy, Category를 넣는다
    // Domain
    temp_dom.push(this._domainparser(jc));
    jc.taxonomies.forEach((element) => {
        temp_tax.push(this._taxonomyparser(element));
    });
    jc.categories.forEach((element) => {
        temp_cat.push(this._categoryparser(element));
    });

    if (this._linked_list_correction_all(temp_dom, temp_tax, temp_cat)) return false;
    else {
        this.ref.dom_related_list.push(...temp_dom);
        this.ref.tax_related_list.push(...temp_tax);
        this.ref.cat_related_list.push(...temp_cat);
        this.ref._mkdir_from_list();
    }
}

exports.json_parser.prototype._domainparser = function(dict) {
    // domainId와 taxonomies.id 정보 확인 가능
    var LL = new linked_list(dict.domainId, "domain", dict.id);
    dict.taxonomies.forEach((element) => {
        LL.next.push(element.id);
    });
    return LL;
}

exports.json_parser.prototype._taxonomyparser = function(dict) {
    // parentId는 null처리 되어 있고 하위 객체 정보는 없다
    var LL = new linked_list(dict.id, "taxonomy", dict.versionId);
    LL._setPrev(dict.versionId);
    return LL;
}

exports.json_parser.prototype._categoryparser = function(dict) {
    var LL = new linked_list(dict.id, "category");
    if (dict.parentId.indexOf('taxonomy') != -1) LL._setPrev({type: "taxonomy", id: dict.parentId});
    else LL._setPrev({type: "category", id: dict.parentId});
    return LL;
}

exports.json_parser.prototype._linked_list_correction_all = function(temp_dom, temp_tax, temp_cat) {
    var fault = false;
    fault = fault || temp_dom.some((element) => {
        if (!this._linked_list_correction(element, temp_dom, temp_tax, temp_cat)) {
            debug("[ERROR]");
            return true;
        }
    });
    if (fault) return false;
    fault = fault || temp_tax.some((element) => {
        if(!this._linked_list_correction(element, temp_dom, temp_tax, temp_cat)) {
            debug("[ERROR]");
            return true;
        }
    });
    if (fault) return false;
    fault = fault || temp_cat.some((element) => {
        if (!this._linked_list_correction(element, temp_dom, temp_tax, temp_cat)) {
            debug("[ERROR]");
            return true;
        }
    });
    if (fault) return false;
}

exports.json_parser.prototype._linked_list_correction = function(LL,temp_dom,temp_tax,temp_cat) {
    // domain에 해당하는 경우 next와 taxonomy를 이어준다.
    if (LL.type == "domain") {
        // next correction
        for (var i = 0; i < LL.next.length; i++) {
            // 각각에 대하여 마지막 것을 제거하고 앞에 삽입한다.
            var tax_id = LL.next.pop();
            // - tax_id에 해당하는 linked_list를 찾는다.
            const tax_ll = temp_tax.find((element) => {
                if (element.id === tax_id) return true;
            });
            LL.next.unshift(tax_ll);
        }
    }
    // taxonomy에 해당하는 경우 prev를 domain과, next를 category와 이어준다.
    else if (LL.type == "taxonomy") {
        // next correction
        // taxonomy 자체에는 현재 next 요소가 없어서 categories에서 가져와야한다
        temp_cat.forEach((element) => {
            if (element.prev.type == "taxonomy" && element.prev.id == LL.id) {
                LL.next.unshift(element);
            }
        })
        // prev correction
        LL.prev = temp_dom.find((element) => {
            if (element.dv === LL.prev) return true;
        });
    }
    // category인 경우
    else {
        // next correction
        // next에 대한 정보를 갖고 있지 않기 때문에 categories에서 가져와야한다
        temp_cat.forEach((element) => {
            if (element.prev.type == "category" && element.prev.id == LL.id) {
                LL.next.unshift(element);
            }
        });
        // prev correction
        if (LL.prev.type === 'category') {
            LL.prev = temp_cat.find((element) => {
                if (element.id === LL.prev.id) return true;
            });
            if (LL.prev.dv !== null) LL.dv = LL.prev.dv;
        }
        else {
            LL.prev = temp_tax.find((element) => {
                if (element.id === LL.prev.id) return true;
            });
            LL.dv = LL.prev.dv;
        }
    }
    // 문제 여부 확인 - 상위 분류가 먼저 전부 correction이 끝났다고 가정한다.
    var noFault = true;
    if (LL.next.some((element) => { return (typeof(element) === 'string'); })) noFault = false;
    if (LL.prev != null) noFault = noFault && LL._checkRelation();
    return noFault;
}