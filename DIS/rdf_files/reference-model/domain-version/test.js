const fs = require('fs');
const { ref_parser } = require('../../../Lib/ref_parser');

const rp = new ref_parser('./test');

var referenceModel = './domainVersion00.rdf'

const content = fs.readFileSync(referenceModel).toString();
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
console.log(rp.dir_list)

rp.array_to_filetree(rp.dir_list[1])
