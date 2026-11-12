<?xml version="1.0" encoding="utf-8"?>
<xsl:stylesheet version="2.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ccts="urn:un:unece:uncefact:documentation:2" xmlns:clm54217="urn:un:unece:uncefact:codelist:specification:54217:2001" xmlns:clm5639="urn:un:unece:uncefact:codelist:specification:5639:1988" xmlns:clm66411="urn:un:unece:uncefact:codelist:specification:66411:2001" xmlns:clmIANAMIMEMediaType="urn:un:unece:uncefact:codelist:specification:IANAMIMEMediaType:2003" xmlns:fn="http://www.w3.org/2005/xpath-functions" xmlns:link="http://www.xbrl.org/2003/linkbase" xmlns:n1="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:qdt="urn:oasis:names:specification:ubl:schema:xsd:QualifiedDatatypes-2" xmlns:udt="urn:un:unece:uncefact:data:specification:UnqualifiedDataTypesSchemaModule:2" xmlns:xbrldi="http://xbrl.org/2006/xbrldi" xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:xdt="http://www.w3.org/2005/xpath-datatypes" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" exclude-result-prefixes="cac cbc ccts clm54217 clm5639 clm66411 clmIANAMIMEMediaType fn link n1 qdt udt xbrldi xbrli xdt xlink xs xsd xsi">
  <xsl:decimal-format name="european" decimal-separator="," grouping-separator="." NaN="" />
  <xsl:output version="4.0" method="html" indent="no" encoding="UTF-8" doctype-public="-//W3C//DTD HTML 4.01 Transitional//EN" doctype-system="http://www.w3.org/TR/html4/loose.dtd" />
  <xsl:param name="SV_OutputFormat" select="'HTML'" />
  <xsl:variable name="XML" select="/" />
  <xsl:variable name="senaryo" select="translate(//n1:Invoice/cbc:ProfileID,'abcçdefgğhıijklmnoöpqrsştuüvwxyz','ABCÇDEFGĞHIİJKLMNOÖPQRSŞTUÜVWXYZ')" />
  <xsl:variable name="PartyType" select="translate(//n1:Invoice/cac:BuyerCustomerParty/cac:Party/cac:PartyIdentification/cbc:ID/@schemeID,'abcçdefgğhıijklmnoöpqrsştuüvwxyz','ABCÇDEFGĞHIİJKLMNOÖPQRSŞTUÜVWXYZ')" />
  <xsl:template match="/">
    <html>
      <head>
        <title />
        <style type="text/css">
					body {
							background-color: #FFFFFF;
							font-family: 'Tahoma', "Times New Roman", Times, serif;
							font-size: 11px;
							color: #666666;
					}
					h1, h2 {
							padding-bottom: 3px;
							padding-top: 3px;
							margin-bottom: 5px;
							text-transform: uppercase;
							font-family: Arial, Helvetica, sans-serif;
					}
					h1 {
							font-size: 1.4em;
							text-transform:none;
					}
					h2 {
							font-size: 1em;
							color: brown;
					}
					h3 {
							font-size: 1em;
							color: #333333;
							text-align: justify;
							margin: 0;
							padding: 0;
					}
					h4 {
							font-size: 1.1em;
							font-style: bold;
							font-family: Arial, Helvetica, sans-serif;
							color: #000000;
							margin: 0;
							padding: 0;
					}
					hr {
							height:2px;
							color: #000000;
							background-color: #000000;
							border-bottom: 1px solid #000000;
					}
					p, ul, ol {
							margin-top: 1.5em;
					}
					ul, ol {
							margin-left: 3em;
					}
					blockquote {
							margin-left: 3em;
							margin-right: 3em;
							font-style: italic;
					}
					a {
							text-decoration: none;
							color: #70A300;
					}
					a:hover {
							border: none;
							color: #70A300;
					}
					#despatchTable {
							border-collapse:collapse;
							font-size:11px;
							float:right;
							border-color:gray;
					}
					#ettnTable {
							border-collapse:collapse;
							font-size:11px;
							border-color:gray;
					}
					#customerPartyTable {
							border-width: 0px;
							border-spacing:;
							border-style: inset;
							border-color: gray;
							border-collapse: collapse;
							background-color:
					}
					#customerIDTable {
							border-width: 2px;
							border-spacing:;
							border-style: inset;
							border-color: gray;
							border-collapse: collapse;
							background-color:
					}
					#customerIDTableTd {
							border-width: 2px;
							border-spacing:;
							border-style: inset;
							border-color: gray;
							border-collapse: collapse;
							background-color:
					}
					#lineTable {
							border-width:2px;
							border-spacing:;
							border-style: inset;
							border-color: black;
							border-collapse: collapse;
							background-color:;
					}
					#lineTableTd {
							border-width: 1px;
							padding: 1px;
							border-style: inset;
							border-color: black;
							background-color: white;
					}
					#lineTableTr {
							border-width: 1px;
							padding: 0px;
							border-style: inset;
							border-color: black;
							background-color: white;
							-moz-border-radius:;
					}
					#lineTableDummyTd {
							border-width: 1px;
							border-color:white;
							padding: 1px;
							border-style: inset;
							border-color: black;
							background-color: white;
					}
					#lineTableBudgetTd {
							border-width: 2px;
							border-spacing:0px;
							padding: 1px;
							border-style: inset;
							border-color: black;
							background-color: white;
							-moz-border-radius:;
					}
					#notesTable {
							border-width: 2px;
							border-spacing:;
							border-style: inset;
							border-color: black;
							border-collapse: collapse;
							background-color:
					}
					#notesTableTd {
							border-width: 0px;
							border-spacing:;
							border-style: inset;
							border-color: black;
							border-collapse: collapse;
							background-color:
					}
					table {
							border-spacing:0px;
					}
					#budgetContainerTable {
							border-width: 0px;
							border-spacing: 0px;
							border-style: inset;
							border-color: black;
							border-collapse: collapse;
							background-color:;
					}
					td {
							border-color:gray;
					}</style>
        <title>e-Arşiv Fatura Fatura</title>
        <script type="text/javascript"><![CDATA[var QRCode;!function(){function a(a){this.mode=c.MODE_8BIT_BYTE,this.data=a,this.parsedData=[];for(var b=[],d=0,e=this.data.length;e>d;d++){var f=this.data.charCodeAt(d);f>65536?(b[0]=240|(1835008&f)>>>18,b[1]=128|(258048&f)>>>12,b[2]=128|(4032&f)>>>6,b[3]=128|63&f):f>2048?(b[0]=224|(61440&f)>>>12,b[1]=128|(4032&f)>>>6,b[2]=128|63&f):f>128?(b[0]=192|(1984&f)>>>6,b[1]=128|63&f):b[0]=f,this.parsedData=this.parsedData.concat(b)}this.parsedData.length!=this.data.length&&(this.parsedData.unshift(191),this.parsedData.unshift(187),this.parsedData.unshift(239))}function b(a,b){this.typeNumber=a,this.errorCorrectLevel=b,this.modules=null,this.moduleCount=0,this.dataCache=null,this.dataList=[]}function i(a,b){if(void 0==a.length)throw new Error(a.length+"/"+b);for(var c=0;c<a.length&&0==a[c];)c++;this.num=new Array(a.length-c+b);for(var d=0;d<a.length-c;d++)this.num[d]=a[d+c]}function j(a,b){this.totalCount=a,this.dataCount=b}function k(){this.buffer=[],this.length=0}function m(){return"undefined"!=typeof CanvasRenderingContext2D}function n(){var a=!1,b=navigator.userAgent;return/android/i.test(b)&&(a=!0,aMat=b.toString().match(/android ([0-9]\.[0-9])/i),aMat&&aMat[1]&&(a=parseFloat(aMat[1]))),a}function r(a,b){for(var c=1,e=s(a),f=0,g=l.length;g>=f;f++){var h=0;switch(b){case d.L:h=l[f][0];break;case d.M:h=l[f][1];break;case d.Q:h=l[f][2];break;case d.H:h=l[f][3]}if(h>=e)break;c++}if(c>l.length)throw new Error("Too long data");return c}function s(a){var b=encodeURI(a).toString().replace(/\%[0-9a-fA-F]{2}/g,"a");return b.length+(b.length!=a?3:0)}a.prototype={getLength:function(){return this.parsedData.length},write:function(a){for(var b=0,c=this.parsedData.length;c>b;b++)a.put(this.parsedData[b],8)}},b.prototype={addData:function(b){var c=new a(b);this.dataList.push(c),this.dataCache=null},isDark:function(a,b){if(0>a||this.moduleCount<=a||0>b||this.moduleCount<=b)throw new Error(a+","+b);return this.modules[a][b]},getModuleCount:function(){return this.moduleCount},make:function(){this.makeImpl(!1,this.getBestMaskPattern())},makeImpl:function(a,c){this.moduleCount=4*this.typeNumber+17,this.modules=new Array(this.moduleCount);for(var d=0;d<this.moduleCount;d++){this.modules[d]=new Array(this.moduleCount);for(var e=0;e<this.moduleCount;e++)this.modules[d][e]=null}this.setupPositionProbePattern(0,0),this.setupPositionProbePattern(this.moduleCount-7,0),this.setupPositionProbePattern(0,this.moduleCount-7),this.setupPositionAdjustPattern(),this.setupTimingPattern(),this.setupTypeInfo(a,c),this.typeNumber>=7&&this.setupTypeNumber(a),null==this.dataCache&&(this.dataCache=b.createData(this.typeNumber,this.errorCorrectLevel,this.dataList)),this.mapData(this.dataCache,c)},setupPositionProbePattern:function(a,b){for(var c=-1;7>=c;c++)if(!(-1>=a+c||this.moduleCount<=a+c))for(var d=-1;7>=d;d++)-1>=b+d||this.moduleCount<=b+d||(this.modules[a+c][b+d]=c>=0&&6>=c&&(0==d||6==d)||d>=0&&6>=d&&(0==c||6==c)||c>=2&&4>=c&&d>=2&&4>=d?!0:!1)},getBestMaskPattern:function(){for(var a=0,b=0,c=0;8>c;c++){this.makeImpl(!0,c);var d=f.getLostPoint(this);(0==c||a>d)&&(a=d,b=c)}return b},createMovieClip:function(a,b,c){var d=a.createEmptyMovieClip(b,c),e=1;this.make();for(var f=0;f<this.modules.length;f++)for(var g=f*e,h=0;h<this.modules[f].length;h++){var i=h*e,j=this.modules[f][h];j&&(d.beginFill(0,100),d.moveTo(i,g),d.lineTo(i+e,g),d.lineTo(i+e,g+e),d.lineTo(i,g+e),d.endFill())}return d},setupTimingPattern:function(){for(var a=8;a<this.moduleCount-8;a++)null==this.modules[a][6]&&(this.modules[a][6]=0==a%2);for(var b=8;b<this.moduleCount-8;b++)null==this.modules[6][b]&&(this.modules[6][b]=0==b%2)},setupPositionAdjustPattern:function(){for(var a=f.getPatternPosition(this.typeNumber),b=0;b<a.length;b++)for(var c=0;c<a.length;c++){var d=a[b],e=a[c];if(null==this.modules[d][e])for(var g=-2;2>=g;g++)for(var h=-2;2>=h;h++)this.modules[d+g][e+h]=-2==g||2==g||-2==h||2==h||0==g&&0==h?!0:!1}},setupTypeNumber:function(a){for(var b=f.getBCHTypeNumber(this.typeNumber),c=0;18>c;c++){var d=!a&&1==(1&b>>c);this.modules[Math.floor(c/3)][c%3+this.moduleCount-8-3]=d}for(var c=0;18>c;c++){var d=!a&&1==(1&b>>c);this.modules[c%3+this.moduleCount-8-3][Math.floor(c/3)]=d}},setupTypeInfo:function(a,b){for(var c=this.errorCorrectLevel<<3|b,d=f.getBCHTypeInfo(c),e=0;15>e;e++){var g=!a&&1==(1&d>>e);6>e?this.modules[e][8]=g:8>e?this.modules[e+1][8]=g:this.modules[this.moduleCount-15+e][8]=g}for(var e=0;15>e;e++){var g=!a&&1==(1&d>>e);8>e?this.modules[8][this.moduleCount-e-1]=g:9>e?this.modules[8][15-e-1+1]=g:this.modules[8][15-e-1]=g}this.modules[this.moduleCount-8][8]=!a},mapData:function(a,b){for(var c=-1,d=this.moduleCount-1,e=7,g=0,h=this.moduleCount-1;h>0;h-=2)for(6==h&&h--;;){for(var i=0;2>i;i++)if(null==this.modules[d][h-i]){var j=!1;g<a.length&&(j=1==(1&a[g]>>>e));var k=f.getMask(b,d,h-i);k&&(j=!j),this.modules[d][h-i]=j,e--,-1==e&&(g++,e=7)}if(d+=c,0>d||this.moduleCount<=d){d-=c,c=-c;break}}}},b.PAD0=236,b.PAD1=17,b.createData=function(a,c,d){for(var e=j.getRSBlocks(a,c),g=new k,h=0;h<d.length;h++){var i=d[h];g.put(i.mode,4),g.put(i.getLength(),f.getLengthInBits(i.mode,a)),i.write(g)}for(var l=0,h=0;h<e.length;h++)l+=e[h].dataCount;if(g.getLengthInBits()>8*l)throw new Error("code length overflow. ("+g.getLengthInBits()+">"+8*l+")");for(g.getLengthInBits()+4<=8*l&&g.put(0,4);0!=g.getLengthInBits()%8;)g.putBit(!1);for(;;){if(g.getLengthInBits()>=8*l)break;if(g.put(b.PAD0,8),g.getLengthInBits()>=8*l)break;g.put(b.PAD1,8)}return b.createBytes(g,e)},b.createBytes=function(a,b){for(var c=0,d=0,e=0,g=new Array(b.length),h=new Array(b.length),j=0;j<b.length;j++){var k=b[j].dataCount,l=b[j].totalCount-k;d=Math.max(d,k),e=Math.max(e,l),g[j]=new Array(k);for(var m=0;m<g[j].length;m++)g[j][m]=255&a.buffer[m+c];c+=k;var n=f.getErrorCorrectPolynomial(l),o=new i(g[j],n.getLength()-1),p=o.mod(n);h[j]=new Array(n.getLength()-1);for(var m=0;m<h[j].length;m++){var q=m+p.getLength()-h[j].length;h[j][m]=q>=0?p.get(q):0}}for(var r=0,m=0;m<b.length;m++)r+=b[m].totalCount;for(var s=new Array(r),t=0,m=0;d>m;m++)for(var j=0;j<b.length;j++)m<g[j].length&&(s[t++]=g[j][m]);for(var m=0;e>m;m++)for(var j=0;j<b.length;j++)m<h[j].length&&(s[t++]=h[j][m]);return s};for(var c={MODE_NUMBER:1,MODE_ALPHA_NUM:2,MODE_8BIT_BYTE:4,MODE_KANJI:8},d={L:1,M:0,Q:3,H:2},e={PATTERN000:0,PATTERN001:1,PATTERN010:2,PATTERN011:3,PATTERN100:4,PATTERN101:5,PATTERN110:6,PATTERN111:7},f={PATTERN_POSITION_TABLE:[[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],[6,30,56,82],[6,30,58,86],[6,34,62,90],[6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],[6,28,54,80,106],[6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],[6,26,50,74,98,122],[6,30,54,78,102,126],[6,26,52,78,104,130],[6,30,56,82,108,134],[6,34,60,86,112,138],[6,30,58,86,114,142],[6,34,62,90,118,146],[6,30,54,78,102,126,150],[6,24,50,76,102,128,154],[6,28,54,80,106,132,158],[6,32,58,84,110,136,162],[6,26,54,82,110,138,166],[6,30,58,86,114,142,170]],G15:1335,G18:7973,G15_MASK:21522,getBCHTypeInfo:function(a){for(var b=a<<10;f.getBCHDigit(b)-f.getBCHDigit(f.G15)>=0;)b^=f.G15<<f.getBCHDigit(b)-f.getBCHDigit(f.G15);return(a<<10|b)^f.G15_MASK},getBCHTypeNumber:function(a){for(var b=a<<12;f.getBCHDigit(b)-f.getBCHDigit(f.G18)>=0;)b^=f.G18<<f.getBCHDigit(b)-f.getBCHDigit(f.G18);return a<<12|b},getBCHDigit:function(a){for(var b=0;0!=a;)b++,a>>>=1;return b},getPatternPosition:function(a){return f.PATTERN_POSITION_TABLE[a-1]},getMask:function(a,b,c){switch(a){case e.PATTERN000:return 0==(b+c)%2;case e.PATTERN001:return 0==b%2;case e.PATTERN010:return 0==c%3;case e.PATTERN011:return 0==(b+c)%3;case e.PATTERN100:return 0==(Math.floor(b/2)+Math.floor(c/3))%2;case e.PATTERN101:return 0==b*c%2+b*c%3;case e.PATTERN110:return 0==(b*c%2+b*c%3)%2;case e.PATTERN111:return 0==(b*c%3+(b+c)%2)%2;default:throw new Error("bad maskPattern:"+a)}},getErrorCorrectPolynomial:function(a){for(var b=new i([1],0),c=0;a>c;c++)b=b.multiply(new i([1,g.gexp(c)],0));return b},getLengthInBits:function(a,b){if(b>=1&&10>b)switch(a){case c.MODE_NUMBER:return 10;case c.MODE_ALPHA_NUM:return 9;case c.MODE_8BIT_BYTE:return 8;case c.MODE_KANJI:return 8;default:throw new Error("mode:"+a)}else if(27>b)switch(a){case c.MODE_NUMBER:return 12;case c.MODE_ALPHA_NUM:return 11;case c.MODE_8BIT_BYTE:return 16;case c.MODE_KANJI:return 10;default:throw new Error("mode:"+a)}else{if(!(41>b))throw new Error("type:"+b);switch(a){case c.MODE_NUMBER:return 14;case c.MODE_ALPHA_NUM:return 13;case c.MODE_8BIT_BYTE:return 16;case c.MODE_KANJI:return 12;default:throw new Error("mode:"+a)}}},getLostPoint:function(a){for(var b=a.getModuleCount(),c=0,d=0;b>d;d++)for(var e=0;b>e;e++){for(var f=0,g=a.isDark(d,e),h=-1;1>=h;h++)if(!(0>d+h||d+h>=b))for(var i=-1;1>=i;i++)0>e+i||e+i>=b||(0!=h||0!=i)&&g==a.isDark(d+h,e+i)&&f++;f>5&&(c+=3+f-5)}for(var d=0;b-1>d;d++)for(var e=0;b-1>e;e++){var j=0;a.isDark(d,e)&&j++,a.isDark(d+1,e)&&j++,a.isDark(d,e+1)&&j++,a.isDark(d+1,e+1)&&j++,(0==j||4==j)&&(c+=3)}for(var d=0;b>d;d++)for(var e=0;b-6>e;e++)a.isDark(d,e)&&!a.isDark(d,e+1)&&a.isDark(d,e+2)&&a.isDark(d,e+3)&&a.isDark(d,e+4)&&!a.isDark(d,e+5)&&a.isDark(d,e+6)&&(c+=40);for(var e=0;b>e;e++)for(var d=0;b-6>d;d++)a.isDark(d,e)&&!a.isDark(d+1,e)&&a.isDark(d+2,e)&&a.isDark(d+3,e)&&a.isDark(d+4,e)&&!a.isDark(d+5,e)&&a.isDark(d+6,e)&&(c+=40);for(var k=0,e=0;b>e;e++)for(var d=0;b>d;d++)a.isDark(d,e)&&k++;var l=Math.abs(100*k/b/b-50)/5;return c+=10*l}},g={glog:function(a){if(1>a)throw new Error("glog("+a+")");return g.LOG_TABLE[a]},gexp:function(a){for(;0>a;)a+=255;for(;a>=256;)a-=255;return g.EXP_TABLE[a]},EXP_TABLE:new Array(256),LOG_TABLE:new Array(256)},h=0;8>h;h++)g.EXP_TABLE[h]=1<<h;for(var h=8;256>h;h++)g.EXP_TABLE[h]=g.EXP_TABLE[h-4]^g.EXP_TABLE[h-5]^g.EXP_TABLE[h-6]^g.EXP_TABLE[h-8];for(var h=0;255>h;h++)g.LOG_TABLE[g.EXP_TABLE[h]]=h;i.prototype={get:function(a){return this.num[a]},getLength:function(){return this.num.length},multiply:function(a){for(var b=new Array(this.getLength()+a.getLength()-1),c=0;c<this.getLength();c++)for(var d=0;d<a.getLength();d++)b[c+d]^=g.gexp(g.glog(this.get(c))+g.glog(a.get(d)));return new i(b,0)},mod:function(a){if(this.getLength()-a.getLength()<0)return this;for(var b=g.glog(this.get(0))-g.glog(a.get(0)),c=new Array(this.getLength()),d=0;d<this.getLength();d++)c[d]=this.get(d);for(var d=0;d<a.getLength();d++)c[d]^=g.gexp(g.glog(a.get(d))+b);return new i(c,0).mod(a)}},j.RS_BLOCK_TABLE=[[1,26,19],[1,26,16],[1,26,13],[1,26,9],[1,44,34],[1,44,28],[1,44,22],[1,44,16],[1,70,55],[1,70,44],[2,35,17],[2,35,13],[1,100,80],[2,50,32],[2,50,24],[4,25,9],[1,134,108],[2,67,43],[2,33,15,2,34,16],[2,33,11,2,34,12],[2,86,68],[4,43,27],[4,43,19],[4,43,15],[2,98,78],[4,49,31],[2,32,14,4,33,15],[4,39,13,1,40,14],[2,121,97],[2,60,38,2,61,39],[4,40,18,2,41,19],[4,40,14,2,41,15],[2,146,116],[3,58,36,2,59,37],[4,36,16,4,37,17],[4,36,12,4,37,13],[2,86,68,2,87,69],[4,69,43,1,70,44],[6,43,19,2,44,20],[6,43,15,2,44,16],[4,101,81],[1,80,50,4,81,51],[4,50,22,4,51,23],[3,36,12,8,37,13],[2,116,92,2,117,93],[6,58,36,2,59,37],[4,46,20,6,47,21],[7,42,14,4,43,15],[4,133,107],[8,59,37,1,60,38],[8,44,20,4,45,21],[12,33,11,4,34,12],[3,145,115,1,146,116],[4,64,40,5,65,41],[11,36,16,5,37,17],[11,36,12,5,37,13],[5,109,87,1,110,88],[5,65,41,5,66,42],[5,54,24,7,55,25],[11,36,12],[5,122,98,1,123,99],[7,73,45,3,74,46],[15,43,19,2,44,20],[3,45,15,13,46,16],[1,135,107,5,136,108],[10,74,46,1,75,47],[1,50,22,15,51,23],[2,42,14,17,43,15],[5,150,120,1,151,121],[9,69,43,4,70,44],[17,50,22,1,51,23],[2,42,14,19,43,15],[3,141,113,4,142,114],[3,70,44,11,71,45],[17,47,21,4,48,22],[9,39,13,16,40,14],[3,135,107,5,136,108],[3,67,41,13,68,42],[15,54,24,5,55,25],[15,43,15,10,44,16],[4,144,116,4,145,117],[17,68,42],[17,50,22,6,51,23],[19,46,16,6,47,17],[2,139,111,7,140,112],[17,74,46],[7,54,24,16,55,25],[34,37,13],[4,151,121,5,152,122],[4,75,47,14,76,48],[11,54,24,14,55,25],[16,45,15,14,46,16],[6,147,117,4,148,118],[6,73,45,14,74,46],[11,54,24,16,55,25],[30,46,16,2,47,17],[8,132,106,4,133,107],[8,75,47,13,76,48],[7,54,24,22,55,25],[22,45,15,13,46,16],[10,142,114,2,143,115],[19,74,46,4,75,47],[28,50,22,6,51,23],[33,46,16,4,47,17],[8,152,122,4,153,123],[22,73,45,3,74,46],[8,53,23,26,54,24],[12,45,15,28,46,16],[3,147,117,10,148,118],[3,73,45,23,74,46],[4,54,24,31,55,25],[11,45,15,31,46,16],[7,146,116,7,147,117],[21,73,45,7,74,46],[1,53,23,37,54,24],[19,45,15,26,46,16],[5,145,115,10,146,116],[19,75,47,10,76,48],[15,54,24,25,55,25],[23,45,15,25,46,16],[13,145,115,3,146,116],[2,74,46,29,75,47],[42,54,24,1,55,25],[23,45,15,28,46,16],[17,145,115],[10,74,46,23,75,47],[10,54,24,35,55,25],[19,45,15,35,46,16],[17,145,115,1,146,116],[14,74,46,21,75,47],[29,54,24,19,55,25],[11,45,15,46,46,16],[13,145,115,6,146,116],[14,74,46,23,75,47],[44,54,24,7,55,25],[59,46,16,1,47,17],[12,151,121,7,152,122],[12,75,47,26,76,48],[39,54,24,14,55,25],[22,45,15,41,46,16],[6,151,121,14,152,122],[6,75,47,34,76,48],[46,54,24,10,55,25],[2,45,15,64,46,16],[17,152,122,4,153,123],[29,74,46,14,75,47],[49,54,24,10,55,25],[24,45,15,46,46,16],[4,152,122,18,153,123],[13,74,46,32,75,47],[48,54,24,14,55,25],[42,45,15,32,46,16],[20,147,117,4,148,118],[40,75,47,7,76,48],[43,54,24,22,55,25],[10,45,15,67,46,16],[19,148,118,6,149,119],[18,75,47,31,76,48],[34,54,24,34,55,25],[20,45,15,61,46,16]],j.getRSBlocks=function(a,b){var c=j.getRsBlockTable(a,b);if(void 0==c)throw new Error("bad rs block @ typeNumber:"+a+"/errorCorrectLevel:"+b);for(var d=c.length/3,e=[],f=0;d>f;f++)for(var g=c[3*f+0],h=c[3*f+1],i=c[3*f+2],k=0;g>k;k++)e.push(new j(h,i));return e},j.getRsBlockTable=function(a,b){switch(b){case d.L:return j.RS_BLOCK_TABLE[4*(a-1)+0];case d.M:return j.RS_BLOCK_TABLE[4*(a-1)+1];case d.Q:return j.RS_BLOCK_TABLE[4*(a-1)+2];case d.H:return j.RS_BLOCK_TABLE[4*(a-1)+3];default:return void 0}},k.prototype={get:function(a){var b=Math.floor(a/8);return 1==(1&this.buffer[b]>>>7-a%8)},put:function(a,b){for(var c=0;b>c;c++)this.putBit(1==(1&a>>>b-c-1))},getLengthInBits:function(){return this.length},putBit:function(a){var b=Math.floor(this.length/8);this.buffer.length<=b&&this.buffer.push(0),a&&(this.buffer[b]|=128>>>this.length%8),this.length++}};var l=[[17,14,11,7],[32,26,20,14],[53,42,32,24],[78,62,46,34],[106,84,60,44],[134,106,74,58],[154,122,86,64],[192,152,108,84],[230,180,130,98],[271,213,151,119],[321,251,177,137],[367,287,203,155],[425,331,241,177],[458,362,258,194],[520,412,292,220],[586,450,322,250],[644,504,364,280],[718,560,394,310],[792,624,442,338],[858,666,482,382],[929,711,509,403],[1003,779,565,439],[1091,857,611,461],[1171,911,661,511],[1273,997,715,535],[1367,1059,751,593],[1465,1125,805,625],[1528,1190,868,658],[1628,1264,908,698],[1732,1370,982,742],[1840,1452,1030,790],[1952,1538,1112,842],[2068,1628,1168,898],[2188,1722,1228,958],[2303,1809,1283,983],[2431,1911,1351,1051],[2563,1989,1423,1093],[2699,2099,1499,1139],[2809,2213,1579,1219],[2953,2331,1663,1273]],o=function(){var a=function(a,b){this._el=a,this._htOption=b};return a.prototype.draw=function(a){function g(a,b){var c=document.createElementNS("http://www.w3.org/2000/svg",a);for(var d in b)b.hasOwnProperty(d)&&c.setAttribute(d,b[d]);return c}var b=this._htOption,c=this._el,d=a.getModuleCount();Math.floor(b.width/d),Math.floor(b.height/d),this.clear();var h=g("svg",{viewBox:"0 0 "+String(d)+" "+String(d),width:"100%",height:"100%",fill:b.colorLight});h.setAttributeNS("http://www.w3.org/2000/xmlns/","xmlns:xlink","http://www.w3.org/1999/xlink"),c.appendChild(h),h.appendChild(g("rect",{fill:b.colorDark,width:"1",height:"1",id:"template"}));for(var i=0;d>i;i++)for(var j=0;d>j;j++)if(a.isDark(i,j)){var k=g("use",{x:String(i),y:String(j)});k.setAttributeNS("http://www.w3.org/1999/xlink","href","#template"),h.appendChild(k)}},a.prototype.clear=function(){for(;this._el.hasChildNodes();)this._el.removeChild(this._el.lastChild)},a}(),p="svg"===document.documentElement.tagName.toLowerCase(),q=p?o:m()?function(){function a(){this._elImage.src=this._elCanvas.toDataURL("image/png"),this._elImage.style.display="block",this._elCanvas.style.display="none"}function d(a,b){var c=this;if(c._fFail=b,c._fSuccess=a,null===c._bSupportDataURI){var d=document.createElement("img"),e=function(){c._bSupportDataURI=!1,c._fFail&&_fFail.call(c)},f=function(){c._bSupportDataURI=!0,c._fSuccess&&c._fSuccess.call(c)};return d.onabort=e,d.onerror=e,d.onload=f,d.src="data:image/gif;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==",void 0}c._bSupportDataURI===!0&&c._fSuccess?c._fSuccess.call(c):c._bSupportDataURI===!1&&c._fFail&&c._fFail.call(c)}if(this._android&&this._android<=2.1){var b=1/window.devicePixelRatio,c=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(a,d,e,f,g,h,i,j){if("nodeName"in a&&/img/i.test(a.nodeName))for(var l=arguments.length-1;l>=1;l--)arguments[l]=arguments[l]*b;else"undefined"==typeof j&&(arguments[1]*=b,arguments[2]*=b,arguments[3]*=b,arguments[4]*=b);c.apply(this,arguments)}}var e=function(a,b){this._bIsPainted=!1,this._android=n(),this._htOption=b,this._elCanvas=document.createElement("canvas"),this._elCanvas.width=b.width,this._elCanvas.height=b.height,a.appendChild(this._elCanvas),this._el=a,this._oContext=this._elCanvas.getContext("2d"),this._bIsPainted=!1,this._elImage=document.createElement("img"),this._elImage.style.display="none",this._el.appendChild(this._elImage),this._bSupportDataURI=null};return e.prototype.draw=function(a){var b=this._elImage,c=this._oContext,d=this._htOption,e=a.getModuleCount(),f=d.width/e,g=d.height/e,h=Math.round(f),i=Math.round(g);b.style.display="none",this.clear();for(var j=0;e>j;j++)for(var k=0;e>k;k++){var l=a.isDark(j,k),m=k*f,n=j*g;c.strokeStyle=l?d.colorDark:d.colorLight,c.lineWidth=1,c.fillStyle=l?d.colorDark:d.colorLight,c.fillRect(m,n,f,g),c.strokeRect(Math.floor(m)+.5,Math.floor(n)+.5,h,i),c.strokeRect(Math.ceil(m)-.5,Math.ceil(n)-.5,h,i)}this._bIsPainted=!0},e.prototype.makeImage=function(){this._bIsPainted&&d.call(this,a)},e.prototype.isPainted=function(){return this._bIsPainted},e.prototype.clear=function(){this._oContext.clearRect(0,0,this._elCanvas.width,this._elCanvas.height),this._bIsPainted=!1},e.prototype.round=function(a){return a?Math.floor(1e3*a)/1e3:a},e}():function(){var a=function(a,b){this._el=a,this._htOption=b};return a.prototype.draw=function(a){for(var b=this._htOption,c=this._el,d=a.getModuleCount(),e=Math.floor(b.width/d),f=Math.floor(b.height/d),g=['<table style="border:0;border-collapse:collapse;">'],h=0;d>h;h++){g.push("<tr>");for(var i=0;d>i;i++)g.push('<td style="border:0;border-collapse:collapse;padding:0;margin:0;width:'+e+"px;height:"+f+"px;background-color:"+(a.isDark(h,i)?b.colorDark:b.colorLight)+';"></td>');g.push("</tr>")}g.push("</table>"),c.innerHTML=g.join("");var j=c.childNodes[0],k=(b.width-j.offsetWidth)/2,l=(b.height-j.offsetHeight)/2;k>0&&l>0&&(j.style.margin=l+"px "+k+"px")},a.prototype.clear=function(){this._el.innerHTML=""},a}();QRCode=function(a,b){if(this._htOption={width:256,height:256,typeNumber:4,colorDark:"#000000",colorLight:"#ffffff",correctLevel:d.H},"string"==typeof b&&(b={text:b}),b)for(var c in b)this._htOption[c]=b[c];"string"==typeof a&&(a=document.getElementById(a)),this._android=n(),this._el=a,this._oQRCode=null,this._oDrawing=new q(this._el,this._htOption),this._htOption.text&&this.makeCode(this._htOption.text)},QRCode.prototype.makeCode=function(a){this._oQRCode=new b(r(a,this._htOption.correctLevel),this._htOption.correctLevel),this._oQRCode.addData(a),this._oQRCode.make(),this._el.title=a,this._oDrawing.draw(this._oQRCode),this.makeImage()},QRCode.prototype.makeImage=function(){"function"==typeof this._oDrawing.makeImage&&(!this._android||this._android>=3)&&this._oDrawing.makeImage()},QRCode.prototype.clear=function(){this._oDrawing.clear()},QRCode.CorrectLevel=d}();]]></script>
      </head>
      <body style="margin-left=0.6in; margin-right=0.6in; margin-top=0.79in; margin-bottom=0.79in">
        <xsl:for-each select="$XML">
          <table style="border-color:blue; " border="0" cellspacing="0px" width="800" cellpadding="0px">
            <tbody>
              <tr valign="top">
                <td width="40%">
                  <br />
                  <table align="center" border="0" width="100%">
                    <tbody>
                      <hr />
                      <tr align="left">
                        <xsl:for-each select="n1:Invoice">
                          <xsl:for-each select="cac:AccountingSupplierParty">
                            <xsl:for-each select="cac:Party">
                              <td align="left">
                                <xsl:if test="cac:PartyName">
                                  <xsl:value-of select="cac:PartyName/cbc:Name" />
                                  <br />
                                </xsl:if>
                                <xsl:for-each select="cac:Person">
                                  <xsl:for-each select="cbc:Title">
                                    <xsl:apply-templates />
                                    <span>
                                      <xsl:text> </xsl:text>
                                    </span>
                                  </xsl:for-each>
                                  <xsl:for-each select="cbc:FirstName">
                                    <xsl:apply-templates />
                                    <span>
                                      <xsl:text> </xsl:text>
                                    </span>
                                  </xsl:for-each>
                                  <xsl:for-each select="cbc:MiddleName">
                                    <xsl:apply-templates />
                                    <span>
                                      <xsl:text> </xsl:text>
                                    </span>
                                  </xsl:for-each>
                                  <xsl:for-each select="cbc:FamilyName">
                                    <xsl:apply-templates />
                                    <span>
                                      <xsl:text> </xsl:text>
                                    </span>
                                  </xsl:for-each>
                                  <xsl:for-each select="cbc:NameSuffix">
                                    <xsl:apply-templates />
                                  </xsl:for-each>
                                </xsl:for-each>
                              </td>
                            </xsl:for-each>
                          </xsl:for-each>
                        </xsl:for-each>
                      </tr>
                      <tr align="left">
                        <xsl:for-each select="n1:Invoice">
                          <xsl:for-each select="cac:AccountingSupplierParty">
                            <xsl:for-each select="cac:Party">
                              <td align="left">
                                <xsl:for-each select="cac:PostalAddress">
                                  <xsl:for-each select="cbc:StreetName">
                                    <xsl:apply-templates />
                                    <span>
                                      <xsl:text> </xsl:text>
                                    </span>
                                  </xsl:for-each>
                                  <xsl:for-each select="cbc:BuildingName">
                                    <xsl:apply-templates />
                                  </xsl:for-each>
                                  <xsl:if test="cbc:BuildingNumber">
                                    <span>
                                      <xsl:text> No:</xsl:text>
                                    </span>
                                    <xsl:for-each select="cbc:BuildingNumber">
                                      <xsl:apply-templates />
                                    </xsl:for-each>
                                    <span>
                                      <xsl:text> </xsl:text>
                                    </span>
                                  </xsl:if>
                                  <br />
                                  <xsl:for-each select="cbc:PostalZone">
                                    <xsl:apply-templates />
                                    <span>
                                      <xsl:text> </xsl:text>
                                    </span>
                                  </xsl:for-each>
                                  <xsl:for-each select="cbc:CitySubdivisionName">
                                    <xsl:apply-templates />
                                  </xsl:for-each>
                                  <span>
                                    <xsl:text>/ </xsl:text>
                                  </span>
                                  <xsl:for-each select="cbc:CityName">
                                    <xsl:apply-templates />
                                    <span>
                                      <xsl:text> </xsl:text>
                                    </span>
                                  </xsl:for-each>
                                </xsl:for-each>
                              </td>
                            </xsl:for-each>
                          </xsl:for-each>
                        </xsl:for-each>
                      </tr>
                      <xsl:if test="//n1:Invoice/cac:AccountingSupplierParty/cac:Party/cac:Contact/cbc:Telephone or //n1:Invoice/cac:AccountingSupplierParty/cac:Party/cac:Contact/cbc:Telefax">
                        <tr align="left">
                          <xsl:for-each select="n1:Invoice">
                            <xsl:for-each select="cac:AccountingSupplierParty">
                              <xsl:for-each select="cac:Party">
                                <td align="left">
                                  <xsl:for-each select="cac:Contact">
                                    <xsl:if test="cbc:Telephone">
                                      <span>
                                        <xsl:text>Tel: </xsl:text>
                                      </span>
                                      <xsl:for-each select="cbc:Telephone">
                                        <xsl:apply-templates />
                                      </xsl:for-each>
                                    </xsl:if>
                                    <xsl:if test="cbc:Telefax">
                                      <span>
                                        <xsl:text> Fax: </xsl:text>
                                      </span>
                                      <xsl:for-each select="cbc:Telefax">
                                        <xsl:apply-templates />
                                      </xsl:for-each>
                                    </xsl:if>
                                    <span>
                                      <xsl:text> </xsl:text>
                                    </span>
                                  </xsl:for-each>
                                </td>
                              </xsl:for-each>
                            </xsl:for-each>
                          </xsl:for-each>
                        </tr>
                      </xsl:if>
                      <xsl:for-each select="//n1:Invoice/cac:AccountingSupplierParty/cac:Party/cbc:WebsiteURI">
                        <tr align="left">
                          <td>
                            <xsl:text>Web Sitesi: www.expertbilisim.com.tr </xsl:text>
                            <xsl:value-of select="." />
                          </td>
                        </tr>
                      </xsl:for-each>
                      <xsl:for-each select="//n1:Invoice/cac:AccountingSupplierParty/cac:Party/cac:Contact/cbc:ElectronicMail">
                        <tr align="left">
                          <td>
                            <xsl:text>E-Posta: </xsl:text>
                            <xsl:value-of select="." />
                          </td>
                        </tr>
                      </xsl:for-each>
                      <tr align="left">
                        <xsl:for-each select="n1:Invoice">
                          <xsl:for-each select="cac:AccountingSupplierParty">
                            <xsl:for-each select="cac:Party">
                              <td align="left">
                                <span>
                                  <xsl:text>Vergi Dairesi: </xsl:text>
                                </span>
                                <xsl:for-each select="cac:PartyTaxScheme">
                                  <xsl:for-each select="cac:TaxScheme">
                                    <xsl:for-each select="cbc:Name">
                                      <xsl:apply-templates />
                                    </xsl:for-each>
                                  </xsl:for-each>
                                  <span>
                                    <xsl:text>  </xsl:text>
                                  </span>
                                </xsl:for-each>
                              </td>
                            </xsl:for-each>
                          </xsl:for-each>
                        </xsl:for-each>
                      </tr>
                      <xsl:for-each select="//n1:Invoice/cac:AccountingSupplierParty/cac:Party/cac:PartyIdentification">
                        <tr align="left">
                          <td>
                            <xsl:value-of select="cbc:ID/@schemeID" />
                            <xsl:text>: </xsl:text>
                            <xsl:value-of select="cbc:ID" />
                          </td>
                        </tr>
                      </xsl:for-each>
                      <xsl:if test="$PartyType!='TAXFREE' and $PartyType!='EXPORT'">
                        <xsl:for-each select="cac:PartyTaxScheme/cac:TaxScheme/cbc:Name">
                          <xsl:if test=". !=''">
                            <tr align="left">
                              <td>
                                <xsl:text>Vergi Dairesi: </xsl:text>
                                <xsl:apply-templates />
                              </td>
                            </tr>
                          </xsl:if>
                        </xsl:for-each>
                      </xsl:if>
                    </tbody>
                  </table>
                  <hr />
                </td>
                <td width="20%" align="center" valign="middle">
                  <br />
                  <br />
                  <img style="width:91px;" align="middle" alt="e-Arşiv Fatura Logo" src="data:image/jpeg;base64,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" />
                  <h1 align="center">
                    <span style="font-weight:bold; ">
                      <xsl:text>e-Arşiv Fatura</xsl:text>
                    </span>
                  </h1>
