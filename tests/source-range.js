'use strict';
// Source slices fail explicitly when implementation anchors move or disappear.
module.exports=function sourceRange(source,start,end){
 const first=source.indexOf(start),last=source.indexOf(end,Math.max(first+start.length,0));
 if(first<0||last<0||last<=first)throw Error('Source range anchors missing or out of order: '+start+' / '+end);
 return source.slice(first,last);
};
