const { ref_parser } = require('../../Lib/ref_parser');
const fs = require('fs');

var referenceModel1 = 'domainVersion00.rdf';
var referenceModel2 = 'domainVersion02.rdf';
var refDir = '/home/ncl/jwlee/KAIST_SODAS/DH/rdf_files/reference-model/domain-version'
var root = __dirname + '/ref_test'

class test {
    constructor() {
        !fs.existsSync(root) && fs.mkdirSync(root);
        console.log(root);
        if (typeof this.rp === 'undefined') {
            console.log("Make new reference parser");
            this.rp = new ref_parser(root, refDir);
        }
        else {
            console.log("Already existing reference parser");
        }
    }

    __addReferenceModel(ref) {
        this.rp.addReferenceModel(ref);
    }
    
    __check_dir_list() {
        console.log(this.rp.dir_list);
    }

    __check_related_list() {
        console.log(this.rp.dom_related_list);
        console.log(this.rp.tax_related_list);
        console.log(this.rp.cat_related_list);
    }

    __check_related_to_filepath(related) {
        console.log(this.rp.related_to_filepath(related));
    }

    __clear() {
        fs.rmdirSync(root, { recursive: true });
    }
}

exports.test = test;

/*
var Test = new test(root, refDir);
Test.__addReferenceModel(referenceModel1);
Test.__addReferenceModel(referenceModel2);
Test.__check_related_list();

var related = [
    {
        "operation" : "UPDATE",
        "id" : "category00011",
        "type" : "category"
    },
    {
        "operation" : "UPDATE",
        "id" : "category0001",
        "type" : "category"
    },
    {
        "operation" : "UPDATE",
        "id" : "taxonomy000",
        "type" : "taxonomy"
    },
    {
        "operation" : "UPDATE",
        "id" : "domain01",
        "type" : "domain"
    }
];

Test.__check_related_to_filepath(related);
*/