<img src="data:image/jpeg;base64,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"/>
                </td>
                <td width="40%">
                  <div id="qrcode" align="right" />
                  <div id="qrvalue" style="visibility: hidden; height: 20px;width: 20px; ; display:none">
{
"vkntckn":"<xsl:value-of select="n1:Invoice/cac:AccountingSupplierParty/cac:Party/cac:PartyIdentification/cbc:ID[@schemeID='TCKN' or @schemeID='VKN']" />",
"avkntckn":"<xsl:value-of select="n1:Invoice/cac:AccountingCustomerParty/cac:Party/cac:PartyIdentification/cbc:ID[@schemeID='TCKN' or @schemeID='VKN']" />",
"senaryo":"<xsl:value-of select="n1:Invoice/cbc:ProfileID" />",
"tip":"<xsl:value-of select="n1:Invoice/cbc:InvoiceTypeCode" />",
"tarih":"<xsl:value-of select="n1:Invoice/cbc:IssueDate" />",
"no":"<xsl:value-of select="n1:Invoice/cbc:ID" />",
"ettn":"<xsl:value-of select="n1:Invoice/cbc:UUID" />",
"parabirimi":"<xsl:value-of select="n1:Invoice/cbc:DocumentCurrencyCode" />",
"malhizmettoplam":"<xsl:value-of select="n1:Invoice/cac:LegalMonetaryTotal/cbc:LineExtensionAmount" />",
<xsl:for-each select="n1:Invoice/cac:TaxTotal/cac:TaxSubtotal[cac:TaxCategory/cac:TaxScheme/cbc:TaxTypeCode = '0015']"><xsl:text>"kdvmatrah</xsl:text>(<xsl:value-of select="cbc:Percent" />)":"<xsl:value-of select="cbc:TaxableAmount" />",
</xsl:for-each><xsl:for-each select="n1:Invoice/cac:TaxTotal/cac:TaxSubtotal[cac:TaxCategory/cac:TaxScheme/cbc:TaxTypeCode = '0015']"><xsl:text>"hesaplanankdv</xsl:text>(<xsl:value-of select="cbc:Percent" />)":"<xsl:value-of select="cbc:TaxAmount" />",
</xsl:for-each>
"vergidahil":"<xsl:value-of select="n1:Invoice/cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount" />",
"odenecek":"<xsl:value-of select="n1:Invoice/cac:LegalMonetaryTotal/cbc:PayableAmount" />"
}
</div>
                  <script type="text/javascript">var qrcode = new QRCode(document.getElementById("qrcode"), { width : 135, height : 135, correctLevel : QRCode.CorrectLevel.L, }); var minifiedValues = JSON.stringify(JSON.parse(document.getElementById("qrvalue").innerHTML));qrcode.makeCode(minifiedValues)</script>
                  <span style="visibility:hidden;">burayaresimgelsin</span>
                  <img src="data:image/jpeg;base64,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"/>
                </td>
              </tr>
              <tr style="height:118px; " valign="top">
                <td width="40%" align="right" valign="bottom">
                  <table id="customerPartyTable" align="left" border="0" height="50%">
                    <tbody>
                      <tr style="height:71px; ">
                        <td>
                          <hr />
                          <table align="center" border="0">
                            <tbody>
                              <tr>
                                <xsl:for-each select="n1:Invoice">
                                  <xsl:for-each select="cac:AccountingCustomerParty">
                                    <xsl:for-each select="cac:Party">
                                      <td style="width:469px; " align="left">
                                        <span style="font-weight:bold; ">
                                          <xsl:text>SAYIN</xsl:text>
                                        </span>
                                      </td>
                                    </xsl:for-each>
                                  </xsl:for-each>
                                </xsl:for-each>
                              </tr>
                              <tr>
                                <xsl:choose>
                                  <xsl:when test="//n1:Invoice/cac:BuyerCustomerParty/cac:Party/cac:PartyIdentification/cbc:ID[@schemeID='PARTYTYPE' and text()='TAXFREE']">
                                    <xsl:for-each select="//n1:Invoice/cac:BuyerCustomerParty/cac:Party">
                                      <xsl:call-template name="Party_Title">
                                        <xsl:with-param name="PartyType">TAXFREE</xsl:with-param>
                                      </xsl:call-template>
                                    </xsl:for-each>
                                  </xsl:when>
                                  <xsl:when test="//n1:Invoice/cac:BuyerCustomerParty/cac:Party/cac:PartyIdentification/cbc:ID[@schemeID='PARTYTYPE' and text()='EXPORT']">
                                    <xsl:for-each select="//n1:Invoice/cac:BuyerCustomerParty/cac:Party">
                                      <xsl:call-template name="Party_Title">
                                        <xsl:with-param name="PartyType">EXPORT</xsl:with-param>
                                      </xsl:call-template>
                                    </xsl:for-each>
                                  </xsl:when>
                                  <xsl:otherwise>
                                    <xsl:for-each select="//n1:Invoice/cac:AccountingCustomerParty/cac:Party">
                                      <xsl:call-template name="Party_Title">
                                        <xsl:with-param name="PartyType">OTHER</xsl:with-param>
                                      </xsl:call-template>
                                    </xsl:for-each>
                                  </xsl:otherwise>
                                </xsl:choose>
                              </tr>
                              <xsl:choose>
                                <xsl:when test="//n1:Invoice/cac:BuyerCustomerParty/cac:Party/cac:PartyIdentification/cbc:ID[@schemeID='PARTYTYPE' and text()='TAXFREE']">
                                  <xsl:for-each select="//n1:Invoice/cac:BuyerCustomerParty/cac:Party">
                                    <tr>
                                      <xsl:call-template name="Party_Adress">
                                        <xsl:with-param name="PartyType">TAXFREE</xsl:with-param>
                                      </xsl:call-template>
                                    </tr>
                                    <xsl:call-template name="Party_Other">
                                      <xsl:with-param name="PartyType">TAXFREE</xsl:with-param>
                                    </xsl:call-template>
                                  </xsl:for-each>
                                </xsl:when>
                                <xsl:when test="//n1:Invoice/cac:BuyerCustomerParty/cac:Party/cac:PartyIdentification/cbc:ID[@schemeID='PARTYTYPE' and text()='EXPORT']">
                                  <xsl:for-each select="n1:Invoice/cac:BuyerCustomerParty/cac:Party">
                                    <tr>
                                      <xsl:call-template name="Party_Adress">
                                        <xsl:with-param name="PartyType">EXPORT</xsl:with-param>
                                      </xsl:call-template>
                                    </tr>
                                    <xsl:call-template name="Party_Other">
                                      <xsl:with-param name="PartyType">EXPORT</xsl:with-param>
                                    </xsl:call-template>
                                  </xsl:for-each>
                                </xsl:when>
                                <xsl:otherwise>
                                  <xsl:for-each select="//n1:Invoice/cac:AccountingCustomerParty/cac:Party">
                                    <tr>
                                      <xsl:call-template name="Party_Adress">
                                        <xsl:with-param name="PartyType">OTHER</xsl:with-param>
                                      </xsl:call-template>
                                    </tr>
                                    <xsl:call-template name="Party_Other">
                                      <xsl:with-param name="PartyType">OTHER</xsl:with-param>
                                    </xsl:call-template>
                                  </xsl:for-each>
                                </xsl:otherwise>
                              </xsl:choose>
                              <!--tr>
																<xsl:for-each select="n1:Invoice">
																	<xsl:for-each select="cac:AccountingCustomerParty">
																		<xsl:for-each select="cac:Party">
																			<td style="width:469px; " align="left">
																				<xsl:if test="cac:PartyName">
																					<xsl:value-of select="cac:PartyName/cbc:Name"/>
																					<br/>
																				</xsl:if>
																				<xsl:for-each select="cac:Person">
																					<xsl:for-each select="cbc:Title">
																						<xsl:apply-templates/>
																						<span>
																							<xsl:text>&#160;</xsl:text>
																						</span>
																					</xsl:for-each>
																					<xsl:for-each select="cbc:FirstName">
																						<xsl:apply-templates/>
																						<span>
																							<xsl:text>&#160;</xsl:text>
																						</span>
																					</xsl:for-each>
																					<xsl:for-each select="cbc:MiddleName">
																						<xsl:apply-templates/>
																						<span>
																							<xsl:text>&#160; </xsl:text>
																						</span>
																					</xsl:for-each>
																					<xsl:for-each select="cbc:FamilyName">
																						<xsl:apply-templates/>
																						<span>
																							<xsl:text>&#160;</xsl:text>
																						</span>
																					</xsl:for-each>
																					<xsl:for-each select="cbc:NameSuffix">
																						<xsl:apply-templates/>
																					</xsl:for-each>
																				</xsl:for-each>
																			</td>
																		</xsl:for-each>
																	</xsl:for-each>
																</xsl:for-each>
															</tr-->
                              <!--tr>
																<xsl:for-each select="n1:Invoice">
																	<xsl:for-each select="cac:AccountingCustomerParty">
																		<xsl:for-each select="cac:Party">
																			<td style="width:469px; " align="left">
																				<xsl:for-each select="cac:PostalAddress">
																					<xsl:for-each select="cbc:StreetName">
																						<xsl:apply-templates/>
																						<span>
																							<xsl:text>&#160;</xsl:text>
																						</span>
																					</xsl:for-each>
																					<xsl:for-each select="cbc:BuildingName">
																						<xsl:apply-templates/>
																					</xsl:for-each>
																					<xsl:for-each select="cbc:BuildingNumber">
																						<span>
																							<xsl:text> No:</xsl:text>
																						</span>
																						<xsl:apply-templates/>
																						<span>
																							<xsl:text>&#160;</xsl:text>
																						</span>
																					</xsl:for-each>
																					<br/>
																					<xsl:for-each select="cbc:Room">
																						<span>
																							<xsl:text>Kapı No:</xsl:text>
																						</span>
																						<xsl:apply-templates/>
																						<span>
																							<xsl:text>&#160;</xsl:text>
																						</span>
																					</xsl:for-each>
																					<br/>
																					<xsl:for-each select="cbc:PostalZone">
																						<xsl:apply-templates/>
																						<span>
																							<xsl:text>&#160;</xsl:text>
																						</span>
																					</xsl:for-each>
																					<xsl:for-each select="cbc:CitySubdivisionName">
																						<xsl:apply-templates/>
																						<span>
																							<xsl:text>/ </xsl:text>
																						</span>
																					</xsl:for-each>
																					<xsl:for-each select="cbc:CityName">
																						<xsl:apply-templates/>
																						<span>
																							<xsl:text>&#160;</xsl:text>
																						</span>
																					</xsl:for-each>
																				</xsl:for-each>
																			</td>
																		</xsl:for-each>
																	</xsl:for-each>
																</xsl:for-each>
															</tr-->
                              <!--xsl:for-each
												select="//n1:Invoice/cac:AccountingCustomerParty/cac:Party/cbc:WebsiteURI">
																<tr align="left">
																	<td>
																		<xsl:text>Web Sitesi: </xsl:text>
																		<xsl:value-of select="."/>
																	</td>
																</tr>
															</xsl:for-each>
															<xsl:for-each
												select="//n1:Invoice/cac:AccountingCustomerParty/cac:Party/cac:Contact/cbc:ElectronicMail">
																<tr align="left">
																	<td>
																		<xsl:text>E-Posta: </xsl:text>
																		<xsl:value-of select="."/>
																	</td>
																</tr>
															</xsl:for-each>
															<xsl:for-each select="n1:Invoice">
																<xsl:for-each select="cac:AccountingCustomerParty">
																	<xsl:for-each select="cac:Party">
																		<xsl:for-each select="cac:Contact">
																			<xsl:if test="cbc:Telephone or cbc:Telefax">
																				<tr align="left">
																					<td style="width:469px; " align="left">
																						<xsl:for-each select="cbc:Telephone">
																							<span>
																								<xsl:text>Tel: </xsl:text>
																							</span>
																							<xsl:apply-templates/>
																						</xsl:for-each>
																						<xsl:for-each select="cbc:Telefax">
																							<span>
																								<xsl:text> Fax: </xsl:text>
																							</span>
																							<xsl:apply-templates/>
																						</xsl:for-each>
																						<span>
																							<xsl:text>&#160;</xsl:text>
																						</span>
																					</td>
																				</tr>
																			</xsl:if>
																			<xsl:if
												test="//n1:Invoice/cac:AccountingCustomerParty/cac:Party/cac:PartyTaxScheme/cac:TaxScheme/cbc:Name">
																				<tr align="left">
																					<td>
																						<span>
																							<xsl:text>Vergi Dairesi: </xsl:text>
																							<xsl:value-of
												select="//n1:Invoice/cac:AccountingCustomerParty/cac:Party/cac:PartyTaxScheme/cac:TaxScheme/cbc:Name"
												/>
																						</span>
																					</td>
																				</tr>
																			</xsl:if>
																		</xsl:for-each>
																	</xsl:for-each>
																</xsl:for-each>
															</xsl:for-each>
															<xsl:for-each
												select="//n1:Invoice/cac:AccountingCustomerParty/cac:Party/cac:PartyIdentification">
																<tr align="left">
																	<td>
																		<xsl:value-of select="cbc:ID/@schemeID"/>
																		<xsl:text>: </xsl:text>
																		<xsl:value-of select="cbc:ID"/>
																	</td>
																</tr>
															</xsl:for-each-->
                            </tbody>
                          </table>
                          <hr />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <br />
                </td>
                <td style="width: 30%; text-align: center;">
                  <!-- buraya imza gelsin -->
                </td>
                <td width="60%" align="center" valign="bottom" colspan="2">
                  <table border="1" height="13" id="despatchTable">
                    <tbody>
                      <tr>
                        <td style="width:105px;" align="left">
                          <span style="font-weight:bold; ">
                            <xsl:text>Özelleştirme No:</xsl:text>
                          </span>
                        </td>
                        <td style="width:110px;" align="left">
                          <xsl:for-each select="n1:Invoice">
                            <xsl:for-each select="cbc:CustomizationID">
                              <xsl:apply-templates />
                            </xsl:for-each>
                          </xsl:for-each>
                        </td>
                      </tr>
                      <tr style="height:13px; ">
                        <td align="left">
                          <span style="font-weight:bold; ">
                            <xsl:text>Senaryo:</xsl:text>
                          </span>
                        </td>
                        <td align="left">
                          <xsl:for-each select="n1:Invoice">
                            <xsl:for-each select="cbc:ProfileID">
                              <xsl:apply-templates />
                            </xsl:for-each>
                          </xsl:for-each>
                        </td>
                      </tr>
                      <tr style="height:13px; ">
                        <td align="left">
                          <span style="font-weight:bold; ">
                            <xsl:text>Fatura Tipi:</xsl:text>
                          </span>
                        </td>
                        <td align="left">
                          <xsl:for-each select="n1:Invoice">
                            <xsl:for-each select="cbc:InvoiceTypeCode">
                              <xsl:apply-templates />
                            </xsl:for-each>
                          </xsl:for-each>
                        </td>
                      </tr>
                      <tr style="height:13px; ">
                        <td align="left">
                          <span style="font-weight:bold; ">
                            <xsl:text>Fatura No:</xsl:text>
                          </span>
                        </td>
                        <td align="left">
                          <xsl:for-each select="n1:Invoice">
                            <xsl:for-each select="cbc:ID">
                              <xsl:apply-templates />
                            </xsl:for-each>
                          </xsl:for-each>
                        </td>
                      </tr>
                      <tr style="height:13px; ">
                        <td align="left">
                          <span style="font-weight:bold; ">
                            <xsl:text>Fatura Tarihi:</xsl:text>
                          </span>
                        </td>
                        <td align="left">
                          <xsl:for-each select="n1:Invoice">
                            <xsl:for-each select="cbc:IssueDate">
                              <xsl:value-of select="substring(.,9,2)" />-<xsl:value-of select="substring(.,6,2)" />-<xsl:value-of select="substring(.,1,4)" /></xsl:for-each>
                            <xsl:for-each select="cbc:IssueTime">
                              <span style="font-weight:bold; ">
                                <xsl:text></xsl:text>
                              </span>
                              <xsl:value-of select="substring(.,1,5)" />
                            </xsl:for-each>
                          </xsl:for-each>
                        </td>
                      </tr>
                      <xsl:for-each select="n1:Invoice/cac:DespatchDocumentReference">
                        <tr style="height:13px; ">
                          <td align="left">
                            <span style="font-weight:bold; ">
                              <xsl:text>İrsaliye No:</xsl:text>
                            </span>
                            <span>
                              <xsl:text> </xsl:text>
                            </span>
                          </td>
                          <td align="left">
                            <xsl:value-of select="cbc:ID" />
                          </td>
                        </tr>
                        <tr style="height:13px; ">
                          <td align="left">
                            <span style="font-weight:bold; ">
                              <xsl:text>İrsaliye Tarihi:</xsl:text>
                            </span>
                          </td>
                          <td align="left">
                            <xsl:for-each select="cbc:IssueDate">
                              <xsl:value-of select="substring(.,9,2)" />-<xsl:value-of select="substring(.,6,2)" />-<xsl:value-of select="substring(.,1,4)" /></xsl:for-each>
                          </td>
                        </tr>
                      </xsl:for-each>
                      <xsl:if test="//n1:Invoice/cac:OrderReference">
                        <tr style="height:13px">
                          <td align="left">
                            <span style="font-weight:bold; ">
                              <xsl:text>Sipariş No:</xsl:text>
                            </span>
                          </td>
                          <td align="left">
                            <xsl:for-each select="n1:Invoice/cac:OrderReference">
                              <xsl:for-each select="cbc:ID">
                                <xsl:apply-templates />
                              </xsl:for-each>
                            </xsl:for-each>
                          </td>
                        </tr>
                      </xsl:if>
                      <xsl:if test="//n1:Invoice/cac:OrderReference/cbc:IssueDate">
                        <tr style="height:13px">
                          <td align="left">
                            <span style="font-weight:bold; ">
                              <xsl:text>Sipariş Tarihi:</xsl:text>
                            </span>
                          </td>
                          <td align="left">
                            <xsl:for-each select="n1:Invoice/cac:OrderReference">
                              <xsl:for-each select="cbc:IssueDate">
                                <xsl:value-of select="substring(.,9,2)" />-<xsl:value-of select="substring(.,6,2)" />-<xsl:value-of select="substring(.,1,4)" /></xsl:for-each>
                            </xsl:for-each>
                          </td>
                        </tr>
                      </xsl:if>
                    </tbody>
                  </table>
                </td>
              </tr>
              <tr align="left">
                <table id="ettnTable">
                  <tr style="height:13px;">
                    <td align="left" valign="top">
                      <span style="font-weight:bold; ">
                        <xsl:text>ETTN:</xsl:text>
                      </span>
                    </td>
                    <td align="left" width="240px">
                      <xsl:for-each select="n1:Invoice">
                        <xsl:for-each select="cbc:UUID">
                          <xsl:apply-templates />
                        </xsl:for-each>
                      </xsl:for-each>
                    </td>
                  </tr>
                </table>
              </tr>
            </tbody>
          </table>
          <div id="lineTableAligner">
            <span>
              <xsl:text> </xsl:text>
            </span>
          </div>
          <table border="1" id="lineTable" width="800">
            <tbody>
              <tr id="lineTableTr">
                <td id="lineTableTd" style="width:3%">
                  <span style="font-weight:bold; " align="center">
                    <xsl:text>Sıra No</xsl:text>
                  </span>
                </td>
                <td id="lineTableTd" style="width:20%" align="center">
                  <span style="font-weight:bold; ">
                    <xsl:text>Mal Hizmet</xsl:text>
                  </span>
                </td>
                <td id="lineTableTd" style="width:7.4%" align="center">
                  <span style="font-weight:bold;">
                    <xsl:text>Miktar</xsl:text>
                  </span>
                </td>
                <td id="lineTableTd" style="width:9%" align="center">
                  <span style="font-weight:bold; ">
                    <xsl:text>Birim Fiyat</xsl:text>
                  </span>
                </td>
                <td id="lineTableTd" style="width:7%" align="center">
                  <span style="font-weight:bold; ">
                    <xsl:text>İskonto Oranı</xsl:text>
                  </span>
                </td>
                <td id="lineTableTd" style="width:9%" align="center">
                  <span style="font-weight:bold; ">
                    <xsl:text>İskonto Tutarı</xsl:text>
                  </span>
                </td>
                <td id="lineTableTd" style="width:7%" align="center">
                  <span style="font-weight:bold; ">
                    <xsl:text>KDV Oranı</xsl:text>
                  </span>
                </td>
                <td id="lineTableTd" style="width:10%" align="center">
                  <span style="font-weight:bold; ">
                    <xsl:text>KDV Tutarı</xsl:text>
                  </span>
                </td>
                <td id="lineTableTd" style="width:17%; " align="center">
                  <span style="font-weight:bold; ">
                    <xsl:text>Diğer Vergiler</xsl:text>
                  </span>
                </td>
                <td id="lineTableTd" style="width:10.6%" align="center">
                  <span style="font-weight:bold; ">
                    <xsl:text>Mal Hizmet Tutarı</xsl:text>
                  </span>
                </td>
                <xsl:if test="$senaryo = 'IHRACAT' or $senaryo = 'İHRACAT'">
                  <td class="lineTableTd" style="width:6%" align="center">
                    <span style="font-weight:bold;">
                      <xsl:text>Teslim Şartı</xsl:text>
                    </span>
                  </td>
                  <td class="lineTableTd" style="width:7%" align="center">
                    <span style="font-weight:bold;">
                      <xsl:text>Eşya Kap Cinsi</xsl:text>
                    </span>
                  </td>
                  <td class="lineTableTd" style="width:6%" align="center">
                    <span style="font-weight:bold;">
                      <xsl:text>Kap No</xsl:text>
                    </span>
                  </td>
                  <td class="lineTableTd" style="width:6%" align="center">
                    <span style="font-weight:bold;">
                      <xsl:text>Kap Adet</xsl:text>
                    </span>
                  </td>
                  <td class="lineTableTd" style="width:7%" align="center">
                    <span style="font-weight:bold;">
                      <xsl:text>Teslim/ Bedel Ödeme Yeri</xsl:text>
                    </span>
                  </td>
                  <td class="lineTableTd" style="width:9%" align="center">
                    <span style="font-weight:bold;">
                      <xsl:text>Gönderilme Şekli</xsl:text>
                    </span>
                  </td>
                  <td class="lineTableTd" style="width:6%" align="center">
                    <span style="font-weight:bold;">
                      <xsl:text>GTİP</xsl:text>
                    </span>
                  </td>
                </xsl:if>
              </tr>
              <xsl:if test="count(//n1:Invoice/cac:InvoiceLine) &gt;= 0">
                <xsl:for-each select="//n1:Invoice/cac:InvoiceLine">
                  <xsl:apply-templates select="." />
                </xsl:for-each>
              </xsl:if>
              <xsl:if test="count(//n1:Invoice/cac:InvoiceLine) &lt; 0">
                <xsl:choose>
                  <xsl:when test="//n1:Invoice/cac:InvoiceLine[1]">
                    <xsl:apply-templates select="//n1:Invoice/cac:InvoiceLine[1]" />
                  </xsl:when>
                  <xsl:otherwise>
                    <xsl:apply-templates select="//n1:Invoice" />
                  </xsl:otherwise>
                </xsl:choose>
                <xsl:choose>
                  <xsl:when test="//n1:Invoice/cac:InvoiceLine[2]">
                    <xsl:apply-templates select="//n1:Invoice/cac:InvoiceLine[2]" />
                  </xsl:when>
                  <xsl:otherwise>
                    <xsl:apply-templates select="//n1:Invoice" />
                  </xsl:otherwise>
                </xsl:choose>
                <xsl:choose>
                  <xsl:when test="//n1:Invoice/cac:InvoiceLine[3]">
                    <xsl:apply-templates select="//n1:Invoice/cac:InvoiceLine[3]" />
                  </xsl:when>
                  <xsl:otherwise>
                    <xsl:apply-templates select="//n1:Invoice" />
                  </xsl:otherwise>
                </xsl:choose>
                <xsl:choose>
                  <xsl:when test="//n1:Invoice/cac:InvoiceLine[4]">
                    <xsl:apply-templates select="//n1:Invoice/cac:InvoiceLine[4]" />
                  </xsl:when>
                  <xsl:otherwise>
                    <xsl:apply-templates select="//n1:Invoice" />
                  </xsl:otherwise>
                </xsl:choose>
                <xsl:choose>
                  <xsl:when test="//n1:Invoice/cac:InvoiceLine[5]">
                    <xsl:apply-templates select="//n1:Invoice/cac:InvoiceLine[5]" />
                  </xsl:when>
                  <xsl:otherwise>
                    <xsl:apply-templates select="//n1:Invoice" />
                  </xsl:otherwise>
                </xsl:choose>
                <xsl:choose>
                  <xsl:when test="//n1:Invoice/cac:InvoiceLine[6]">
                    <xsl:apply-templates select="//n1:Invoice/cac:InvoiceLine[6]" />
                  </xsl:when>
                  <xsl:otherwise>
                    <xsl:apply-templates select="//n1:Invoice" />
                  </xsl:otherwise>
                </xsl:choose>
                <xsl:choose>
                  <xsl:when test="//n1:Invoice/cac:InvoiceLine[7]">
                    <xsl:apply-templates select="//n1:Invoice/cac:InvoiceLine[7]" />
                  </xsl:when>
                  <xsl:otherwise>
                    <xsl:apply-templates select="//n1:Invoice" />
                  </xsl:otherwise>
                </xsl:choose>
                <xsl:choose>
                  <xsl:when test="//n1:Invoice/cac:InvoiceLine[8]">
                    <xsl:apply-templates select="//n1:Invoice/cac:InvoiceLine[8]" />
                  </xsl:when>
                  <xsl:otherwise>
                    <xsl:apply-templates select="//n1:Invoice" />
                  </xsl:otherwise>
                </xsl:choose>
                <xsl:choose>
                  <xsl:when test="//n1:Invoice/cac:InvoiceLine[9]">
                    <xsl:apply-templates select="//n1:Invoice/cac:InvoiceLine[9]" />
                  </xsl:when>
                  <xsl:otherwise>
                    <xsl:apply-templates select="//n1:Invoice" />
                  </xsl:otherwise>
                </xsl:choose>
                <xsl:choose>
                  <xsl:when test="//n1:Invoice/cac:InvoiceLine[10]">
                    <xsl:apply-templates select="//n1:Invoice/cac:InvoiceLine[10]" />
                  </xsl:when>
                  <xsl:otherwise>
                    <xsl:apply-templates select="//n1:Invoice" />
                  </xsl:otherwise>
                </xsl:choose>
                <xsl:choose>
                  <xsl:when test="//n1:Invoice/cac:InvoiceLine[11]">
                    <xsl:apply-templates select="//n1:Invoice/cac:InvoiceLine[11]" />
                  </xsl:when>
                  <xsl:otherwise>
                    <xsl:apply-templates select="//n1:Invoice" />
                  </xsl:otherwise>
                </xsl:choose>
                <xsl:choose>
                  <xsl:when test="//n1:Invoice/cac:InvoiceLine[12]">
                    <xsl:apply-templates select="//n1:Invoice/cac:InvoiceLine[12]" />
                  </xsl:when>
                  <xsl:otherwise>
                    <xsl:apply-templates select="//n1:Invoice" />
                  </xsl:otherwise>
                </xsl:choose>
                <xsl:choose>
                  <xsl:when test="//n1:Invoice/cac:InvoiceLine[13]">
                    <xsl:apply-templates select="//n1:Invoice/cac:InvoiceLine[13]" />
                  </xsl:when>
                  <xsl:otherwise>
                    <xsl:apply-templates select="//n1:Invoice" />
                  </xsl:otherwise>
                </xsl:choose>
                <xsl:choose>
                  <xsl:when test="//n1:Invoice/cac:InvoiceLine[14]">
                    <xsl:apply-templates select="//n1:Invoice/cac:InvoiceLine[14]" />
                  </xsl:when>
                  <xsl:otherwise>
                    <xsl:apply-templates select="//n1:Invoice" />
                  </xsl:otherwise>
                </xsl:choose>
                <xsl:choose>
                  <xsl:when test="//n1:Invoice/cac:InvoiceLine[15]">
                    <xsl:apply-templates select="//n1:Invoice/cac:InvoiceLine[15]" />
                  </xsl:when>
                  <xsl:otherwise>
                    <xsl:apply-templates select="//n1:Invoice" />
                  </xsl:otherwise>
                </xsl:choose>
                <xsl:choose>
                  <xsl:when test="//n1:Invoice/cac:InvoiceLine[16]">
                    <xsl:apply-templates select="//n1:Invoice/cac:InvoiceLine[16]" />
                  </xsl:when>
                  <xsl:otherwise>
                    <xsl:apply-templates select="//n1:Invoice" />
                  </xsl:otherwise>
                </xsl:choose>
                <xsl:choose>
                  <xsl:when test="//n1:Invoice/cac:InvoiceLine[17]">
                    <xsl:apply-templates select="//n1:Invoice/cac:InvoiceLine[17]" />
                  </xsl:when>
                  <xsl:otherwise>
                    <xsl:apply-templates select="//n1:Invoice" />
                  </xsl:otherwise>
                </xsl:choose>
                <xsl:choose>
                  <xsl:when test="//n1:Invoice/cac:InvoiceLine[18]">
                    <xsl:apply-templates select="//n1:Invoice/cac:InvoiceLine[18]" />
                  </xsl:when>
                  <xsl:otherwise>
                    <xsl:apply-templates select="//n1:Invoice" />
                  </xsl:otherwise>
                </xsl:choose>
                <xsl:choose>
                  <xsl:when test="//n1:Invoice/cac:InvoiceLine[19]">
                    <xsl:apply-templates select="//n1:Invoice/cac:InvoiceLine[19]" />
                  </xsl:when>
                  <xsl:otherwise>
                    <xsl:apply-templates select="//n1:Invoice" />
                  </xsl:otherwise>
                </xsl:choose>
                <xsl:choose>
                  <xsl:when test="//n1:Invoice/cac:InvoiceLine[20]">
                    <xsl:apply-templates select="//n1:Invoice/cac:InvoiceLine[20]" />
                  </xsl:when>
                  <xsl:otherwise>
                    <xsl:apply-templates select="//n1:Invoice" />
                  </xsl:otherwise>
                </xsl:choose>
              </xsl:if>
            </tbody>
          </table>
        </xsl:for-each>
        <table id="budgetContainerTable" width="800px">
          <tr id="budgetContainerTr" align="right">
            <td id="budgetContainerDummyTd" />
            <td id="lineTableBudgetTd" align="right" width="200px">
              <span style="font-weight:bold; ">
                <xsl:text>Mal Hizmet Toplam Tutarı</xsl:text>
              </span>
            </td>
            <td id="lineTableBudgetTd" style="width:81px; " align="right">
              <span>
                <xsl:value-of select="format-number(//n1:Invoice/cac:LegalMonetaryTotal/cbc:LineExtensionAmount, '###.##0,00', 'european')" />
                <xsl:if test="//n1:Invoice/cac:LegalMonetaryTotal/cbc:LineExtensionAmount/@currencyID">
                  <xsl:text></xsl:text>
                  <xsl:if test="//n1:Invoice/cac:LegalMonetaryTotal/cbc:LineExtensionAmount/@currencyID = 'TRY'">
                    <xsl:text>TL</xsl:text>
                  </xsl:if>
                  <xsl:if test="//n1:Invoice/cac:LegalMonetaryTotal/cbc:LineExtensionAmount/@currencyID != 'TRY'">
                    <xsl:value-of select="//n1:Invoice/cac:LegalMonetaryTotal/cbc:LineExtensionAmount/@currencyID" />
                  </xsl:if>
                </xsl:if>
              </span>
            </td>
          </tr>
          <tr id="budgetContainerTr" align="right">
            <td id="budgetContainerDummyTd" />
            <td id="lineTableBudgetTd" align="right" width="200px">
              <span style="font-weight:bold; ">
                <xsl:text>Toplam İskonto</xsl:text>
              </span>
            </td>
            <td id="lineTableBudgetTd" style="width:81px; " align="right">
              <span>
                <xsl:value-of select="format-number(//n1:Invoice/cac:LegalMonetaryTotal/cbc:AllowanceTotalAmount, '###.##0,00', 'european')" />
                <xsl:if test="//n1:Invoice/cac:LegalMonetaryTotal/cbc:AllowanceTotalAmount/@currencyID">
                  <xsl:text></xsl:text>
                  <xsl:if test="//n1:Invoice/cac:LegalMonetaryTotal/cbc:AllowanceTotalAmount/@currencyID = 'TRY'">
                    <xsl:text>TL</xsl:text>
                  </xsl:if>
                  <xsl:if test="//n1:Invoice/cac:LegalMonetaryTotal/cbc:AllowanceTotalAmount/@currencyID != 'TRY'">
                    <xsl:value-of select="//n1:Invoice/cac:LegalMonetaryTotal/cbc:AllowanceTotalAmount/@currencyID" />
                  </xsl:if>
                </xsl:if>
              </span>
            </td>
          </tr>
          <tr id="budgetContainerTr" align="right">
            <td id="budgetContainerDummyTd" />
            <td id="lineTableBudgetTd" align="right" width="200px">
              <span style="font-weight:bold; ">
                <xsl:text>Ara Toplam</xsl:text>
              </span>
            </td>
            <td id="lineTableBudgetTd" style="width:81px; " align="right">
              <span>
                <xsl:value-of select="format-number(//n1:Invoice/cac:LegalMonetaryTotal/cbc:TaxExclusiveAmount, '###.##0,00', 'european')" />
                <xsl:if test="//n1:Invoice/cac:LegalMonetaryTotal/cbc:AllowanceTotalAmount/@currencyID">
                  <xsl:text></xsl:text>
                  <xsl:if test="//n1:Invoice/cac:LegalMonetaryTotal/cbc:AllowanceTotalAmount/@currencyID = 'TRY'">
                    <xsl:text>TL</xsl:text>
                  </xsl:if>
                  <xsl:if test="//n1:Invoice/cac:LegalMonetaryTotal/cbc:AllowanceTotalAmount/@currencyID != 'TRY'">
                    <xsl:value-of select="//n1:Invoice/cac:LegalMonetaryTotal/cbc:AllowanceTotalAmount/@currencyID" />
                  </xsl:if>
                </xsl:if>
              </span>
            </td>
          </tr>
          <xsl:for-each select="n1:Invoice/cac:TaxTotal/cac:TaxSubtotal">
            <tr id="budgetContainerTr" align="right">
              <td id="budgetContainerDummyTd" />
              <td id="lineTableBudgetTd" width="211px" align="right">
                <span style="font-weight:bold; ">
                  <xsl:text>Hesaplanan </xsl:text>
                  <xsl:value-of select="cac:TaxCategory/cac:TaxScheme/cbc:Name" />
                  <xsl:text>(%</xsl:text>
                  <xsl:value-of select="cbc:Percent" />
                  <xsl:text>)</xsl:text>
                </span>
              </td>
              <td id="lineTableBudgetTd" style="width:82px; " align="right">
                <xsl:for-each select="cac:TaxCategory/cac:TaxScheme">
                  <xsl:text></xsl:text>
                  <xsl:value-of select="format-number(../../cbc:TaxAmount, '###.##0,00', 'european')" />
                  <xsl:if test="../../cbc:TaxAmount/@currencyID">
                    <xsl:text></xsl:text>
                    <xsl:if test="../../cbc:TaxAmount/@currencyID = 'TRY'">
                      <xsl:text>TL</xsl:text>
                    </xsl:if>
                    <xsl:if test="../../cbc:TaxAmount/@currencyID != 'TRY'">
                      <xsl:value-of select="../../cbc:TaxAmount/@currencyID" />
                    </xsl:if>
                  </xsl:if>
                </xsl:for-each>
              </td>
            </tr>
          </xsl:for-each>
          <xsl:for-each select="n1:Invoice/cac:WithholdingTaxTotal/cac:TaxSubtotal">
            <xsl:if test="cbc:TaxAmount != ''">
              <tr id="budgetContainerTr" align="right">
                <td id="budgetContainerDummyTd" />
                <td id="lineTableBudgetTd" width="211px" align="right">
                  <span style="font-weight:bold; ">
                    <xsl:text>KDV Tevkifat-[</xsl:text>
                    <xsl:value-of select="cac:TaxCategory/cac:TaxScheme/cbc:TaxTypeCode" />
                    <xsl:text>]-</xsl:text>
                    <xsl:text>(%</xsl:text>
                    <xsl:value-of select="cbc:Percent" />
                    <xsl:text>)</xsl:text>
                  </span>
                </td>
                <td id="lineTableBudgetTd" style="width:82px; " align="right">
                  <xsl:for-each select="cac:TaxCategory/cac:TaxScheme">
                    <xsl:value-of select="format-number(../../cbc:TaxAmount, '###.##0,00', 'european')" />
                    <xsl:if test="../../cbc:TaxAmount/@currencyID">
                      <xsl:text></xsl:text>
                      <xsl:if test="../../cbc:TaxAmount/@currencyID = 'TRY'">
                        <xsl:text>TL</xsl:text>
                      </xsl:if>
                      <xsl:if test="../../cbc:TaxAmount/@currencyID != 'TRY'">
                        <xsl:value-of select="../../cbc:TaxAmount/@currencyID" />
                      </xsl:if>
                    </xsl:if>
                  </xsl:for-each>
                </td>
              </tr>
            </xsl:if>
          </xsl:for-each>
          <tr id="budgetContainerTr" align="right">
            <td id="budgetContainerDummyTd" />
            <td id="lineTableBudgetTd" width="200px" align="right">
              <span style="font-weight:bold; ">
                <xsl:text>Vergiler Dahil Toplam Tutar</xsl:text>
              </span>
            </td>
            <td id="lineTableBudgetTd" style="width:82px; " align="right">
              <xsl:for-each select="n1:Invoice">
                <xsl:for-each select="cac:LegalMonetaryTotal">
                  <xsl:for-each select="cbc:TaxInclusiveAmount">
                    <xsl:value-of select="format-number(., '###.##0,00', 'european')" />
                    <xsl:if test="//n1:Invoice/cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount/@currencyID">
                      <xsl:text></xsl:text>
                      <xsl:if test="//n1:Invoice/cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount/@currencyID = 'TRY'">
                        <xsl:text>TL</xsl:text>
                      </xsl:if>
                      <xsl:if test="//n1:Invoice/cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount/@currencyID != 'TRY'">
                        <xsl:value-of select="//n1:Invoice/cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount/@currencyID" />
                      </xsl:if>
                    </xsl:if>
                  </xsl:for-each>
                </xsl:for-each>
              </xsl:for-each>
            </td>
          </tr>
          <tr id="budgetContainerTr" align="right">
            <td id="budgetContainerDummyTd" />
            <td id="lineTableBudgetTd" width="200px" align="right">
              <span style="font-weight:bold; ">
                <xsl:text>Ödenecek Tutar</xsl:text>
              </span>
            </td>
            <td id="lineTableBudgetTd" style="width:82px; " align="right">
              <xsl:for-each select="n1:Invoice">
                <xsl:for-each select="cac:LegalMonetaryTotal">
                  <xsl:for-each select="cbc:PayableAmount">
                    <xsl:value-of select="format-number(., '###.##0,00', 'european')" />
                    <xsl:if test="//n1:Invoice/cac:LegalMonetaryTotal/cbc:PayableAmount/@currencyID">
                      <xsl:text></xsl:text>
                      <xsl:if test="//n1:Invoice/cac:LegalMonetaryTotal/cbc:PayableAmount/@currencyID = 'TRY'">
                        <xsl:text>TL</xsl:text>
                      </xsl:if>
                      <xsl:if test="//n1:Invoice/cac:LegalMonetaryTotal/cbc:PayableAmount/@currencyID != 'TRY'">
                        <xsl:value-of select="//n1:Invoice/cac:LegalMonetaryTotal/cbc:PayableAmount/@currencyID" />
                      </xsl:if>
                    </xsl:if>
                  </xsl:for-each>
                </xsl:for-each>
              </xsl:for-each>
            </td>
          </tr>
          <xsl:if test="//n1:Invoice/cbc:DocumentCurrencyCode != 'TRY'">
            <tr id="budgetContainerTr" align="right">
              <td id="budgetContainerDummyTd" />
              <td id="lineTableBudgetTd" align="right" width="200px">
                <span style="font-weight:bold; ">
                  <xsl:text>Toplam İskonto (TL)</xsl:text>
                </span>
              </td>
              <td id="lineTableBudgetTd" style="width:81px; " align="right">
                <span>
                  <xsl:value-of select="format-number(//n1:Invoice/cac:LegalMonetaryTotal/cbc:AllowanceTotalAmount * //n1:Invoice/cac:PricingExchangeRate/cbc:CalculationRate, '###.##0,00', 'european')" />
                  <xsl:text> TL</xsl:text>
                </span>
              </td>
            </tr>
          </xsl:if>
          <xsl:for-each select="n1:Invoice/cac:TaxTotal/cac:TaxSubtotal">
            <xsl:if test="//n1:Invoice/cbc:DocumentCurrencyCode != 'TRY'">
              <tr align="right">
                <td />
                <td id="lineTableBudgetTd" align="right" width="200px">
                  <span style="font-weight:bold; ">
                    <xsl:text>Hesaplanan </xsl:text>
                    <xsl:value-of select="cac:TaxCategory/cac:TaxScheme/cbc:Name" />
                    <xsl:text>(%</xsl:text>
                    <xsl:value-of select="cbc:Percent" />
                    <xsl:text>) (TL)</xsl:text>
                  </span>
                </td>
                <td id="lineTableBudgetTd" style="width:81px; " align="right">
                  <span>
                    <xsl:value-of select="format-number(cbc:TaxAmount * //n1:Invoice/cac:PricingExchangeRate/cbc:CalculationRate, '###.##0,00', 'european')" />
                    <xsl:text> TL</xsl:text>
                  </span>
                </td>
              </tr>
            </xsl:if>
          </xsl:for-each>
          <xsl:for-each select="n1:Invoice/cac:WithholdingTaxTotal/cac:TaxSubtotal">
            <xsl:if test="//n1:Invoice/cbc:DocumentCurrencyCode != 'TRY' and cbc:TaxAmount != ''">
              <tr id="budgetContainerTr" align="right">
                <td />
                <td id="lineTableBudgetTd" width="211px" align="right">
                  <span style="font-weight:bold; ">
                    <xsl:text>KDV Tevkifat-[</xsl:text>
                    <xsl:value-of select="cac:TaxCategory/cac:TaxScheme/cbc:TaxTypeCode" />
                    <xsl:text>]-</xsl:text>
                    <xsl:text>(%</xsl:text>
                    <xsl:value-of select="cbc:Percent" />
                    <xsl:text>) (TL)</xsl:text>
                  </span>
                </td>
                <td id="lineTableBudgetTd" style="width:82px; " align="right">
                  <xsl:for-each select="cac:TaxCategory/cac:TaxScheme">
                    <xsl:text></xsl:text>
                    <xsl:value-of select="format-number(../../cbc:TaxAmount * //n1:Invoice/cac:PricingExchangeRate/cbc:CalculationRate, '###.##0,00', 'european')" />
                    <xsl:text> TL</xsl:text>
                  </xsl:for-each>
                </td>
              </tr>
            </xsl:if>
          </xsl:for-each>
          <xsl:if test="//n1:Invoice/cbc:DocumentCurrencyCode != 'TRY'">
            <tr align="right">
              <td />
              <td id="lineTableBudgetTd" align="right" width="200px">
                <span style="font-weight:bold; ">
                  <xsl:text>Mal Hizmet Toplam Tutarı(TL)</xsl:text>
                </span>
              </td>
              <td id="lineTableBudgetTd" style="width:81px; " align="right">
                <span>
                  <xsl:value-of select="format-number(//n1:Invoice/cac:LegalMonetaryTotal/cbc:LineExtensionAmount * //n1:Invoice/cac:PricingExchangeRate/cbc:CalculationRate, '###.##0,00', 'european')" />
                  <xsl:text> TL</xsl:text>
                </span>
              </td>
            </tr>
            <tr id="budgetContainerTr" align="right">
              <td />
              <td id="lineTableBudgetTd" width="200px" align="right">
                <span style="font-weight:bold; ">
                  <xsl:text>Vergiler Dahil Toplam Tutar(TL)</xsl:text>
                </span>
              </td>
              <td id="lineTableBudgetTd" style="width:82px; " align="right">
                <xsl:value-of select="format-number(//n1:Invoice/cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount * //n1:Invoice/cac:PricingExchangeRate/cbc:CalculationRate, '###.##0,00', 'european')" />
                <xsl:text> TL</xsl:text>
              </td>
            </tr>
            <tr align="right">
              <td />
              <td id="lineTableBudgetTd" width="200px" align="right">
                <span style="font-weight:bold; ">
                  <xsl:text>Ödenecek Tutar(TL)</xsl:text>
                </span>
              </td>
              <td id="lineTableBudgetTd" style="width:82px; " align="right">
                <xsl:value-of select="format-number(//n1:Invoice/cac:LegalMonetaryTotal/cbc:PayableAmount * //n1:Invoice/cac:PricingExchangeRate/cbc:CalculationRate, '###.##0,00', 'european')" />
                <xsl:text> TL</xsl:text>
              </td>
            </tr>
          </xsl:if>
        </table>
        <br />
        <table width="800px" border="1px" border-color="black">
          <tbody>
            <tr align="left">
              <th>
                <font color="black">PB</font>
              </th>
              <th>
                <font color="black">BANKA</font>
              </th>
              <th>
                <font color="black">IBAN NO</font>
              </th>
            </tr>
            <tr align="left">
              <td>( TL )</td>
              <td>ZİRAAT BANKASI</td>
              <td> TR66 0001 0007 6840 8479 5150 06</td>
            </tr>
          </tbody>
        </table>
        <table id="notesTable" width="800" align="left" height="100">
          <tbody>
            <tr align="left">
              <td id="notesTableTd">
                <xsl:if test="//n1:Invoice/cbc:Note">
                  <b>      Not: </b>
                  <xsl:for-each select="//n1:Invoice/cbc:Note">
                    <span>
                      <tr>
                        <td>
                          <xsl:value-of select="string(.)" />
                        </td>
                      </tr>
                    </span>
                  </xsl:for-each>
                  <br />
                </xsl:if>
                <xsl:if test="//n1:Invoice/cac:PaymentMeans/cbc:InstructionNote">
                  <b>      Ödeme
										Notu: </b>
                  <xsl:value-of select="//n1:Invoice/cac:PaymentMeans/cbc:InstructionNote" />
                  <br />
                </xsl:if>
                <xsl:if test="//n1:Invoice/cac:PaymentMeans/cac:PayeeFinancialAccount/cbc:PaymentNote">
                  <b>      Hesap
										Açıklaması: </b>
                  <xsl:value-of select="//n1:Invoice/cac:PaymentMeans/cac:PayeeFinancialAccount/cbc:PaymentNote" />
                  <br />
                </xsl:if>
                <xsl:if test="//n1:Invoice/cac:PaymentTerms/cbc:Note">
                  <b>      Ödeme
										Koşulu: </b>
                  <xsl:value-of select="//n1:Invoice/cac:PaymentTerms/cbc:Note" />
                  <br />
                </xsl:if>
                <xsl:if test="//n1:Invoice/cac:TaxTotal/cac:TaxSubtotal">
                  <xsl:for-each select="//n1:Invoice/cac:TaxTotal/cac:TaxSubtotal">
                    <xsl:if test="(cac:TaxCategory/cac:TaxScheme/cbc:TaxTypeCode='0015' or ../../cbc:InvoiceTypeCode='OZELMATRAH') and cac:TaxCategory/cbc:TaxExemptionReason">
                      <b>Vergi İstisna Muafiyet Sebebi: </b>
                      <xsl:value-of select="cac:TaxCategory/cbc:TaxExemptionReasonCode" />
                      <xsl:text>-</xsl:text>
                      <xsl:value-of select="cac:TaxCategory/cbc:TaxExemptionReason" />
                      <br />
                    </xsl:if>
                    <xsl:if test="starts-with(cac:TaxCategory/cac:TaxScheme/cbc:TaxTypeCode,'007') and cac:TaxCategory/cbc:TaxExemptionReason">
                      <b>ÖTV İstisna Muafiyet Sebebi: </b>
                      <xsl:value-of select="cac:TaxCategory/cbc:TaxExemptionReasonCode" />
                      <xsl:text>-</xsl:text>
                      <xsl:value-of select="cac:TaxCategory/cbc:TaxExemptionReason" />
                      <br />
                    </xsl:if>
                  </xsl:for-each>
                </xsl:if>
                <xsl:if test="//n1:Invoice/cac:WithholdingTaxTotal/cac:TaxSubtotal/cac:TaxCategory/cac:TaxScheme">
                  <xsl:for-each select="//n1:Invoice/cac:WithholdingTaxTotal/cac:TaxSubtotal/cac:TaxCategory/cac:TaxScheme">
                    <b>Tevkifat Sebebi: </b>
                    <xsl:value-of select="cbc:TaxTypeCode" />
                    <xsl:text>-</xsl:text>
                    <xsl:choose>
                      <xsl:when test="cbc:Name and cbc:Name!=''">
                        <xsl:value-of select="cbc:Name" />
                      </xsl:when>
                      <xsl:otherwise>
                        <xsl:call-template name="tevkifat_aciklamasi">
                          <xsl:with-param name="p1" select="cbc:TaxTypeCode" />
                        </xsl:call-template>
                      </xsl:otherwise>
                    </xsl:choose>
                    <br />
                  </xsl:for-each>
                </xsl:if>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
      <div></div>
    </html>
  </xsl:template>
  <xsl:template match="dateFormatter">
    <xsl:value-of select="substring(.,9,2)" />-<xsl:value-of select="substring(.,6,2)" />-<xsl:value-of select="substring(.,1,4)" /></xsl:template>
  <xsl:template name="tevkifat_aciklamasi">
    <xsl:param name="p1" />
    <xsl:if test="$p1">
      <xsl:choose>
        <xsl:when test="$p1 =  '601'">YAPIM İŞLERİ İLE BU İŞLERLE BİRLİKTE İFA EDİLEN MÜHENDİSLİK-MİMARLIK VE ETÜT-PROJE HİZMETLERİ *GT 117-Bölüm (3.2.1)+</xsl:when>
        <xsl:when test="$p1 =  '602'">ETÜT, PLAN-PROJE, DANIŞMANLIK, DENETİM VE BENZERİ HİZMETLER*GT 117-Bölüm (3.2.2)+</xsl:when>
        <xsl:when test="$p1 =  '603'">MAKİNE, TEÇHİZAT, DEMİRBAŞ VE TAŞITLARA AİT TADİL, BAKIM VE ONARIM HİZMETLERİ *GT 117-Bölüm (3.2.3)</xsl:when>
        <xsl:when test="$p1 =  '604'">YEMEK SERVİS HİZMETİ *GT 117-Bölüm (3.2.4)+</xsl:when>
        <xsl:when test="$p1 =  '605'">ORGANİZASYON HİZMETİ *GT 117-Bölüm (3.2.4)+</xsl:when>
        <xsl:when test="$p1 =  '606'">İŞGÜCÜ TEMİN HİZMETLERİ *GT 117-Bölüm (3.2.5)+</xsl:when>
        <xsl:when test="$p1 =  '607'">ÖZEL GÜVENLİK HİZMETİ *GT 117-Bölüm (3.2.5)+</xsl:when>
        <xsl:when test="$p1 =  '608'">YAPI DENETİM HİZMETLERİ *GT 117-Bölüm (3.2.6)+</xsl:when>
        <xsl:when test="$p1 =  '609'">FASON OLARAK YAPTIRILAN TEKSTİL VE KONFEKSİYON İŞLERİ, ÇANTA VE AYAKKABI DİKİM İŞLERİ VE BU İŞLERE ARACILIK HİZMETLERİ *GT 117-Bölüm (3.2.7)+</xsl:when>
        <xsl:when test="$p1 =  '610'">TURİSTİK MAĞAZALARA VERİLEN MÜŞTERİ BULMA / GÖTÜRME HİZMETLERİ *GT 117-Bölüm (3.2.8)+</xsl:when>
        <xsl:when test="$p1 =  '611'">SPOR KULÜPLERİNİN YAYIN, REKLÂM VE İSİM HAKKI GELİRLERİNE KONU İŞLEMLERİ *GT 117-Bölüm (3.2.9)+</xsl:when>
        <xsl:when test="$p1 =  '612'">TEMİZLİK HİZMETİ *GT 117-Bölüm (3.2.10)+</xsl:when>
        <xsl:when test="$p1 =  '613'">ÇEVRE VE BAHÇE BAKIM HİZMETLERİ *GT 117-Bölüm (3.2.10)+</xsl:when>
        <xsl:when test="$p1 =  '614'">SERVİS TAŞIMACILIĞI HİZMETİ *GT 117-Bölüm (3.2.11)+</xsl:when>
        <xsl:when test="$p1 =  '615'">HER TÜRLÜ BASKI VE BASIM HİZMETLERİ *GT 117-Bölüm (3.2.12)+</xsl:when>
        <xsl:when test="$p1 =  '616'">5018 SAYILI KANUNA EKLİ CETVELLERDEKİ İDARE, KURUM VE KURUŞLARA YAPILAN DİĞER HİZMETLER *GT 117-Bölüm (3.2.13)+</xsl:when>
        <xsl:when test="$p1 =  '617'">HURDA METALDEN ELDE EDİLEN KÜLÇE TESLİMLERİ *GT 117-Bölüm (3.3.1)+</xsl:when>
        <xsl:when test="$p1 =  '618'">HURDA METALDEN ELDE EDİLENLER DIŞINDAKİ BAKIR, ÇİNKO VE ALÜMİNYUM KÜLÇE TESLİMLERİ *GT 117-Bölüm (3.3.1)+</xsl:when>
        <xsl:when test="$p1 =  '619'">BAKIR, ÇİNKO VE ALÜMİNYUM ÜRÜNLERİNİN TESLİMİ *GT 117-Bölüm (3.3.2)+</xsl:when>
        <xsl:when test="$p1 =  '620'">İSTİSNADAN VAZGEÇENLERİN HURDA VE ATIK TESLİMİ *GT 117-Bölüm (3.3.3)+</xsl:when>
        <xsl:when test="$p1 =  '621'">METAL, PLASTİK, LASTİK, KAUÇUK, KÂĞIT VE CAM HURDA VE ATIKLARDAN ELDE EDİLEN HAMMADDE TESLİMİ *GT 117-Bölüm (3.3.4)]</xsl:when>
        <xsl:when test="$p1 =  '622'">PAMUK, TİFTİK, YÜN VE YAPAĞI İLE HAM POST VE DERİ TESLİMLERİ *GT 117-Bölüm (3.3.5)+</xsl:when>
        <xsl:when test="$p1 =  '623'">AĞAÇ VE ORMAN ÜRÜNLERİ TESLİMİ *GT 117-Bölüm (3.3.6)+</xsl:when>
        <xsl:when test="$p1 =  '650'">DİĞERLERİ</xsl:when>
      </xsl:choose>
    </xsl:if>
  </xsl:template>
  <xsl:template match="//n1:Invoice/cac:InvoiceLine">
    <tr id="lineTableTr">
      <td id="lineTableTd">
        <span>
          <xsl:text> </xsl:text>
          <xsl:value-of select="./cbc:ID" />
        </span>
      </td>
      <td id="lineTableTd">
        <span>
          <xsl:text> </xsl:text>
          <xsl:value-of select="./cac:Item/cbc:Name" />
          <!--	<xsl:text>&#160;</xsl:text>
					<xsl:value-of select="./cac:Item/cbc:BrandName"/>
					<xsl:text>&#160;</xsl:text>
					<xsl:value-of select="./cac:Item/cbc:ModelName"/>
					<xsl:text>&#160;</xsl:text>
					<xsl:value-of select="./cac:Item/cbc:Description"/>-->
        </span>
      </td>
      <td id="lineTableTd" align="right">
        <span>
          <xsl:text> </xsl:text>
          <xsl:value-of select="format-number(./cbc:InvoicedQuantity, '###.###,##', 'european')" />
          <xsl:if test="./cbc:InvoicedQuantity/@unitCode">
            <xsl:for-each select="./cbc:InvoicedQuantity">
              <xsl:text></xsl:text>
              <xsl:choose>
                <xsl:when test="@unitCode  = '26'">
                  <span>
                    <xsl:text>Ton</xsl:text>
                  </span>
                </xsl:when>
                <xsl:when test="@unitCode  = 'BX'">
                  <span>
                    <xsl:text>Kutu</xsl:text>
                  </span>
                </xsl:when>
                <xsl:when test="@unitCode  = 'LTR'">
                  <span>
                    <xsl:text>LT</xsl:text>
                  </span>
                </xsl:when>
                <xsl:when test="@unitCode  = 'NIU'">
                  <span>
                    <xsl:text>Adet</xsl:text>
                  </span>
                </xsl:when>
                <xsl:when test="@unitCode  = 'KGM'">
                  <span>
                    <xsl:text>KG</xsl:text>
                  </span>
                </xsl:when>
                <xsl:when test="@unitCode  = 'KJO'">
                  <span>
                    <xsl:text>kJ</xsl:text>
                  </span>
                </xsl:when>
                <xsl:when test="@unitCode  = 'GRM'">
                  <span>
                    <xsl:text>G</xsl:text>
                  </span>
                </xsl:when>
                <xsl:when test="@unitCode  = 'MGM'">
                  <span>
                    <xsl:text>MG</xsl:text>
                  </span>
                </xsl:when>
                <xsl:when test="@unitCode  = 'NT'">
                  <span>
                    <xsl:text>Net Ton</xsl:text>
                  </span>
                </xsl:when>
                <xsl:when test="@unitCode  = 'GT'">
                  <span>
                    <xsl:text>GT</xsl:text>
                  </span>
                </xsl:when>
                <xsl:when test="@unitCode  = 'MTR'">
                  <span>
                    <xsl:text>M</xsl:text>
                  </span>
                </xsl:when>
                <xsl:when test="@unitCode  = 'MMT'">
                  <span>
                    <xsl:text>MM</xsl:text>
                  </span>
                </xsl:when>
                <xsl:when test="@unitCode  = 'KTM'">
                  <span>
                    <xsl:text>KM</xsl:text>
                  </span>
                </xsl:when>
                <xsl:when test="@unitCode  = 'MLT'">
                  <span>
                    <xsl:text>ML</xsl:text>
                  </span>
                </xsl:when>
                <xsl:when test="@unitCode  = 'MMQ'">
                  <span>
                    <xsl:text>MM3</xsl:text>
                  </span>
                </xsl:when>
                <xsl:when test="@unitCode  = 'CLT'">
                  <span>
                    <xsl:text>CL</xsl:text>
                  </span>
                </xsl:when>
                <xsl:when test="@unitCode  = 'CMK'">
                  <span>
                    <xsl:text>CM2</xsl:text>
                  </span>
                </xsl:when>
                <xsl:when test="@unitCode  = 'CMQ'">
                  <span>
                    <xsl:text>CM3</xsl:text>
                  </span>
                </xsl:when>
                <xsl:when test="@unitCode  = 'CMT'">
                  <span>
                    <xsl:text>CM</xsl:text>
                  </span>
                </xsl:when>
                <xsl:when test="@unitCode  = 'MTK'">
                  <span>
                    <xsl:text>M2</xsl:text>
                  </span>
                </xsl:when>
                <xsl:when test="@unitCode  = 'MTQ'">
                  <span>
                    <xsl:text>M3</xsl:text>
                  </span>
                </xsl:when>
                <xsl:when test="@unitCode  = 'DAY'">
                  <span>
                    <xsl:text> Gün</xsl:text>
                  </span>
                </xsl:when>
                <xsl:when test="@unitCode  = 'MON'">
                  <span>
                    <xsl:text> Ay</xsl:text>
                  </span>
                </xsl:when>
                <xsl:when test="@unitCode  = 'PA'">
                  <span>
                    <xsl:text> Paket</xsl:text>
                  </span>
                </xsl:when>
                <xsl:when test="@unitCode  = 'KWH'">
                  <span>
                    <xsl:text> KWH</xsl:text>
                  </span>
                </xsl:when>
              </xsl:choose>
            </xsl:for-each>
          </xsl:if>
        </span>
      </td>
      <td id="lineTableTd" align="right">
        <span>
          <xsl:text> </xsl:text>
          <xsl:value-of select="format-number(./cac:Price/cbc:PriceAmount, '###.##0,00', 'european')" />
          <xsl:if test="./cac:Price/cbc:PriceAmount/@currencyID">
            <xsl:text></xsl:text>
            <xsl:if test="./cac:Price/cbc:PriceAmount/@currencyID = &quot;TRY&quot; ">
              <xsl:text>TL</xsl:text>
            </xsl:if>
            <xsl:if test="./cac:Price/cbc:PriceAmount/@currencyID != &quot;TRY&quot;">
              <xsl:value-of select="./cac:Price/cbc:PriceAmount/@currencyID" />
            </xsl:if>
          </xsl:if>
        </span>
      </td>
      <td id="lineTableTd" align="right">
        <span>
          <!--	<xsl:text>&#160;</xsl:text>
					<xsl:if test="./cac:AllowanceCharge/cbc:MultiplierFactorNumeric">
						<xsl:text> %</xsl:text>
						<xsl:value-of
							select="format-number(./cac:AllowanceCharge/cbc:MultiplierFactorNumeric * 100, '###.##0,00', 'european')"
						/>
					</xsl:if>-->
          <xsl:value-of select="./cbc:Note[2]" />
        </span>
      </td>
      <td id="lineTableTd" align="right">
        <span>
          <xsl:text> </xsl:text>
          <xsl:if test="./cac:AllowanceCharge">
            <!--<xsl:if test="./cac:AllowanceCharge/cbc:ChargeIndicator = true() ">+
										</xsl:if>
						<xsl:if test="./cac:AllowanceCharge/cbc:ChargeIndicator = false() ">-
										</xsl:if>-->
            <xsl:value-of select="format-number(./cac:AllowanceCharge/cbc:Amount, '###.##0,00', 'european')" />
          </xsl:if>
          <xsl:if test="./cac:AllowanceCharge/cbc:Amount/@currencyID">
            <xsl:text></xsl:text>
            <xsl:if test="./cac:AllowanceCharge/cbc:Amount/@currencyID = 'TRY'">
              <xsl:text>TL</xsl:text>
            </xsl:if>
            <xsl:if test="./cac:AllowanceCharge/cbc:Amount/@currencyID != 'TRY'">
              <xsl:value-of select="./cac:AllowanceCharge/cbc:Amount/@currencyID" />
            </xsl:if>
          </xsl:if>
        </span>
      </td>
      <td id="lineTableTd" align="right">
        <span>
          <xsl:text> </xsl:text>
          <xsl:for-each select="./cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cac:TaxScheme">
            <xsl:if test="cbc:TaxTypeCode='0015' ">
              <xsl:text></xsl:text>
              <xsl:if test="../../cbc:Percent">
                <xsl:text> %</xsl:text>
                <xsl:value-of select="format-number(../../cbc:Percent, '###.##0,00', 'european')" />
              </xsl:if>
            </xsl:if>
          </xsl:for-each>
        </span>
      </td>
      <td id="lineTableTd" align="right">
        <span>
          <xsl:text> </xsl:text>
          <xsl:for-each select="./cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cac:TaxScheme">
            <xsl:if test="cbc:TaxTypeCode='0015' ">
              <xsl:text></xsl:text>
              <xsl:value-of select="format-number(../../cbc:TaxAmount, '###.##0,00', 'european')" />
              <xsl:if test="../../cbc:TaxAmount/@currencyID">
                <xsl:text></xsl:text>
                <xsl:if test="../../cbc:TaxAmount/@currencyID = 'TRY'">
                  <xsl:text>TL</xsl:text>
                </xsl:if>
                <xsl:if test="../../cbc:TaxAmount/@currencyID != 'TRY'">
                  <xsl:value-of select="../../cbc:TaxAmount/@currencyID" />
                </xsl:if>
              </xsl:if>
            </xsl:if>
          </xsl:for-each>
        </span>
      </td>
      <td id="lineTableTd" style="font-size: xx-small" align="right">
        <span>
          <xsl:text> </xsl:text>
          <xsl:for-each select="./cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cac:TaxScheme">
            <xsl:if test="cbc:TaxTypeCode!='0015' ">
              <xsl:text></xsl:text>
              <xsl:value-of select="cbc:Name" />
              <xsl:if test="../../cbc:Percent">
                <xsl:text> (%</xsl:text>
                <xsl:value-of select="format-number(../../cbc:Percent, '###.##0,00', 'european')" />
                <xsl:text>)=</xsl:text>
              </xsl:if>
              <xsl:value-of select="format-number(../../cbc:TaxAmount, '###.##0,00', 'european')" />
              <xsl:if test="../../cbc:TaxAmount/@currencyID">
                <xsl:text></xsl:text>
                <xsl:if test="../../cbc:TaxAmount/@currencyID = 'TRY'">
                  <xsl:text>TL</xsl:text>
                </xsl:if>
                <xsl:if test="../../cbc:TaxAmount/@currencyID != 'TRY'">
                  <xsl:value-of select="../../cbc:TaxAmount/@currencyID" />
                </xsl:if>
              </xsl:if>
            </xsl:if>
          </xsl:for-each>
        </span>
      </td>
      <!--xsl:if test="not($senaryo = 'IHRACAT' or $senaryo = 'İHRACAT')">
				<td id="lineTableTd" align="right">
					<xsl:text> </xsl:text>
					<xsl:for-each select="./cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cac:TaxScheme">
						<xsl:if test="cbc:TaxTypeCode='0015' ">
							<xsl:text/>
							<xsl:if test="../../cbc:Percent">
								<xsl:text> %</xsl:text>
								<xsl:value-of select="format-number(../../cbc:Percent, '###.##0,00', 'european')"/>
							</xsl:if>
						</xsl:if>
					</xsl:for-each>
				</td>
				<td id="lineTableTd" align="right">
					<xsl:text> </xsl:text>
					<xsl:for-each select="./cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cac:TaxScheme">
						<xsl:if test="cbc:TaxTypeCode='0015' ">
							<xsl:text/>
							<xsl:call-template name="Curr_Type">
								<xsl:with-param name="valuePath" select="../../cbc:TaxAmount"/>
								<xsl:with-param name="format" select="'###.##0,00'"/>
							</xsl:call-template>
						</xsl:if>
					</xsl:for-each>
				</td>
				<td id="lineTableTd" style="font-size: xx-small" align="right">
					<xsl:text> </xsl:text>
					<xsl:for-each select="./cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cac:TaxScheme">
						<xsl:if test="cbc:TaxTypeCode!='0015' ">
							<xsl:text> </xsl:text>
							<xsl:value-of select="cbc:Name"/>
							<xsl:if test="../../cbc:Percent">
								<xsl:text> (%</xsl:text>
								<xsl:value-of select="format-number(../../cbc:Percent, '###.##0,00', 'european')"/>
								<xsl:text>)=</xsl:text>
							</xsl:if>
							<xsl:for-each select="../../cbc:TaxAmount">
								<xsl:call-template name="Curr_Type">
									<xsl:with-param name="valuePath" select="."/>
									<xsl:with-param name="format" select="'###.##0,00'"/>
								</xsl:call-template>
							</xsl:for-each>
							<br/>
						</xsl:if>
					</xsl:for-each>
					<xsl:for-each select="./cac:WithholdingTaxTotal/cac:TaxSubtotal/cac:TaxCategory/cac:TaxScheme">
						<xsl:text> KDV TEVKİFAT</xsl:text>
						<xsl:if test="../../cbc:Percent">
							<xsl:text> (%</xsl:text>
							<xsl:value-of select="format-number(../../cbc:Percent, '###.##0,00', 'european')"/>
							<xsl:text>)=</xsl:text>
						</xsl:if>
						<xsl:for-each select="../../cbc:TaxAmount">
							<xsl:call-template name="Curr_Type">
								<xsl:with-param name="valuePath" select="."/>
								<xsl:with-param name="format" select="'###.##0,00'"/>
							</xsl:call-template>
						</xsl:for-each>
						<xsl:if test="not(position() = last())">
							<br/>
						</xsl:if>
					</xsl:for-each>
				</td>
			</xsl:if-->
      <td id="lineTableTd" align="right">
        <span>
          <xsl:text> </xsl:text>
          <xsl:value-of select="format-number(./cbc:LineExtensionAmount, '###.##0,00', 'european')" />
          <xsl:if test="./cbc:LineExtensionAmount/@currencyID">
            <xsl:text></xsl:text>
            <xsl:if test="./cbc:LineExtensionAmount/@currencyID = 'TRY' ">
              <xsl:text>TL</xsl:text>
            </xsl:if>
            <xsl:if test="./cbc:LineExtensionAmount/@currencyID != 'TRY' ">
              <xsl:value-of select="./cbc:LineExtensionAmount/@currencyID" />
            </xsl:if>
          </xsl:if>
        </span>
      </td>
      <xsl:if test="$senaryo = 'IHRACAT' or $senaryo = 'İHRACAT'">
        <td id="lineTableTd" align="right">
          <xsl:text></xsl:text>
          <xsl:for-each select="cac:Delivery/cac:DeliveryTerms/cbc:ID[@schemeID='INCOTERMS']">
            <xsl:apply-templates />
            <xsl:text></xsl:text>
          </xsl:for-each>
        </td>
        <td id="lineTableTd" align="right">
          <xsl:for-each select="cac:Delivery/cac:Shipment/cac:TransportHandlingUnit/cac:ActualPackage/cbc:PackagingTypeCode">
            <xsl:call-template name="PackagingType">
              <xsl:with-param name="Packaging">
                <xsl:value-of select="." />
              </xsl:with-param>
            </xsl:call-template>
            <xsl:if test="position() != last()">
              <xsl:text>- </xsl:text>
            </xsl:if>
          </xsl:for-each>
        </td>
        <td id="lineTableTd" align="right">
          <xsl:for-each select="cac:Delivery/cac:Shipment/cac:TransportHandlingUnit/cac:ActualPackage/cbc:ID">
            <xsl:value-of select="." />
            <xsl:if test="position() != last()">
              <xsl:text>- </xsl:text>
            </xsl:if>
          </xsl:for-each>
        </td>
        <td id="lineTableTd" align="right">
          <xsl:for-each select="cac:Delivery/cac:Shipment/cac:TransportHandlingUnit/cac:ActualPackage/cbc:Quantity">
            <xsl:value-of select="." />
            <xsl:if test="position() != last()">
              <xsl:text>- </xsl:text>
            </xsl:if>
          </xsl:for-each>
        </td>
        <td id="lineTableTd" align="right">
          <xsl:for-each select="cac:Delivery/cac:DeliveryAddress">
            <xsl:if test="cbc:StreetName !=''">
              <xsl:value-of select="cbc:StreetName" />
              <xsl:text></xsl:text>
            </xsl:if>
            <xsl:if test="cbc:BuildingName !=''">
              <xsl:value-of select="cbc:BuildingName" />
              <xsl:text></xsl:text>
            </xsl:if>
            <xsl:if test="cbc:BuildingNumber !=''">
              <xsl:value-of select="cbc:BuildingNumber" />
              <xsl:text></xsl:text>
            </xsl:if>
            <xsl:if test="cbc:Room !=''">
              <xsl:value-of select="cbc:Room" />
              <xsl:text></xsl:text>
            </xsl:if>
            <xsl:if test="cbc:PostalZone !=''">
              <xsl:value-of select="cbc:PostalZone" />
              <xsl:text></xsl:text>
            </xsl:if>
            <xsl:if test="cbc:CitySubdivisionName !=''">
              <xsl:value-of select="cbc:CitySubdivisionName" />
              <xsl:text></xsl:text>
            </xsl:if>
            <xsl:if test="cbc:CityName !=''">
              <xsl:value-of select="cbc:CityName" />
              <xsl:text></xsl:text>
            </xsl:if>
            <xsl:if test="cbc:Region !=''">
              <xsl:value-of select="cbc:Region" />
              <xsl:text></xsl:text>
            </xsl:if>
            <xsl:if test="cac:Country/cbc:Name !=''">
              <xsl:value-of select="cac:Country/cbc:Name" />
              <xsl:text></xsl:text>
            </xsl:if>
          </xsl:for-each>
        </td>
        <td id="lineTableTd" align="right">
          <xsl:for-each select="cac:Delivery/cac:Shipment/cac:ShipmentStage/cbc:TransportModeCode">
            <xsl:text></xsl:text>
            <xsl:call-template name="TransportMode">
              <xsl:with-param name="TransportModeType">
                <xsl:value-of select="." />
              </xsl:with-param>
            </xsl:call-template>
          </xsl:for-each>
        </td>
        <td id="lineTableTd" align="right">
          <xsl:text></xsl:text>
          <xsl:value-of select="cac:Delivery/cac:Shipment/cac:GoodsItem/cbc:RequiredCustomsID" />
        </td>
      </xsl:if>
    </tr>
  </xsl:template>
  <xsl:template match="//n1:Invoice">
    <tr id="lineTableTr">
      <td id="lineTableTd">
        <span>
          <xsl:text> </xsl:text>
        </span>
      </td>
      <td id="lineTableTd">
        <span>
          <xsl:text> </xsl:text>
        </span>
      </td>
      <td id="lineTableTd" align="right">
        <span>
          <xsl:text> </xsl:text>
        </span>
      </td>
      <td id="lineTableTd" align="right">
        <span>
          <xsl:text> </xsl:text>
        </span>
      </td>
      <td id="lineTableTd" align="right">
        <span>
          <xsl:text> </xsl:text>
        </span>
      </td>
      <td id="lineTableTd" align="right">
        <span>
          <xsl:text> </xsl:text>
        </span>
      </td>
      <xsl:if test="not($senaryo = 'IHRACAT' or $senaryo = 'İHRACAT')">
        <td id="lineTableTd" align="right">
          <xsl:text> </xsl:text>
        </td>
        <td id="lineTableTd" align="right">
          <xsl:text> </xsl:text>
        </td>
        <td id="lineTableTd" align="right">
          <xsl:text> </xsl:text>
        </td>
      </xsl:if>
      <td id="lineTableTd" align="right">
        <span>
          <xsl:text> </xsl:text>
        </span>
      </td>
      <xsl:if test="$senaryo = 'IHRACAT' or $senaryo = 'İHRACAT'">
        <td id="lineTableTd" align="right">
          <xsl:text> </xsl:text>
        </td>
        <td id="lineTableTd" align="right">
          <xsl:text> </xsl:text>
        </td>
        <td id="lineTableTd" align="right">
          <xsl:text> </xsl:text>
        </td>
        <td id="lineTableTd" align="right">
          <xsl:text> </xsl:text>
        </td>
        <td id="lineTableTd" align="right">
          <xsl:text> </xsl:text>
        </td>
        <td id="lineTableTd" align="right">
          <xsl:text> </xsl:text>
        </td>
        <td id="lineTableTd" align="right">
          <xsl:text> </xsl:text>
        </td>
        <td id="lineTableTd" align="right">
          <xsl:text> </xsl:text>
        </td>
        <td id="lineTableTd" align="right">
          <xsl:text> </xsl:text>
        </td>
        <td id="lineTableTd" align="right">
          <xsl:text> </xsl:text>
        </td>
      </xsl:if>
    </tr>
  </xsl:template>
  <xsl:template name="Curr_Type">
    <xsl:param name="format" />
    <xsl:param name="valuePath" />
    <xsl:value-of select="format-number($valuePath, $format, 'european')" />
    <xsl:if test="$valuePath/@currencyID">
      <xsl:text></xsl:text>
      <xsl:choose>
        <xsl:when test="$valuePath/@currencyID = 'TRL' or $valuePath/@currencyID = 'TRY'">
          <xsl:text>TL</xsl:text>
        </xsl:when>
        <xsl:otherwise>
          <xsl:value-of select="$valuePath/@currencyID" />
        </xsl:otherwise>
      </xsl:choose>
    </xsl:if>
  </xsl:template>
  <xsl:template name="TransportMode">
    <xsl:param name="TransportModeType" />
    <xsl:choose>
      <xsl:when test="$TransportModeType=1">Deniz Taşımacılığı</xsl:when>
      <xsl:when test="$TransportModeType=2">Demiryolu Taşımacılığı</xsl:when>
      <xsl:when test="$TransportModeType=3">Karayolu Taşımacılığı</xsl:when>
      <xsl:when test="$TransportModeType=4">Hava Taşımacılığı</xsl:when>
      <xsl:when test="$TransportModeType=5">Posta</xsl:when>
      <xsl:when test="$TransportModeType=6">Kombine Taşımacılık</xsl:when>
      <xsl:when test="$TransportModeType=7">Sabit Nakliyat</xsl:when>
      <xsl:when test="$TransportModeType=8">Ülke İçi Su Taşımacılığı</xsl:when>
      <xsl:when test="$TransportModeType=9">Uygun Olmayan Taşıma Şekli</xsl:when>
      <xsl:otherwise>
        <xsl:value-of select="$TransportModeType" />
      </xsl:otherwise>
    </xsl:choose>
  </xsl:template>
  <xsl:template name="PackagingType">
    <xsl:param name="Packaging" />
    <xsl:choose>
      <xsl:when test="$Packaging='TD'">Açılır Kapanır Tüp / Portatif Tüp</xsl:when>
      <xsl:when test="$Packaging='AE'">Aerosol</xsl:when>
      <xsl:when test="$Packaging='NT'">Ağ</xsl:when>
      <xsl:when test="$Packaging='CK'">Ahşap Varil</xsl:when>
      <xsl:when test="$Packaging='PK'">Ambalaj</xsl:when>
      <xsl:when test="$Packaging='CE'">Balık Sepeti</xsl:when>
      <xsl:when test="$Packaging='SU'">Bavul</xsl:when>
      <xsl:when test="$Packaging='CB'">Bira Kasası</xsl:when>
      <xsl:when test="$Packaging='BB'">Bobin</xsl:when>
      <xsl:when test="$Packaging='BE'">Bohça</xsl:when>
      <xsl:when test="$Packaging='PI'">Boru</xsl:when>
      <xsl:when test="$Packaging='TR'">Büyük Eşya Sandığı</xsl:when>
      <xsl:when test="$Packaging='BU'">Büyük Fıçı</xsl:when>
      <xsl:when test="$Packaging='TO'">Büyük Fıçı (250 Galonluk)</xsl:when>
      <xsl:when test="$Packaging='HG'">Büyük Fıçı (250 Lt'lik)</xsl:when>
      <xsl:when test="$Packaging='VI'">Cam Şişe</xsl:when>
      <xsl:when test="$Packaging='BT'">Civata</xsl:when>
      <xsl:when test="$Packaging='CZ'">Çatır Bezi</xsl:when>
      <xsl:when test="$Packaging='BG'">Çanta</xsl:when>
      <xsl:when test="$Packaging='TC'">Çay Sandığı</xsl:when>
      <xsl:when test="$Packaging='SW'">Çekme - Sarma</xsl:when>
      <xsl:when test="$Packaging='FR'">Çerçeve</xsl:when>
      <xsl:when test="$Packaging='FD'">Çerçeveli Kasa</xsl:when>
      <xsl:when test="$Packaging='MB'">Çok Gözlü Çanta</xsl:when>
      <xsl:when test="$Packaging='PT'">Çömlek</xsl:when>
      <xsl:when test="$Packaging='BR'">Çubuk</xsl:when>
      <xsl:when test="$Packaging='SA'">Çuval</xsl:when>
      <xsl:when test="$Packaging='FL'">Dar Boyunlu Küçük Şişe</xsl:when>
      <xsl:when test="$Packaging='SC'">Dar Kasa</xsl:when>
      <xsl:when test="$Packaging='DR'">Davul</xsl:when>
      <xsl:when test="$Packaging='JC'">Dikdörtgen Bidon (20Lt'lik)</xsl:when>
      <xsl:when test="$Packaging='CA'">Dikdörtgen Madeni Kap</xsl:when>
      <xsl:when test="$Packaging='TK'">Dikdörtgen Tank</xsl:when>
      <xsl:when test="$Packaging='CU'">Fincan</xsl:when>
      <xsl:when test="$Packaging='FP'">Fotoğraf Filmleri Paketi</xsl:when>
      <xsl:when test="$Packaging='GB'">Gaz Şişesi</xsl:when>
      <xsl:when test="$Packaging='GE'">Gemici Sandığı</xsl:when>
      <xsl:when test="$Packaging='SE'">Gemici Sandığı</xsl:when>
      <xsl:when test="$Packaging='TB'">Gerdel</xsl:when>
      <xsl:when test="$Packaging='PL'">Gerdel</xsl:when>
      <xsl:when test="$Packaging='VG'">Hacim, Gaz (1031 M Bar Ve 15C)</xsl:when>
      <xsl:when test="$Packaging='VR'">Hacim, Katı, Granül Parçacıkları ('Taneler')</xsl:when>
      <xsl:when test="$Packaging='VY'">Hacim, Katı, İnce Parçacıkları ('Toz')</xsl:when>
      <xsl:when test="$Packaging='VQ'">Hacim, Sıvı Hale Getirilmiş Gaz (Anormal Isı/Basınç)</xsl:when>
      <xsl:when test="$Packaging='RG'">Halka (Çember)</xsl:when>
      <xsl:when test="$Packaging='MT'">Hasır</xsl:when>
      <xsl:when test="$Packaging='PH'">İbrik</xsl:when>
      <xsl:when test="$Packaging='SD'">İğ</xsl:when>
      <xsl:when test="$Packaging='SK'">İskelet Kasa</xsl:when>
      <xsl:when test="$Packaging='JT'">Jüt (Kenevir) Torba</xsl:when>
      <xsl:when test="$Packaging='CG'">Kafes</xsl:when>
      <xsl:when test="$Packaging='PN'">Kalas</xsl:when>
      <xsl:when test="$Packaging='CL'">Kangal</xsl:when>
      <xsl:when test="$Packaging='BI'">Kap</xsl:when>
      <xsl:when test="$Packaging='HR'">Kapaklı Sepet</xsl:when>
      <xsl:when test="$Packaging='CV'">Kapalı</xsl:when>
      <xsl:when test="$Packaging='CR'">Kasa</xsl:when>
      <xsl:when test="$Packaging='JR'">Kavanoz</xsl:when>
      <xsl:when test="$Packaging='PO'">Kese</xsl:when>
      <xsl:when test="$Packaging='MX'">Kibrit Kutusu</xsl:when>
      <xsl:when test="$Packaging='GI'">Kiriş</xsl:when>
      <xsl:when test="$Packaging='TS'">Kiriş</xsl:when>
      <xsl:when test="$Packaging='SH'">Koku Yastığı</xsl:when>
      <xsl:when test="$Packaging='PC'">Koli</xsl:when>
      <xsl:when test="$Packaging='KN'">Konteyner</xsl:when>
      <xsl:when test="$Packaging='DJ'">Korumalı, Hasır Büyük Şişe</xsl:when>
      <xsl:when test="$Packaging='BV'">Korumalı, Soğan Şeklinde Şişe</xsl:when>
      <xsl:when test="$Packaging='AM'">Korumalı Ampül</xsl:when>
      <xsl:when test="$Packaging='BP'">Korumalı Balon</xsl:when>
      <xsl:when test="$Packaging='CP'">Korumalı Damacana</xsl:when>
      <xsl:when test="$Packaging='BQ'">Korumalı Silindirik Şişe</xsl:when>
      <xsl:when test="$Packaging='DP'">Korumasız, Hasırlı Büyük Şişe</xsl:when>
      <xsl:when test="$Packaging='BS'">Korumasız, Soğan Şeklinde Şişe</xsl:when>
      <xsl:when test="$Packaging='AP'">Korumasız Ampül</xsl:when>
      <xsl:when test="$Packaging='BF'">Korumasız Balon</xsl:when>
      <xsl:when test="$Packaging='CO'">Korumasız Damacana</xsl:when>
      <xsl:when test="$Packaging='BO'">Korumasız Silindirik Şişe</xsl:when>
      <xsl:when test="$Packaging='BJ'">Kova</xsl:when>
      <xsl:when test="$Packaging='BX'">Kutu</xsl:when>
      <xsl:when test="$Packaging='KG'">Küçük Fıçı</xsl:when>
      <xsl:when test="$Packaging='FO'">Küçük Sandık</xsl:when>
      <xsl:when test="$Packaging='LG'">Kütük</xsl:when>
      <xsl:when test="$Packaging='RL'">Makara</xsl:when>
      <xsl:when test="$Packaging='FC'">Meyve Kasası</xsl:when>
      <xsl:when test="$Packaging='CT'">Mukavva Kutu</xsl:when>
      <xsl:when test="$Packaging='PA'">Paket</xsl:when>
      <xsl:when test="$Packaging='NE'">Paketlenmemiş Veya Ambalajlanmamış</xsl:when>
      <xsl:when test="$Packaging='AT'">Püskürgeç</xsl:when>
      <xsl:when test="$Packaging='RO'">Rulo</xsl:when>
      <xsl:when test="$Packaging='SM'">Sac</xsl:when>
      <xsl:when test="$Packaging='CH'">Sandık</xsl:when>
      <xsl:when test="$Packaging='CF'">Sandık</xsl:when>
      <xsl:when test="$Packaging='BK'">Sepet</xsl:when>
      <xsl:when test="$Packaging='WB'">Sepet Şişe</xsl:when>
      <xsl:when test="$Packaging='BN'">Sıkıştırılmamış Balya</xsl:when>
      <xsl:when test="$Packaging='BL'">Sıkıştırılmış Balya</xsl:when>
      <xsl:when test="$Packaging='CY'">Silindirik</xsl:when>
      <xsl:when test="$Packaging='JY'">Silindirik Bidon (20Lt'lik)</xsl:when>
      <xsl:when test="$Packaging='TY'">Silindirik Tank</xsl:when>
      <xsl:when test="$Packaging='CX'">Silindirik Teneke Kutu</xsl:when>
      <xsl:when test="$Packaging='RD'">Sopa</xsl:when>
      <xsl:when test="$Packaging='JG'">Sürahi</xsl:when>
      <xsl:when test="$Packaging='BC'">Şişe Kasası</xsl:when>
      <xsl:when test="$Packaging='ST'">Tabaka</xsl:when>
      <xsl:when test="$Packaging='PG'">Tabla</xsl:when>
      <xsl:when test="$Packaging='PU'">Tabla Paketi / Tabla</xsl:when>
      <xsl:when test="$Packaging='CJ'">Tabut</xsl:when>
      <xsl:when test="$Packaging='BD'">Tahta</xsl:when>
      <xsl:when test="$Packaging='VA'">Tekne</xsl:when>
      <xsl:when test="$Packaging='TN'">Teneke Kutu</xsl:when>
      <xsl:when test="$Packaging='TU'">Küp</xsl:when>
      <xsl:when test="$Packaging='FI'">Ufak Yağ Fıçısı</xsl:when>
      <xsl:when test="$Packaging='VP'">Vakumlu Paket</xsl:when>
      <xsl:when test="$Packaging='BA'">Varil</xsl:when>
      <xsl:when test="$Packaging='CC'">Yayık</xsl:when>
      <xsl:when test="$Packaging='NS'">Yuva</xsl:when>
      <xsl:when test="$Packaging='EN'">Zarf</xsl:when>
      <xsl:otherwise>
        <xsl:value-of select="$Packaging" />
      </xsl:otherwise>
    </xsl:choose>
  </xsl:template>
  <xsl:template name="Country">
    <xsl:param name="CountryType" />
    <xsl:choose>
      <xsl:when test="$CountryType='AF'">Afganistan</xsl:when>
      <xsl:when test="$CountryType='DE'">Almanya</xsl:when>
      <xsl:when test="$CountryType='AD'">Andorra</xsl:when>
      <xsl:when test="$CountryType='AO'">Angola</xsl:when>
      <xsl:when test="$CountryType='AG'">Antigua ve Barbuda</xsl:when>
      <xsl:when test="$CountryType='AR'">Arjantin</xsl:when>
      <xsl:when test="$CountryType='AL'">Arnavutluk</xsl:when>
      <xsl:when test="$CountryType='AW'">Aruba</xsl:when>
      <xsl:when test="$CountryType='AU'">Avustralya</xsl:when>
      <xsl:when test="$CountryType='AT'">Avusturya</xsl:when>
      <xsl:when test="$CountryType='AZ'">Azerbaycan</xsl:when>
      <xsl:when test="$CountryType='BS'">Bahamalar</xsl:when>
      <xsl:when test="$CountryType='BH'">Bahreyn</xsl:when>
      <xsl:when test="$CountryType='BD'">Bangladeş</xsl:when>
      <xsl:when test="$CountryType='BB'">Barbados</xsl:when>
      <xsl:when test="$CountryType='EH'">Batı Sahra (MA)</xsl:when>
      <xsl:when test="$CountryType='BE'">Belçika</xsl:when>
      <xsl:when test="$CountryType='BZ'">Belize</xsl:when>
      <xsl:when test="$CountryType='BJ'">Benin</xsl:when>
      <xsl:when test="$CountryType='BM'">Bermuda</xsl:when>
      <xsl:when test="$CountryType='BY'">Beyaz Rusya</xsl:when>
      <xsl:when test="$CountryType='BT'">Bhutan</xsl:when>
      <xsl:when test="$CountryType='AE'">Birleşik Arap Emirlikleri</xsl:when>
      <xsl:when test="$CountryType='US'">Birleşik Devletler</xsl:when>
      <xsl:when test="$CountryType='GB'">Birleşik Krallık</xsl:when>
      <xsl:when test="$CountryType='BO'">Bolivya</xsl:when>
      <xsl:when test="$CountryType='BA'">Bosna-Hersek</xsl:when>
      <xsl:when test="$CountryType='BW'">Botsvana</xsl:when>
      <xsl:when test="$CountryType='BR'">Brezilya</xsl:when>
      <xsl:when test="$CountryType='BN'">Bruney</xsl:when>
      <xsl:when test="$CountryType='BG'">Bulgaristan</xsl:when>
      <xsl:when test="$CountryType='BF'">Burkina Faso</xsl:when>
      <xsl:when test="$CountryType='BI'">Burundi</xsl:when>
      <xsl:when test="$CountryType='TD'">Çad</xsl:when>
      <xsl:when test="$CountryType='KY'">Cayman Adaları</xsl:when>
      <xsl:when test="$CountryType='GI'">Cebelitarık (GB)</xsl:when>
      <xsl:when test="$CountryType='CZ'">Çek Cumhuriyeti</xsl:when>
      <xsl:when test="$CountryType='DZ'">Cezayir</xsl:when>
      <xsl:when test="$CountryType='DJ'">Cibuti</xsl:when>
      <xsl:when test="$CountryType='CN'">Çin</xsl:when>
      <xsl:when test="$CountryType='DK'">Danimarka</xsl:when>
      <xsl:when test="$CountryType='CD'">Demokratik Kongo Cumhuriyeti</xsl:when>
      <xsl:when test="$CountryType='TL'">Doğu Timor</xsl:when>
      <xsl:when test="$CountryType='DO'">Dominik Cumhuriyeti</xsl:when>
      <xsl:when test="$CountryType='DM'">Dominika</xsl:when>
      <xsl:when test="$CountryType='EC'">Ekvador</xsl:when>
      <xsl:when test="$CountryType='GQ'">Ekvator Ginesi</xsl:when>
      <xsl:when test="$CountryType='SV'">El Salvador</xsl:when>
      <xsl:when test="$CountryType='ID'">Endonezya</xsl:when>
      <xsl:when test="$CountryType='ER'">Eritre</xsl:when>
      <xsl:when test="$CountryType='AM'">Ermenistan</xsl:when>
      <xsl:when test="$CountryType='MF'">Ermiş Martin (FR)</xsl:when>
      <xsl:when test="$CountryType='EE'">Estonya</xsl:when>
      <xsl:when test="$CountryType='ET'">Etiyopya</xsl:when>
      <xsl:when test="$CountryType='FK'">Falkland Adaları</xsl:when>
      <xsl:when test="$CountryType='FO'">Faroe Adaları (DK)</xsl:when>
      <xsl:when test="$CountryType='MA'">Fas</xsl:when>
      <xsl:when test="$CountryType='FJ'">Fiji</xsl:when>
      <xsl:when test="$CountryType='CI'">Fildişi Sahili</xsl:when>
      <xsl:when test="$CountryType='PH'">Filipinler</xsl:when>
      <xsl:when test="$CountryType='FI'">Finlandiya</xsl:when>
      <xsl:when test="$CountryType='FR'">Fransa</xsl:when>
      <xsl:when test="$CountryType='GF'">Fransız Guyanası (FR)</xsl:when>
      <xsl:when test="$CountryType='PF'">Fransız Polinezyası (FR)</xsl:when>
      <xsl:when test="$CountryType='GA'">Gabon</xsl:when>
      <xsl:when test="$CountryType='GM'">Gambiya</xsl:when>
      <xsl:when test="$CountryType='GH'">Gana</xsl:when>
      <xsl:when test="$CountryType='GN'">Gine</xsl:when>
      <xsl:when test="$CountryType='GW'">Gine Bissau</xsl:when>
      <xsl:when test="$CountryType='GD'">Grenada</xsl:when>
      <xsl:when test="$CountryType='GL'">Grönland (DK)</xsl:when>
      <xsl:when test="$CountryType='GP'">Guadeloupe (FR)</xsl:when>
      <xsl:when test="$CountryType='GT'">Guatemala</xsl:when>
      <xsl:when test="$CountryType='GG'">Guernsey (GB)</xsl:when>
      <xsl:when test="$CountryType='ZA'">Güney Afrika</xsl:when>
      <xsl:when test="$CountryType='KR'">Güney Kore</xsl:when>
      <xsl:when test="$CountryType='GE'">Gürcistan</xsl:when>
      <xsl:when test="$CountryType='GY'">Guyana</xsl:when>
      <xsl:when test="$CountryType='HT'">Haiti</xsl:when>
      <xsl:when test="$CountryType='IN'">Hindistan</xsl:when>
      <xsl:when test="$CountryType='HR'">Hırvatistan</xsl:when>
      <xsl:when test="$CountryType='NL'">Hollanda</xsl:when>
      <xsl:when test="$CountryType='HN'">Honduras</xsl:when>
      <xsl:when test="$CountryType='HK'">Hong Kong (CN)</xsl:when>
      <xsl:when test="$CountryType='VG'">İngiliz Virjin Adaları</xsl:when>
      <xsl:when test="$CountryType='IQ'">Irak</xsl:when>
      <xsl:when test="$CountryType='IR'">İran</xsl:when>
      <xsl:when test="$CountryType='IE'">İrlanda</xsl:when>
      <xsl:when test="$CountryType='ES'">İspanya</xsl:when>
      <xsl:when test="$CountryType='IL'">İsrail</xsl:when>
      <xsl:when test="$CountryType='SE'">İsveç</xsl:when>
      <xsl:when test="$CountryType='CH'">İsviçre</xsl:when>
      <xsl:when test="$CountryType='IT'">İtalya</xsl:when>
      <xsl:when test="$CountryType='IS'">İzlanda</xsl:when>
      <xsl:when test="$CountryType='JM'">Jamaika</xsl:when>
      <xsl:when test="$CountryType='JP'">Japonya</xsl:when>
      <xsl:when test="$CountryType='JE'">Jersey (GB)</xsl:when>
      <xsl:when test="$CountryType='KH'">Kamboçya</xsl:when>
      <xsl:when test="$CountryType='CM'">Kamerun</xsl:when>
      <xsl:when test="$CountryType='CA'">Kanada</xsl:when>
      <xsl:when test="$CountryType='ME'">Karadağ</xsl:when>
      <xsl:when test="$CountryType='QA'">Katar</xsl:when>
      <xsl:when test="$CountryType='KZ'">Kazakistan</xsl:when>
      <xsl:when test="$CountryType='KE'">Kenya</xsl:when>
      <xsl:when test="$CountryType='CY'">Kıbrıs</xsl:when>
      <xsl:when test="$CountryType='KG'">Kırgızistan</xsl:when>
      <xsl:when test="$CountryType='KI'">Kiribati</xsl:when>
      <xsl:when test="$CountryType='CO'">Kolombiya</xsl:when>
      <xsl:when test="$CountryType='KM'">Komorlar</xsl:when>
      <xsl:when test="$CountryType='CG'">Kongo Cumhuriyeti</xsl:when>
      <xsl:when test="$CountryType='KV'">Kosova (RS)</xsl:when>
      <xsl:when test="$CountryType='CR'">Kosta Rika</xsl:when>
      <xsl:when test="$CountryType='CU'">Küba</xsl:when>
      <xsl:when test="$CountryType='KW'">Kuveyt</xsl:when>
      <xsl:when test="$CountryType='KP'">Kuzey Kore</xsl:when>
      <xsl:when test="$CountryType='LA'">Laos</xsl:when>
      <xsl:when test="$CountryType='LS'">Lesoto</xsl:when>
      <xsl:when test="$CountryType='LV'">Letonya</xsl:when>
      <xsl:when test="$CountryType='LR'">Liberya</xsl:when>
      <xsl:when test="$CountryType='LY'">Libya</xsl:when>
      <xsl:when test="$CountryType='LI'">Lihtenştayn</xsl:when>
      <xsl:when test="$CountryType='LT'">Litvanya</xsl:when>
      <xsl:when test="$CountryType='LB'">Lübnan</xsl:when>
      <xsl:when test="$CountryType='LU'">Lüksemburg</xsl:when>
      <xsl:when test="$CountryType='HU'">Macaristan</xsl:when>
      <xsl:when test="$CountryType='MG'">Madagaskar</xsl:when>
      <xsl:when test="$CountryType='MO'">Makao (CN)</xsl:when>
      <xsl:when test="$CountryType='MK'">Makedonya</xsl:when>
      <xsl:when test="$CountryType='MW'">Malavi</xsl:when>
      <xsl:when test="$CountryType='MV'">Maldivler</xsl:when>
      <xsl:when test="$CountryType='MY'">Malezya</xsl:when>
      <xsl:when test="$CountryType='ML'">Mali</xsl:when>
      <xsl:when test="$CountryType='MT'">Malta</xsl:when>
      <xsl:when test="$CountryType='IM'">Man Adası (GB)</xsl:when>
      <xsl:when test="$CountryType='MH'">Marshall Adaları</xsl:when>
      <xsl:when test="$CountryType='MQ'">Martinique (FR)</xsl:when>
      <xsl:when test="$CountryType='MU'">Mauritius</xsl:when>
      <xsl:when test="$CountryType='YT'">Mayotte (FR)</xsl:when>
      <xsl:when test="$CountryType='MX'">Meksika</xsl:when>
      <xsl:when test="$CountryType='FM'">Mikronezya</xsl:when>
      <xsl:when test="$CountryType='EG'">Mısır</xsl:when>
      <xsl:when test="$CountryType='MN'">Moğolistan</xsl:when>
      <xsl:when test="$CountryType='MD'">Moldova</xsl:when>
      <xsl:when test="$CountryType='MC'">Monako</xsl:when>
      <xsl:when test="$CountryType='MR'">Moritanya</xsl:when>
      <xsl:when test="$CountryType='MZ'">Mozambik</xsl:when>
      <xsl:when test="$CountryType='MM'">Myanmar</xsl:when>
      <xsl:when test="$CountryType='NA'">Namibya</xsl:when>
      <xsl:when test="$CountryType='NR'">Nauru</xsl:when>
      <xsl:when test="$CountryType='NP'">Nepal</xsl:when>
      <xsl:when test="$CountryType='NE'">Nijer</xsl:when>
      <xsl:when test="$CountryType='NG'">Nijerya</xsl:when>
      <xsl:when test="$CountryType='NI'">Nikaragua</xsl:when>
      <xsl:when test="$CountryType='NO'">Norveç</xsl:when>
      <xsl:when test="$CountryType='CF'">Orta Afrika Cumhuriyeti</xsl:when>
      <xsl:when test="$CountryType='UZ'">Özbekistan</xsl:when>
      <xsl:when test="$CountryType='PK'">Pakistan</xsl:when>
      <xsl:when test="$CountryType='PW'">Palau</xsl:when>
      <xsl:when test="$CountryType='PA'">Panama</xsl:when>
      <xsl:when test="$CountryType='PG'">Papua Yeni Gine</xsl:when>
      <xsl:when test="$CountryType='PY'">Paraguay</xsl:when>
      <xsl:when test="$CountryType='PE'">Peru</xsl:when>
      <xsl:when test="$CountryType='PL'">Polonya</xsl:when>
      <xsl:when test="$CountryType='PT'">Portekiz</xsl:when>
      <xsl:when test="$CountryType='PR'">Porto Riko (US)</xsl:when>
      <xsl:when test="$CountryType='RE'">Réunion (FR)</xsl:when>
      <xsl:when test="$CountryType='RO'">Romanya</xsl:when>
      <xsl:when test="$CountryType='RW'">Ruanda</xsl:when>
      <xsl:when test="$CountryType='RU'">Rusya</xsl:when>
      <xsl:when test="$CountryType='BL'">Saint Barthélemy (FR)</xsl:when>
      <xsl:when test="$CountryType='KN'">Saint Kitts ve Nevis</xsl:when>
      <xsl:when test="$CountryType='LC'">Saint Lucia</xsl:when>
      <xsl:when test="$CountryType='PM'">Saint Pierre ve Miquelon (FR)</xsl:when>
      <xsl:when test="$CountryType='VC'">Saint Vincent ve Grenadinler</xsl:when>
      <xsl:when test="$CountryType='WS'">Samoa</xsl:when>
      <xsl:when test="$CountryType='SM'">San Marino</xsl:when>
      <xsl:when test="$CountryType='ST'">São Tomé ve Príncipe</xsl:when>
      <xsl:when test="$CountryType='SN'">Senegal</xsl:when>
      <xsl:when test="$CountryType='SC'">Seyşeller</xsl:when>
      <xsl:when test="$CountryType='SL'">Sierra Leone</xsl:when>
      <xsl:when test="$CountryType='CL'">Şili</xsl:when>
      <xsl:when test="$CountryType='SG'">Singapur</xsl:when>
      <xsl:when test="$CountryType='RS'">Sırbistan</xsl:when>
      <xsl:when test="$CountryType='SK'">Slovakya Cumhuriyeti</xsl:when>
      <xsl:when test="$CountryType='SI'">Slovenya</xsl:when>
      <xsl:when test="$CountryType='SB'">Solomon Adaları</xsl:when>
      <xsl:when test="$CountryType='SO'">Somali</xsl:when>
      <xsl:when test="$CountryType='SS'">South Sudan</xsl:when>
      <xsl:when test="$CountryType='SJ'">Spitsbergen (NO)</xsl:when>
      <xsl:when test="$CountryType='LK'">Sri Lanka</xsl:when>
      <xsl:when test="$CountryType='SD'">Sudan</xsl:when>
      <xsl:when test="$CountryType='SR'">Surinam</xsl:when>
      <xsl:when test="$CountryType='SY'">Suriye</xsl:when>
      <xsl:when test="$CountryType='SA'">Suudi Arabistan</xsl:when>
      <xsl:when test="$CountryType='SZ'">Svaziland</xsl:when>
      <xsl:when test="$CountryType='TJ'">Tacikistan</xsl:when>
      <xsl:when test="$CountryType='TZ'">Tanzanya</xsl:when>
      <xsl:when test="$CountryType='TH'">Tayland</xsl:when>
      <xsl:when test="$CountryType='TW'">Tayvan</xsl:when>
      <xsl:when test="$CountryType='TG'">Togo</xsl:when>
      <xsl:when test="$CountryType='TO'">Tonga</xsl:when>
      <xsl:when test="$CountryType='TT'">Trinidad ve Tobago</xsl:when>
      <xsl:when test="$CountryType='TN'">Tunus</xsl:when>
      <xsl:when test="$CountryType='TR'">Türkiye</xsl:when>
      <xsl:when test="$CountryType='TM'">Türkmenistan</xsl:when>
      <xsl:when test="$CountryType='TC'">Turks ve Caicos</xsl:when>
      <xsl:when test="$CountryType='TV'">Tuvalu</xsl:when>
      <xsl:when test="$CountryType='UG'">Uganda</xsl:when>
      <xsl:when test="$CountryType='UA'">Ukrayna</xsl:when>
      <xsl:when test="$CountryType='OM'">Umman</xsl:when>
      <xsl:when test="$CountryType='JO'">Ürdün</xsl:when>
      <xsl:when test="$CountryType='UY'">Uruguay</xsl:when>
      <xsl:when test="$CountryType='VU'">Vanuatu</xsl:when>
      <xsl:when test="$CountryType='VA'">Vatikan</xsl:when>
      <xsl:when test="$CountryType='VE'">Venezuela</xsl:when>
      <xsl:when test="$CountryType='VN'">Vietnam</xsl:when>
      <xsl:when test="$CountryType='WF'">Wallis ve Futuna (FR)</xsl:when>
      <xsl:when test="$CountryType='YE'">Yemen</xsl:when>
      <xsl:when test="$CountryType='NC'">Yeni Kaledonya (FR)</xsl:when>
      <xsl:when test="$CountryType='NZ'">Yeni Zelanda</xsl:when>
      <xsl:when test="$CountryType='CV'">Yeşil Burun Adaları</xsl:when>
      <xsl:when test="$CountryType='GR'">Yunanistan</xsl:when>
      <xsl:when test="$CountryType='ZM'">Zambiya</xsl:when>
      <xsl:when test="$CountryType='ZW'">Zimbabve</xsl:when>
      <xsl:when test="$CountryType='AI'">Anguilla</xsl:when>
      <xsl:when test="$CountryType='AQ'">Antartika</xsl:when>
      <xsl:when test="$CountryType='AS'">Amerikan Samoa</xsl:when>
      <xsl:when test="$CountryType='AX'">Aland Adaları</xsl:when>
      <xsl:when test="$CountryType='BV'">Bouvet Adası</xsl:when>
      <xsl:when test="$CountryType='CK'">Cook Adaları</xsl:when>
      <xsl:when test="$CountryType='CX'">Christmas Adası</xsl:when>
      <xsl:when test="$CountryType='CW'">Curaçao</xsl:when>
      <xsl:when test="$CountryType='CC'">Cocos Adaları</xsl:when>
      <xsl:when test="$CountryType='BQ'">Bonaire, Sint Eustatius and Saba</xsl:when>
      <xsl:when test="$CountryType='GS'">Güney Gürcistan ve Güney Sandviç Adaları</xsl:when>
      <xsl:when test="$CountryType='GU'">Guam</xsl:when>
      <xsl:when test="$CountryType='HM'">Heard Adası and McDonald Adaları</xsl:when>
      <xsl:when test="$CountryType='IO'">Britanya Hindistan Okyanus Bölgesi</xsl:when>
      <xsl:when test="$CountryType='MP'">Kuzey Mariana Adaları</xsl:when>
      <xsl:when test="$CountryType='MS'">Montserrat</xsl:when>
      <xsl:when test="$CountryType='NF'">Norfolk Adası</xsl:when>
      <xsl:when test="$CountryType='NU'">Niue</xsl:when>
      <xsl:when test="$CountryType='PN'">Pitcairn</xsl:when>
      <xsl:when test="$CountryType='PS'">Filistin Devleti</xsl:when>
      <xsl:when test="$CountryType='SH'">Saint Helena, Ascension and Tristan Da Cunha</xsl:when>
      <xsl:when test="$CountryType='SX'">Sint Maarten (Dutch Part)</xsl:when>
      <xsl:when test="$CountryType='TF'">French Southern Territories</xsl:when>
      <xsl:when test="$CountryType='TK'">Tokelau</xsl:when>
      <xsl:when test="$CountryType='UM'">United States Minor Outlying Islands</xsl:when>
      <xsl:when test="$CountryType='VI'">Virgin Islands, U.S.</xsl:when>
      <xsl:otherwise>
        <xsl:value-of select="$CountryType" />
      </xsl:otherwise>
    </xsl:choose>
  </xsl:template>
  <xsl:template name="Party_Title">
    <xsl:param name="PartyType" />
    <td align="left">
      <xsl:if test="cac:PartyName !=''">
        <xsl:value-of select="cac:PartyName/cbc:Name" />
        <br />
      </xsl:if>
      <xsl:for-each select="cac:Person">
        <xsl:for-each select="cbc:Title">
          <xsl:if test=". !=''">
            <xsl:apply-templates />
            <xsl:text> </xsl:text>
          </xsl:if>
        </xsl:for-each>
        <xsl:for-each select="cbc:FirstName">
          <xsl:if test=". !=''">
            <xsl:apply-templates />
            <xsl:text> </xsl:text>
          </xsl:if>
        </xsl:for-each>
        <xsl:for-each select="cbc:MiddleName">
          <xsl:if test=". !=''">
            <xsl:apply-templates />
            <xsl:text>  </xsl:text>
          </xsl:if>
        </xsl:for-each>
        <xsl:for-each select="cbc:FamilyName">
          <xsl:if test=". !=''">
            <xsl:apply-templates />
            <xsl:text> </xsl:text>
          </xsl:if>
        </xsl:for-each>
        <xsl:for-each select="cbc:NameSuffix">
          <xsl:apply-templates />
        </xsl:for-each>
        <xsl:if test="$PartyType='TAXFREE'">
          <br />
          <xsl:if test="cac:IdentityDocumentReference/cbc:ID != ''">
            <xsl:text>Pasaport No: </xsl:text>
            <xsl:value-of select="cac:IdentityDocumentReference/cbc:ID" />
            <br />
          </xsl:if>
          <xsl:if test="cbc:NationalityID != ''">
            <xsl:text>Ülkesi: </xsl:text>
            <xsl:for-each select="cbc:NationalityID">
              <xsl:call-template name="Country">
                <xsl:with-param name="CountryType">
                  <xsl:value-of select="." />
                </xsl:with-param>
              </xsl:call-template>
            </xsl:for-each>
          </xsl:if>
        </xsl:if>
      </xsl:for-each>
    </td>
  </xsl:template>
  <xsl:template name="Party_Adress">
    <xsl:param name="PartyType" />
    <td align="left">
      <xsl:for-each select="cac:PostalAddress">
        <xsl:for-each select="cbc:StreetName">
          <xsl:if test=". != ''">
            <xsl:apply-templates />
            <xsl:text> </xsl:text>
          </xsl:if>
        </xsl:for-each>
        <xsl:for-each select="cbc:BuildingName">
          <xsl:if test=".!= ''">
            <xsl:apply-templates />
            <xsl:text> </xsl:text>
          </xsl:if>
        </xsl:for-each>
        <xsl:for-each select="cbc:BuildingNumber">
          <xsl:if test=".!= ''">
            <xsl:text>No:</xsl:text>
            <xsl:apply-templates />
            <xsl:text> </xsl:text>
          </xsl:if>
        </xsl:for-each>
        <xsl:if test="cbc:StreetName !='' or cbc:BuildingName !='' or cbc:BuildingNumber !=''">
          <br />
        </xsl:if>
        <xsl:for-each select="cbc:Room">
          <xsl:if test=".!=''">
            <xsl:text>Kapı No:</xsl:text>
            <xsl:apply-templates />
            <xsl:text> </xsl:text>
            <br />
          </xsl:if>
        </xsl:for-each>
        <xsl:for-each select="cbc:PostalZone">
          <xsl:if test=". != ''">
            <xsl:apply-templates />
            <xsl:text> </xsl:text>
          </xsl:if>
        </xsl:for-each>
        <xsl:for-each select="cbc:CitySubdivisionName">
          <xsl:apply-templates />
        </xsl:for-each>
        <xsl:if test="cbc:CitySubdivisionName and cbc:CityName != ''">
          <xsl:text>/ </xsl:text>
        </xsl:if>
        <xsl:for-each select="cbc:CityName">
          <xsl:if test=". != ''">
            <xsl:apply-templates />
            <xsl:text> </xsl:text>
          </xsl:if>
        </xsl:for-each>
        <xsl:if test="$PartyType!='OTHER' and $PartyType!='TAXFREE'">
          <xsl:if test="cac:Country/cbc:Name != ''">
            <br />
            <xsl:value-of select="cac:Country/cbc:Name" />
          </xsl:if>
        </xsl:if>
      </xsl:for-each>
      <xsl:if test="$PartyType='EXPORT'">
        <xsl:for-each select="cac:PartyLegalEntity">
          <xsl:for-each select="cbc:CompanyID">
            <xsl:if test=". != ''">
              <br />
              <xsl:text>Ülkesindeki VKN: </xsl:text>
              <xsl:value-of select="." />
            </xsl:if>
          </xsl:for-each>
          <xsl:for-each select="cbc:RegistrationName">
            <xsl:if test=". != ''">
              <br />
              <xsl:text>Resmi Unvan: </xsl:text>
              <xsl:value-of select="." />
            </xsl:if>
          </xsl:for-each>
        </xsl:for-each>
      </xsl:if>
    </td>
  </xsl:template>
  <xsl:template name="Party_Other">
    <xsl:param name="PartyType" />
    <xsl:for-each select="cbc:WebsiteURI">
      <xsl:if test=". !=''">
        <tr align="left">
          <td>
            <xsl:text>Web Sitesi: wwww.aycanalarm.com.tr</xsl:text>
            <xsl:value-of select="." />
          </td>
        </tr>
      </xsl:if>
    </xsl:for-each>
    <xsl:for-each select="cac:Contact/cbc:ElectronicMail">
      <xsl:if test=". !=''">
        <tr align="left">
          <td>
            <xsl:text>E-Posta: </xsl:text>
            <xsl:value-of select="." />
          </td>
        </tr>
      </xsl:if>
    </xsl:for-each>
    <xsl:for-each select="cac:Contact">
      <xsl:if test="cbc:Telephone != '' or cbc:Telefax != ''">
        <tr align="left">
          <td align="left">
            <xsl:for-each select="cbc:Telephone">
              <xsl:if test=". !=''">
                <xsl:text>Tel: </xsl:text>
                <xsl:apply-templates />
              </xsl:if>
            </xsl:for-each>
            <xsl:for-each select="cbc:Telefax">
              <xsl:if test=". !=''">
                <xsl:text> Fax: </xsl:text>
                <xsl:apply-templates />
              </xsl:if>
            </xsl:for-each>
            <xsl:text> </xsl:text>
          </td>
        </tr>
      </xsl:if>
    </xsl:for-each>
    <xsl:if test="$PartyType!='TAXFREE' and $PartyType!='EXPORT'">
      <xsl:for-each select="cac:PartyTaxScheme/cac:TaxScheme/cbc:Name">
        <xsl:if test=". !=''">
          <tr align="left">
            <td>
              <xsl:text>Vergi Dairesi: </xsl:text>
              <xsl:apply-templates />
            </td>
          </tr>
        </xsl:if>
      </xsl:for-each>
    </xsl:if>
    <xsl:for-each select="cac:PartyIdentification">
      <xsl:if test="cbc:ID != '' and not(contains(cbc:ID/@schemeID,'PARTYTYPE'))">
        <tr align="left">
          <td>
            <xsl:value-of select="cbc:ID/@schemeID" />
            <xsl:text>: </xsl:text>
            <xsl:value-of select="cbc:ID" />
          </td>
        </tr>
      </xsl:if>
    </xsl:for-each>
  </xsl:template>
</xsl:stylesheet>