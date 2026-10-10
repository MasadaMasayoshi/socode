'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cases = [
  ['pneumonia','relation-map/aspiration_pneumonia.txt'],
  ['colon-postoperative','relation-map/colon_cancer_postop_long.txt'],
  ['heart-failure','relation-map/heart_failure_long.txt'],
  ['stroke','relation-map/cerebral_infarction.txt'],
  ['maternity','public-cases/postpartum-record.txt'],
  ['child-asthma','public-cases/asthma-record.txt'],
  ['diabetic-foot','relation-map/diabetes_education_foot_long.txt']
];
function loadPublicCases() {
  return cases.map(([id,file])=>({id,file,text:fs.readFileSync(path.join(__dirname,'fixtures',file),'utf8')}));
}
module.exports = {loadPublicCases};
