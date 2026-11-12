<?xml version="1.0" encoding="utf-8"?>
<xsl:stylesheet version="2.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ccts="urn:un:unece:uncefact:documentation:2" xmlns:clm54217="urn:un:unece:uncefact:codelist:specification:54217:2001" xmlns:clm5639="urn:un:unece:uncefact:codelist:specification:5639:1988" xmlns:clm66411="urn:un:unece:uncefact:codelist:specification:66411:2001" xmlns:clmIANAMIMEMediaType="urn:un:unece:uncefact:codelist:specification:IANAMIMEMediaType:2003" xmlns:fn="http://www.w3.org/2005/xpath-functions" xmlns:link="http://www.xbrl.org/2003/linkbase" xmlns:n1="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:qdt="urn:oasis:names:specification:ubl:schema:xsd:QualifiedDatatypes-2" xmlns:udt="urn:un:unece:uncefact:data:specification:UnqualifiedDataTypesSchemaModule:2" xmlns:xbrldi="http://xbrl.org/2006/xbrldi" xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:xdt="http://www.w3.org/2005/xpath-datatypes" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:lcl="http://www.efatura.gov.tr/local" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" exclude-result-prefixes="cac cbc ccts clm54217 clm5639 clm66411 clmIANAMIMEMediaType fn link n1 qdt udt xbrldi xbrli xdt xlink xs xsd xsi lcl">
  <xsl:character-map name="a">
    <xsl:output-character character="" string="" />
    <xsl:output-character character="" string="" />
    <xsl:output-character character="" string="" />
    <xsl:output-character character="" string="" />
    <xsl:output-character character="" string="" />
    <xsl:output-character character="" string="" />
    <xsl:output-character character="" string="" />
    <xsl:output-character character="" string="" />
    <xsl:output-character character="" string="" />
    <xsl:output-character character="" string="" />
    <xsl:output-character character="" string="" />
    <xsl:output-character character="" string="" />
    <xsl:output-character character="" string="" />
    <xsl:output-character character="" string="" />
    <xsl:output-character character="" string="" />
    <xsl:output-character character="" string="" />
    <xsl:output-character character="" string="" />
    <xsl:output-character character="" string="" />
    <xsl:output-character character="" string="" />
    <xsl:output-character character="" string="" />
    <xsl:output-character character="" string="" />
    <xsl:output-character character="" string="" />
    <xsl:output-character character="" string="" />
    <xsl:output-character character="" string="" />
    <xsl:output-character character="" string="" />
    <xsl:output-character character="" string="" />
    <xsl:output-character character="" string="" />
    <xsl:output-character character="" string="" />
    <xsl:output-character character="" string="" />
    <xsl:output-character character="" string="" />
    <xsl:output-character character="" string="" />
    <xsl:output-character character="" string="" />
  </xsl:character-map>
  <xsl:decimal-format name="european" decimal-separator="," grouping-separator="." NaN="" />
  <xsl:output version="4.0" method="html" indent="no" encoding="UTF-8" doctype-public="-//W3C//DTD HTML 4.01 Transitional//EN" doctype-system="http://www.w3.org/TR/html4/loose.dtd" use-character-maps="a" />
  <xsl:param name="SV_OutputFormat" select="'HTML'" />
  <xsl:variable name="XML" select="/" />
  <xsl:variable name="vareczanehizmetbedeli">
    <xsl:for-each select="//n1:Invoice/cbc:Note">
      <xsl:choose>
        <xsl:when test="substring(.,0,9) = 'SGK_EHB:'">
          <xsl:variable name="vareczanehizmetbedeliControl" select="normalize-space(substring-after(substring(.,8),':'))" />
          <xsl:choose>
            <xsl:when test="$vareczanehizmetbedeliControl != 'null' and $vareczanehizmetbedeliControl">
              <xsl:value-of select="$vareczanehizmetbedeliControl" />
            </xsl:when>
            <xsl:otherwise>
              <xsl:value-of select="0" />
            </xsl:otherwise>
          </xsl:choose>
        </xsl:when>
      </xsl:choose>
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="vareczanehizmetbedeli20">
    <xsl:for-each select="//n1:Invoice/cbc:Note">
      <xsl:choose>
        <xsl:when test="substring(.,0,11) = 'SGK_EHB20:'">
          <xsl:variable name="vareczanehizmetbedeli20Control" select="normalize-space(substring-after(substring(.,8),':'))" />
          <xsl:choose>
            <xsl:when test="$vareczanehizmetbedeli20Control != 'null' and $vareczanehizmetbedeli20Control">
              <xsl:value-of select="$vareczanehizmetbedeli20Control" />
            </xsl:when>
            <xsl:otherwise>
              <xsl:value-of select="0" />
            </xsl:otherwise>
          </xsl:choose>
        </xsl:when>
      </xsl:choose>
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="vartutar">
    <xsl:for-each select="//n1:Invoice/cbc:Note">
      <xsl:choose>
        <xsl:when test="substring(.,0,9) = 'SGK_BRT:'">
          <xsl:value-of select="normalize-space(substring-after(substring(.,8),':'))" />
        </xsl:when>
      </xsl:choose>
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="variskonto">
    <xsl:for-each select="//n1:Invoice/cbc:Note">
      <xsl:choose>
        <xsl:when test="substring(.,0,9) = 'SGK_ISK:'">
          <xsl:value-of select="normalize-space(substring-after(substring(.,8),':'))" />
        </xsl:when>
      </xsl:choose>
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="varkatilimpayi">
    <xsl:for-each select="//n1:Invoice/cbc:Note">
      <xsl:choose>
        <xsl:when test="substring(.,0,9) = 'SGK_HKP:'">
          <xsl:value-of select="normalize-space(substring-after(substring(.,8),':'))" />
        </xsl:when>
      </xsl:choose>
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="varisitmekatilimpayi">
    <xsl:for-each select="//n1:Invoice/cbc:Note">
      <xsl:choose>
        <xsl:when test="substring(.,0,9) = 'SGK_IKP:'">
          <xsl:value-of select="normalize-space(substring-after(substring(.,8),':'))" />
        </xsl:when>
      </xsl:choose>
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="varilacfarki">
    <xsl:for-each select="//n1:Invoice/cbc:Note">
      <xsl:choose>
        <xsl:when test="substring(.,0,9) = 'SGK_ILF:'">
          <xsl:value-of select="normalize-space(substring-after(substring(.,8),':'))" />
        </xsl:when>
      </xsl:choose>
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="varsiparissorumlusu">
    <xsl:for-each select="//n1:Invoice/cbc:Note">
      <xsl:choose>
        <xsl:when test="substring(.,0,4) = 'SS:'">
          <xsl:value-of select="normalize-space(substring-after(substring(.,3),':'))" />
        </xsl:when>
      </xsl:choose>
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="varkdv8">
    <xsl:for-each select="//n1:Invoice/cbc:Note">
      <xsl:choose>
        <xsl:when test="substring(.,0,9) = 'SGK_K08:'">
          <xsl:variable name="varkdv8Control" select="normalize-space(substring-after(substring(.,8),':'))" />
          <xsl:choose>
            <xsl:when test="$varkdv8Control != 'null' and $varkdv8Control">
              <xsl:value-of select="$varkdv8Control" />
            </xsl:when>
            <xsl:otherwise>
              <xsl:value-of select="0" />
            </xsl:otherwise>
          </xsl:choose>
        </xsl:when>
      </xsl:choose>
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="varkdv10">
    <xsl:for-each select="//n1:Invoice/cbc:Note">
      <xsl:choose>
        <xsl:when test="substring(.,0,9) = 'SGK_K10:'">
          <xsl:variable name="varkdv10Control" select="normalize-space(substring-after(substring(.,8),':'))" />
          <xsl:choose>
            <xsl:when test="$varkdv10Control != 'null' and $varkdv10Control != 'undefined'">
              <xsl:value-of select="$varkdv10Control" />
            </xsl:when>
            <xsl:otherwise>
              <xsl:value-of select="0" />
            </xsl:otherwise>
          </xsl:choose>
        </xsl:when>
      </xsl:choose>
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="varkdv18">
    <xsl:for-each select="//n1:Invoice/cbc:Note">
      <xsl:choose>
        <xsl:when test="substring(.,0,9) = 'SGK_K18:'">
          <xsl:variable name="varkdv18Control" select="normalize-space(substring-after(substring(.,8),':'))" />
          <xsl:choose>
            <xsl:when test="$varkdv18Control != 'null' and $varkdv18Control != 'undefined'">
              <xsl:value-of select="$varkdv18Control" />
            </xsl:when>
            <xsl:otherwise>
              <xsl:value-of select="0" />
            </xsl:otherwise>
          </xsl:choose>
        </xsl:when>
      </xsl:choose>
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="varkdv20">
    <xsl:for-each select="//n1:Invoice/cbc:Note">
      <xsl:choose>
        <xsl:when test="substring(.,0,9) = 'SGK_K20:'">
          <xsl:variable name="varkdv20Control" select="normalize-space(substring-after(substring(.,8),':'))" />
          <xsl:choose>
            <xsl:when test="$varkdv20Control != 'null' and $varkdv20Control != 'undefined'">
              <xsl:value-of select="$varkdv20Control" />
            </xsl:when>
            <xsl:otherwise>
              <xsl:value-of select="0" />
            </xsl:otherwise>
          </xsl:choose>
        </xsl:when>
      </xsl:choose>
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="vareczanekdv18">
    <xsl:for-each select="//n1:Invoice/cbc:Note">
      <xsl:choose>
        <xsl:when test="substring(.,0,9) = 'SGK_EHK:'">
          <xsl:variable name="vareczanekdv18Control" select="normalize-space(substring-after(substring(.,8),':'))" />
          <xsl:choose>
            <xsl:when test="$vareczanekdv18Control != 'null' and $vareczanekdv18Control != 'undefined'">
              <xsl:value-of select="$vareczanekdv18Control" />
            </xsl:when>
            <xsl:otherwise>
              <xsl:value-of select="0" />
            </xsl:otherwise>
          </xsl:choose>
        </xsl:when>
      </xsl:choose>
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="vareczanekdv20">
    <xsl:for-each select="//n1:Invoice/cbc:Note">
      <xsl:choose>
        <xsl:when test="substring(.,0,11) = 'SGK_EHK20:'">
          <xsl:variable name="vareczanekdv20Control" select="normalize-space(substring-after(substring(.,8),':'))" />
          <xsl:choose>
            <xsl:when test="$vareczanekdv20Control != 'null' and $vareczanekdv20Control != 'undefined'">
              <xsl:value-of select="$vareczanekdv20Control" />
            </xsl:when>
            <xsl:otherwise>
              <xsl:value-of select="0" />
            </xsl:otherwise>
          </xsl:choose>
        </xsl:when>
      </xsl:choose>
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="varpsf">
    <xsl:for-each select="//n1:Invoice/cbc:Note">
      <xsl:choose>
        <xsl:when test="substring(.,0,9) = 'SGK_PSF:'">
          <xsl:value-of select="normalize-space(substring-after(substring(.,8),':'))" />
        </xsl:when>
      </xsl:choose>
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="varreceteadedi">
    <xsl:for-each select="//n1:Invoice/cbc:Note">
      <xsl:choose>
        <xsl:when test="substring(.,0,9) = 'SGK_RCA:'">
          <xsl:value-of select="substring-after(substring(.,8),':')" />
        </xsl:when>
      </xsl:choose>
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="vareldenilackatilimpayi">
    <xsl:for-each select="//n1:Invoice/cbc:Note">
      <xsl:choose>
        <xsl:when test="substring(.,0,9) = 'SGK_EIP:'">
          <xsl:value-of select="normalize-space(substring-after(substring(.,8),':'))" />
        </xsl:when>
      </xsl:choose>
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="varmaasdanilackatilimpayi">
    <xsl:for-each select="//n1:Invoice/cbc:Note">
      <xsl:choose>
        <xsl:when test="substring(.,0,9) = 'SGK_MIP:'">
          <xsl:value-of select="normalize-space(substring-after(substring(.,8),':'))" />
        </xsl:when>
      </xsl:choose>
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="vareldenmuayenekatilimpayi">
    <xsl:for-each select="//n1:Invoice/cbc:Note">
      <xsl:choose>
        <xsl:when test="substring(.,0,9) = 'SGK_EMP:'">
          <xsl:value-of select="normalize-space(substring-after(substring(.,8),':'))" />
        </xsl:when>
      </xsl:choose>
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="varmaasmuayenekatilimpayi">
    <xsl:for-each select="//n1:Invoice/cbc:Note">
      <xsl:choose>
        <xsl:when test="substring(.,0,9) = 'SGK_MMP:'">
          <xsl:value-of select="normalize-space(substring-after(substring(.,8),':'))" />
        </xsl:when>
      </xsl:choose>
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="vareldenrecetekatilimpayi">
    <xsl:for-each select="//n1:Invoice/cbc:Note">
      <xsl:choose>
        <xsl:when test="substring(.,0,9) = 'SGK_ERP:'">
          <xsl:value-of select="normalize-space(substring-after(substring(.,8),':'))" />
        </xsl:when>
      </xsl:choose>
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="varmaastanrecetekatilimpayi">
    <xsl:for-each select="//n1:Invoice/cbc:Note">
      <xsl:choose>
        <xsl:when test="substring(.,0,9) = 'SGK_MRP:'">
          <xsl:value-of select="normalize-space(substring-after(substring(.,8),':'))" />
        </xsl:when>
      </xsl:choose>
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="varfaturatipi">
    <xsl:for-each select="//n1:Invoice/cbc:Note">
      <xsl:choose>
        <xsl:when test="substring(.,0,12) = 'FATURATIPI:'">
          <xsl:value-of select="normalize-space(substring-after(substring(.,10),':'))" />
        </xsl:when>
      </xsl:choose>
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="varoptik">
    <xsl:for-each select="//n1:Invoice/cbc:Note">
      <xsl:choose>
        <xsl:when test="substring(.,0,9) = 'SGK_TYP:'">
          <xsl:value-of select="normalize-space(substring-after(substring(.,7),':'))" />
        </xsl:when>
      </xsl:choose>
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="varfaturatype">
    <!--		Cetas ise kullanılacak-->
    <!--TEBEOS Cezaevi faturası için sgk şeklinde bir tasarım istermiştir ona göre düzenleme yapılmıştır.
		Resources altına oluşturdukları xml atılacaktır. Değişiklik yaparken o xmle de görede kontrol sağlanmalıdır.-->
    <xsl:for-each select="//n1:Invoice/cbc:Note">
      <xsl:choose>
        <xsl:when test="substring(.,0,13) = 'FATURA_TYPE:'">
          <xsl:value-of select="normalize-space(substring-after(substring(.,11),':'))" />
        </xsl:when>
      </xsl:choose>
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="varExportInsurance" select="count(//cac:Shipment[cbc:InsuranceValueAmount])" />
  <xsl:variable name="varExportCarriage" select="count(//cac:Shipment[cbc:DeclaredForCarriageValueAmount])" />
  <xsl:variable name="varEtiketFiyati">
    <xsl:for-each select="//n1:Invoice/cac:InvoiceLine">
      <xsl:for-each select="cbc:Note">
        <xsl:choose>
          <xsl:when test="substring(.,0,5) = 'ETF:' or substring(.,0,5) = 'ESF:'">
            <xsl:value-of select="1" />
          </xsl:when>
        </xsl:choose>
      </xsl:for-each>
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="varEczaciKar">
    <xsl:for-each select="//n1:Invoice/cac:InvoiceLine">
      <xsl:for-each select="cbc:Note">
        <xsl:choose>
          <xsl:when test="substring(.,0,5) = 'ECK:' or substring(.,0,5) = 'EKO:'">
            <xsl:value-of select="1" />
          </xsl:when>
        </xsl:choose>
      </xsl:for-each>
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="varKurumIskonto">
    <xsl:for-each select="//n1:Invoice/cac:InvoiceLine">
      <xsl:for-each select="cbc:Note">
        <xsl:choose>
          <xsl:when test="substring(.,0,5) = 'KRI:'">
            <xsl:value-of select="1" />
          </xsl:when>
        </xsl:choose>
      </xsl:for-each>
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="varDepocuFiyati">
    <xsl:for-each select="//n1:Invoice/cac:InvoiceLine">
      <xsl:for-each select="cbc:Note">
        <xsl:choose>
          <xsl:when test="substring(.,0,5) = 'DSF:'">
            <xsl:value-of select="1" />
          </xsl:when>
        </xsl:choose>
      </xsl:for-each>
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="varVade">
    <xsl:for-each select="//n1:Invoice/cac:InvoiceLine">
      <xsl:for-each select="cbc:Note">
        <xsl:choose>
          <xsl:when test="substring(.,0,5) = 'VAD:'">
            <xsl:value-of select="1" />
          </xsl:when>
        </xsl:choose>
      </xsl:for-each>
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="varBranchName">
    <xsl:for-each select="//n1:Invoice/cac:AdditionalDocumentReference/cbc:DocumentTypeCode[text()='SUBE_UNVAN']">
      <xsl:choose>
        <xsl:when test="../cbc:DocumentTypeCode='SUBE_UNVAN'">
          <xsl:value-of select="1" />
        </xsl:when>
      </xsl:choose>
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="varSenaryoName">
    <xsl:for-each select="//n1:Invoice/cbc:ProfileID">
      <xsl:choose>
        <xsl:when test="substring(.,0,5) = 'KAMU'">
          <xsl:value-of select="1" />
        </xsl:when>
      </xsl:choose>
    </xsl:for-each>
  </xsl:variable>
  <xsl:variable name="varVknComp">
    <xsl:if test="(//n1:Invoice/cac:AccountingCustomerParty/cac:Party/cac:PartyIdentification/cbc:ID[@schemeID='VKN'])=(//n1:Invoice/cac:BuyerCustomerParty/cac:Party/cac:PartyIdentification/cbc:ID[@schemeID='VKN'])">
      <xsl:value-of select="1" />
    </xsl:if>
  </xsl:variable>
  <xsl:variable name="varItemCode" select="count(//cac:SellersItemIdentification[cbc:ID !=''])" />
  <xsl:variable name="varAllowanceRate" select="count(//n1:Invoice/cac:InvoiceLine/cac:AllowanceCharge[cbc:MultiplierFactorNumeric !=''])" />
  <xsl:variable name="varAllowanceAmount" select="count(//n1:Invoice/cac:InvoiceLine/cac:AllowanceCharge[cbc:Amount !=''])" />
  <xsl:variable name="varAllowanceReason" select="count(//n1:Invoice/cac:InvoiceLine/cac:AllowanceCharge[cbc:AllowanceChargeReason !=''])" />
  <xsl:variable name="varLineExplanation" select="count(//n1:Invoice/cac:InvoiceLine[cbc:Note !=''])" />
  <xsl:template match="/">
    <html>
      <head>
        <style type="text/css">
					body {
					background-color: #FFFFFF;
					font-family: 'Tahoma', "Times New Roman", Times, serif;
					font-size: 11px;
					color: #000000;
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
					color: #000000;
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
					td.lineTableTd {
					border-width: 1px;
					padding: 1px;
					border-style: inset;
					border-color: black;
					background-color: white;
					}
					#lineTableDummyTd {
					border-width: 1px;
					border-color:white;
					padding: 1px;
					border-style: inset;
					border-color: black;
					background-color: white;
					}
					td.lineTableBudgetTd {
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
					<!-- border-collapse: collapse; -->
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
					}
					#invoice-info-td {
					border-style: solid;
					border-width: 1px;
					width: 50%;
					
				</style>
        <title>e-Belge</title>
        <script type="text/javascript"><![CDATA[var QRCode;!function(){function a(a){this.mode=c.MODE_8BIT_BYTE,this.data=a,this.parsedData=[];for(var b=[],d=0,e=this.data.length;e>d;d++){var f=this.data.charCodeAt(d);f>65536?(b[0]=240|(1835008&f)>>>18,b[1]=128|(258048&f)>>>12,b[2]=128|(4032&f)>>>6,b[3]=128|63&f):f>2048?(b[0]=224|(61440&f)>>>12,b[1]=128|(4032&f)>>>6,b[2]=128|63&f):f>128?(b[0]=192|(1984&f)>>>6,b[1]=128|63&f):b[0]=f,this.parsedData=this.parsedData.concat(b)}this.parsedData.length!=this.data.length&&(this.parsedData.unshift(191),this.parsedData.unshift(187),this.parsedData.unshift(239))}function b(a,b){this.typeNumber=a,this.errorCorrectLevel=b,this.modules=null,this.moduleCount=0,this.dataCache=null,this.dataList=[]}function i(a,b){if(void 0==a.length)throw new Error(a.length+"/"+b);for(var c=0;c<a.length&&0==a[c];)c++;this.num=new Array(a.length-c+b);for(var d=0;d<a.length-c;d++)this.num[d]=a[d+c]}function j(a,b){this.totalCount=a,this.dataCount=b}function k(){this.buffer=[],this.length=0}function m(){return"undefined"!=typeof CanvasRenderingContext2D}function n(){var a=!1,b=navigator.userAgent;return/android/i.test(b)&&(a=!0,aMat=b.toString().match(/android ([0-9]\.[0-9])/i),aMat&&aMat[1]&&(a=parseFloat(aMat[1]))),a}function r(a,b){for(var c=1,e=s(a),f=0,g=l.length;g>=f;f++){var h=0;switch(b){case d.L:h=l[f][0];break;case d.M:h=l[f][1];break;case d.Q:h=l[f][2];break;case d.H:h=l[f][3]}if(h>=e)break;c++}if(c>l.length)throw new Error("Too long data");return c}function s(a){var b=encodeURI(a).toString().replace(/\%[0-9a-fA-F]{2}/g,"a");return b.length+(b.length!=a?3:0)}a.prototype={getLength:function(){return this.parsedData.length},write:function(a){for(var b=0,c=this.parsedData.length;c>b;b++)a.put(this.parsedData[b],8)}},b.prototype={addData:function(b){var c=new a(b);this.dataList.push(c),this.dataCache=null},isDark:function(a,b){if(0>a||this.moduleCount<=a||0>b||this.moduleCount<=b)throw new Error(a+","+b);return this.modules[a][b]},getModuleCount:function(){return this.moduleCount},make:function(){this.makeImpl(!1,this.getBestMaskPattern())},makeImpl:function(a,c){this.moduleCount=4*this.typeNumber+17,this.modules=new Array(this.moduleCount);for(var d=0;d<this.moduleCount;d++){this.modules[d]=new Array(this.moduleCount);for(var e=0;e<this.moduleCount;e++)this.modules[d][e]=null}this.setupPositionProbePattern(0,0),this.setupPositionProbePattern(this.moduleCount-7,0),this.setupPositionProbePattern(0,this.moduleCount-7),this.setupPositionAdjustPattern(),this.setupTimingPattern(),this.setupTypeInfo(a,c),this.typeNumber>=7&&this.setupTypeNumber(a),null==this.dataCache&&(this.dataCache=b.createData(this.typeNumber,this.errorCorrectLevel,this.dataList)),this.mapData(this.dataCache,c)},setupPositionProbePattern:function(a,b){for(var c=-1;7>=c;c++)if(!(-1>=a+c||this.moduleCount<=a+c))for(var d=-1;7>=d;d++)-1>=b+d||this.moduleCount<=b+d||(this.modules[a+c][b+d]=c>=0&&6>=c&&(0==d||6==d)||d>=0&&6>=d&&(0==c||6==c)||c>=2&&4>=c&&d>=2&&4>=d?!0:!1)},getBestMaskPattern:function(){for(var a=0,b=0,c=0;8>c;c++){this.makeImpl(!0,c);var d=f.getLostPoint(this);(0==c||a>d)&&(a=d,b=c)}return b},createMovieClip:function(a,b,c){var d=a.createEmptyMovieClip(b,c),e=1;this.make();for(var f=0;f<this.modules.length;f++)for(var g=f*e,h=0;h<this.modules[f].length;h++){var i=h*e,j=this.modules[f][h];j&&(d.beginFill(0,100),d.moveTo(i,g),d.lineTo(i+e,g),d.lineTo(i+e,g+e),d.lineTo(i,g+e),d.endFill())}return d},setupTimingPattern:function(){for(var a=8;a<this.moduleCount-8;a++)null==this.modules[a][6]&&(this.modules[a][6]=0==a%2);for(var b=8;b<this.moduleCount-8;b++)null==this.modules[6][b]&&(this.modules[6][b]=0==b%2)},setupPositionAdjustPattern:function(){for(var a=f.getPatternPosition(this.typeNumber),b=0;b<a.length;b++)for(var c=0;c<a.length;c++){var d=a[b],e=a[c];if(null==this.modules[d][e])for(var g=-2;2>=g;g++)for(var h=-2;2>=h;h++)this.modules[d+g][e+h]=-2==g||2==g||-2==h||2==h||0==g&&0==h?!0:!1}},setupTypeNumber:function(a){for(var b=f.getBCHTypeNumber(this.typeNumber),c=0;18>c;c++){var d=!a&&1==(1&b>>c);this.modules[Math.floor(c/3)][c%3+this.moduleCount-8-3]=d}for(var c=0;18>c;c++){var d=!a&&1==(1&b>>c);this.modules[c%3+this.moduleCount-8-3][Math.floor(c/3)]=d}},setupTypeInfo:function(a,b){for(var c=this.errorCorrectLevel<<3|b,d=f.getBCHTypeInfo(c),e=0;15>e;e++){var g=!a&&1==(1&d>>e);6>e?this.modules[e][8]=g:8>e?this.modules[e+1][8]=g:this.modules[this.moduleCount-15+e][8]=g}for(var e=0;15>e;e++){var g=!a&&1==(1&d>>e);8>e?this.modules[8][this.moduleCount-e-1]=g:9>e?this.modules[8][15-e-1+1]=g:this.modules[8][15-e-1]=g}this.modules[this.moduleCount-8][8]=!a},mapData:function(a,b){for(var c=-1,d=this.moduleCount-1,e=7,g=0,h=this.moduleCount-1;h>0;h-=2)for(6==h&&h--;;){for(var i=0;2>i;i++)if(null==this.modules[d][h-i]){var j=!1;g<a.length&&(j=1==(1&a[g]>>>e));var k=f.getMask(b,d,h-i);k&&(j=!j),this.modules[d][h-i]=j,e--,-1==e&&(g++,e=7)}if(d+=c,0>d||this.moduleCount<=d){d-=c,c=-c;break}}}},b.PAD0=236,b.PAD1=17,b.createData=function(a,c,d){for(var e=j.getRSBlocks(a,c),g=new k,h=0;h<d.length;h++){var i=d[h];g.put(i.mode,4),g.put(i.getLength(),f.getLengthInBits(i.mode,a)),i.write(g)}for(var l=0,h=0;h<e.length;h++)l+=e[h].dataCount;if(g.getLengthInBits()>8*l)throw new Error("code length overflow. ("+g.getLengthInBits()+">"+8*l+")");for(g.getLengthInBits()+4<=8*l&&g.put(0,4);0!=g.getLengthInBits()%8;)g.putBit(!1);for(;;){if(g.getLengthInBits()>=8*l)break;if(g.put(b.PAD0,8),g.getLengthInBits()>=8*l)break;g.put(b.PAD1,8)}return b.createBytes(g,e)},b.createBytes=function(a,b){for(var c=0,d=0,e=0,g=new Array(b.length),h=new Array(b.length),j=0;j<b.length;j++){var k=b[j].dataCount,l=b[j].totalCount-k;d=Math.max(d,k),e=Math.max(e,l),g[j]=new Array(k);for(var m=0;m<g[j].length;m++)g[j][m]=255&a.buffer[m+c];c+=k;var n=f.getErrorCorrectPolynomial(l),o=new i(g[j],n.getLength()-1),p=o.mod(n);h[j]=new Array(n.getLength()-1);for(var m=0;m<h[j].length;m++){var q=m+p.getLength()-h[j].length;h[j][m]=q>=0?p.get(q):0}}for(var r=0,m=0;m<b.length;m++)r+=b[m].totalCount;for(var s=new Array(r),t=0,m=0;d>m;m++)for(var j=0;j<b.length;j++)m<g[j].length&&(s[t++]=g[j][m]);for(var m=0;e>m;m++)for(var j=0;j<b.length;j++)m<h[j].length&&(s[t++]=h[j][m]);return s};for(var c={MODE_NUMBER:1,MODE_ALPHA_NUM:2,MODE_8BIT_BYTE:4,MODE_KANJI:8},d={L:1,M:0,Q:3,H:2},e={PATTERN000:0,PATTERN001:1,PATTERN010:2,PATTERN011:3,PATTERN100:4,PATTERN101:5,PATTERN110:6,PATTERN111:7},f={PATTERN_POSITION_TABLE:[[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],[6,30,56,82],[6,30,58,86],[6,34,62,90],[6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],[6,28,54,80,106],[6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],[6,26,50,74,98,122],[6,30,54,78,102,126],[6,26,52,78,104,130],[6,30,56,82,108,134],[6,34,60,86,112,138],[6,30,58,86,114,142],[6,34,62,90,118,146],[6,30,54,78,102,126,150],[6,24,50,76,102,128,154],[6,28,54,80,106,132,158],[6,32,58,84,110,136,162],[6,26,54,82,110,138,166],[6,30,58,86,114,142,170]],G15:1335,G18:7973,G15_MASK:21522,getBCHTypeInfo:function(a){for(var b=a<<10;f.getBCHDigit(b)-f.getBCHDigit(f.G15)>=0;)b^=f.G15<<f.getBCHDigit(b)-f.getBCHDigit(f.G15);return(a<<10|b)^f.G15_MASK},getBCHTypeNumber:function(a){for(var b=a<<12;f.getBCHDigit(b)-f.getBCHDigit(f.G18)>=0;)b^=f.G18<<f.getBCHDigit(b)-f.getBCHDigit(f.G18);return a<<12|b},getBCHDigit:function(a){for(var b=0;0!=a;)b++,a>>>=1;return b},getPatternPosition:function(a){return f.PATTERN_POSITION_TABLE[a-1]},getMask:function(a,b,c){switch(a){case e.PATTERN000:return 0==(b+c)%2;case e.PATTERN001:return 0==b%2;case e.PATTERN010:return 0==c%3;case e.PATTERN011:return 0==(b+c)%3;case e.PATTERN100:return 0==(Math.floor(b/2)+Math.floor(c/3))%2;case e.PATTERN101:return 0==b*c%2+b*c%3;case e.PATTERN110:return 0==(b*c%2+b*c%3)%2;case e.PATTERN111:return 0==(b*c%3+(b+c)%2)%2;default:throw new Error("bad maskPattern:"+a)}},getErrorCorrectPolynomial:function(a){for(var b=new i([1],0),c=0;a>c;c++)b=b.multiply(new i([1,g.gexp(c)],0));return b},getLengthInBits:function(a,b){if(b>=1&&10>b)switch(a){case c.MODE_NUMBER:return 10;case c.MODE_ALPHA_NUM:return 9;case c.MODE_8BIT_BYTE:return 8;case c.MODE_KANJI:return 8;default:throw new Error("mode:"+a)}else if(27>b)switch(a){case c.MODE_NUMBER:return 12;case c.MODE_ALPHA_NUM:return 11;case c.MODE_8BIT_BYTE:return 16;case c.MODE_KANJI:return 10;default:throw new Error("mode:"+a)}else{if(!(41>b))throw new Error("type:"+b);switch(a){case c.MODE_NUMBER:return 14;case c.MODE_ALPHA_NUM:return 13;case c.MODE_8BIT_BYTE:return 16;case c.MODE_KANJI:return 12;default:throw new Error("mode:"+a)}}},getLostPoint:function(a){for(var b=a.getModuleCount(),c=0,d=0;b>d;d++)for(var e=0;b>e;e++){for(var f=0,g=a.isDark(d,e),h=-1;1>=h;h++)if(!(0>d+h||d+h>=b))for(var i=-1;1>=i;i++)0>e+i||e+i>=b||(0!=h||0!=i)&&g==a.isDark(d+h,e+i)&&f++;f>5&&(c+=3+f-5)}for(var d=0;b-1>d;d++)for(var e=0;b-1>e;e++){var j=0;a.isDark(d,e)&&j++,a.isDark(d+1,e)&&j++,a.isDark(d,e+1)&&j++,a.isDark(d+1,e+1)&&j++,(0==j||4==j)&&(c+=3)}for(var d=0;b>d;d++)for(var e=0;b-6>e;e++)a.isDark(d,e)&&!a.isDark(d,e+1)&&a.isDark(d,e+2)&&a.isDark(d,e+3)&&a.isDark(d,e+4)&&!a.isDark(d,e+5)&&a.isDark(d,e+6)&&(c+=40);for(var e=0;b>e;e++)for(var d=0;b-6>d;d++)a.isDark(d,e)&&!a.isDark(d+1,e)&&a.isDark(d+2,e)&&a.isDark(d+3,e)&&a.isDark(d+4,e)&&!a.isDark(d+5,e)&&a.isDark(d+6,e)&&(c+=40);for(var k=0,e=0;b>e;e++)for(var d=0;b>d;d++)a.isDark(d,e)&&k++;var l=Math.abs(100*k/b/b-50)/5;return c+=10*l}},g={glog:function(a){if(1>a)throw new Error("glog("+a+")");return g.LOG_TABLE[a]},gexp:function(a){for(;0>a;)a+=255;for(;a>=256;)a-=255;return g.EXP_TABLE[a]},EXP_TABLE:new Array(256),LOG_TABLE:new Array(256)},h=0;8>h;h++)g.EXP_TABLE[h]=1<<h;for(var h=8;256>h;h++)g.EXP_TABLE[h]=g.EXP_TABLE[h-4]^g.EXP_TABLE[h-5]^g.EXP_TABLE[h-6]^g.EXP_TABLE[h-8];for(var h=0;255>h;h++)g.LOG_TABLE[g.EXP_TABLE[h]]=h;i.prototype={get:function(a){return this.num[a]},getLength:function(){return this.num.length},multiply:function(a){for(var b=new Array(this.getLength()+a.getLength()-1),c=0;c<this.getLength();c++)for(var d=0;d<a.getLength();d++)b[c+d]^=g.gexp(g.glog(this.get(c))+g.glog(a.get(d)));return new i(b,0)},mod:function(a){if(this.getLength()-a.getLength()<0)return this;for(var b=g.glog(this.get(0))-g.glog(a.get(0)),c=new Array(this.getLength()),d=0;d<this.getLength();d++)c[d]=this.get(d);for(var d=0;d<a.getLength();d++)c[d]^=g.gexp(g.glog(a.get(d))+b);return new i(c,0).mod(a)}},j.RS_BLOCK_TABLE=[[1,26,19],[1,26,16],[1,26,13],[1,26,9],[1,44,34],[1,44,28],[1,44,22],[1,44,16],[1,70,55],[1,70,44],[2,35,17],[2,35,13],[1,100,80],[2,50,32],[2,50,24],[4,25,9],[1,134,108],[2,67,43],[2,33,15,2,34,16],[2,33,11,2,34,12],[2,86,68],[4,43,27],[4,43,19],[4,43,15],[2,98,78],[4,49,31],[2,32,14,4,33,15],[4,39,13,1,40,14],[2,121,97],[2,60,38,2,61,39],[4,40,18,2,41,19],[4,40,14,2,41,15],[2,146,116],[3,58,36,2,59,37],[4,36,16,4,37,17],[4,36,12,4,37,13],[2,86,68,2,87,69],[4,69,43,1,70,44],[6,43,19,2,44,20],[6,43,15,2,44,16],[4,101,81],[1,80,50,4,81,51],[4,50,22,4,51,23],[3,36,12,8,37,13],[2,116,92,2,117,93],[6,58,36,2,59,37],[4,46,20,6,47,21],[7,42,14,4,43,15],[4,133,107],[8,59,37,1,60,38],[8,44,20,4,45,21],[12,33,11,4,34,12],[3,145,115,1,146,116],[4,64,40,5,65,41],[11,36,16,5,37,17],[11,36,12,5,37,13],[5,109,87,1,110,88],[5,65,41,5,66,42],[5,54,24,7,55,25],[11,36,12],[5,122,98,1,123,99],[7,73,45,3,74,46],[15,43,19,2,44,20],[3,45,15,13,46,16],[1,135,107,5,136,108],[10,74,46,1,75,47],[1,50,22,15,51,23],[2,42,14,17,43,15],[5,150,120,1,151,121],[9,69,43,4,70,44],[17,50,22,1,51,23],[2,42,14,19,43,15],[3,141,113,4,142,114],[3,70,44,11,71,45],[17,47,21,4,48,22],[9,39,13,16,40,14],[3,135,107,5,136,108],[3,67,41,13,68,42],[15,54,24,5,55,25],[15,43,15,10,44,16],[4,144,116,4,145,117],[17,68,42],[17,50,22,6,51,23],[19,46,16,6,47,17],[2,139,111,7,140,112],[17,74,46],[7,54,24,16,55,25],[34,37,13],[4,151,121,5,152,122],[4,75,47,14,76,48],[11,54,24,14,55,25],[16,45,15,14,46,16],[6,147,117,4,148,118],[6,73,45,14,74,46],[11,54,24,16,55,25],[30,46,16,2,47,17],[8,132,106,4,133,107],[8,75,47,13,76,48],[7,54,24,22,55,25],[22,45,15,13,46,16],[10,142,114,2,143,115],[19,74,46,4,75,47],[28,50,22,6,51,23],[33,46,16,4,47,17],[8,152,122,4,153,123],[22,73,45,3,74,46],[8,53,23,26,54,24],[12,45,15,28,46,16],[3,147,117,10,148,118],[3,73,45,23,74,46],[4,54,24,31,55,25],[11,45,15,31,46,16],[7,146,116,7,147,117],[21,73,45,7,74,46],[1,53,23,37,54,24],[19,45,15,26,46,16],[5,145,115,10,146,116],[19,75,47,10,76,48],[15,54,24,25,55,25],[23,45,15,25,46,16],[13,145,115,3,146,116],[2,74,46,29,75,47],[42,54,24,1,55,25],[23,45,15,28,46,16],[17,145,115],[10,74,46,23,75,47],[10,54,24,35,55,25],[19,45,15,35,46,16],[17,145,115,1,146,116],[14,74,46,21,75,47],[29,54,24,19,55,25],[11,45,15,46,46,16],[13,145,115,6,146,116],[14,74,46,23,75,47],[44,54,24,7,55,25],[59,46,16,1,47,17],[12,151,121,7,152,122],[12,75,47,26,76,48],[39,54,24,14,55,25],[22,45,15,41,46,16],[6,151,121,14,152,122],[6,75,47,34,76,48],[46,54,24,10,55,25],[2,45,15,64,46,16],[17,152,122,4,153,123],[29,74,46,14,75,47],[49,54,24,10,55,25],[24,45,15,46,46,16],[4,152,122,18,153,123],[13,74,46,32,75,47],[48,54,24,14,55,25],[42,45,15,32,46,16],[20,147,117,4,148,118],[40,75,47,7,76,48],[43,54,24,22,55,25],[10,45,15,67,46,16],[19,148,118,6,149,119],[18,75,47,31,76,48],[34,54,24,34,55,25],[20,45,15,61,46,16]],j.getRSBlocks=function(a,b){var c=j.getRsBlockTable(a,b);if(void 0==c)throw new Error("bad rs block @ typeNumber:"+a+"/errorCorrectLevel:"+b);for(var d=c.length/3,e=[],f=0;d>f;f++)for(var g=c[3*f+0],h=c[3*f+1],i=c[3*f+2],k=0;g>k;k++)e.push(new j(h,i));return e},j.getRsBlockTable=function(a,b){switch(b){case d.L:return j.RS_BLOCK_TABLE[4*(a-1)+0];case d.M:return j.RS_BLOCK_TABLE[4*(a-1)+1];case d.Q:return j.RS_BLOCK_TABLE[4*(a-1)+2];case d.H:return j.RS_BLOCK_TABLE[4*(a-1)+3];default:return void 0}},k.prototype={get:function(a){var b=Math.floor(a/8);return 1==(1&this.buffer[b]>>>7-a%8)},put:function(a,b){for(var c=0;b>c;c++)this.putBit(1==(1&a>>>b-c-1))},getLengthInBits:function(){return this.length},putBit:function(a){var b=Math.floor(this.length/8);this.buffer.length<=b&&this.buffer.push(0),a&&(this.buffer[b]|=128>>>this.length%8),this.length++}};var l=[[17,14,11,7],[32,26,20,14],[53,42,32,24],[78,62,46,34],[106,84,60,44],[134,106,74,58],[154,122,86,64],[192,152,108,84],[230,180,130,98],[271,213,151,119],[321,251,177,137],[367,287,203,155],[425,331,241,177],[458,362,258,194],[520,412,292,220],[586,450,322,250],[644,504,364,280],[718,560,394,310],[792,624,442,338],[858,666,482,382],[929,711,509,403],[1003,779,565,439],[1091,857,611,461],[1171,911,661,511],[1273,997,715,535],[1367,1059,751,593],[1465,1125,805,625],[1528,1190,868,658],[1628,1264,908,698],[1732,1370,982,742],[1840,1452,1030,790],[1952,1538,1112,842],[2068,1628,1168,898],[2188,1722,1228,958],[2303,1809,1283,983],[2431,1911,1351,1051],[2563,1989,1423,1093],[2699,2099,1499,1139],[2809,2213,1579,1219],[2953,2331,1663,1273]],o=function(){var a=function(a,b){this._el=a,this._htOption=b};return a.prototype.draw=function(a){function g(a,b){var c=document.createElementNS("http://www.w3.org/2000/svg",a);for(var d in b)b.hasOwnProperty(d)&&c.setAttribute(d,b[d]);return c}var b=this._htOption,c=this._el,d=a.getModuleCount();Math.floor(b.width/d),Math.floor(b.height/d),this.clear();var h=g("svg",{viewBox:"0 0 "+String(d)+" "+String(d),width:"100%",height:"100%",fill:b.colorLight});h.setAttributeNS("http://www.w3.org/2000/xmlns/","xmlns:xlink","http://www.w3.org/1999/xlink"),c.appendChild(h),h.appendChild(g("rect",{fill:b.colorDark,width:"1",height:"1",id:"template"}));for(var i=0;d>i;i++)for(var j=0;d>j;j++)if(a.isDark(i,j)){var k=g("use",{x:String(i),y:String(j)});k.setAttributeNS("http://www.w3.org/1999/xlink","href","#template"),h.appendChild(k)}},a.prototype.clear=function(){for(;this._el.hasChildNodes();)this._el.removeChild(this._el.lastChild)},a}(),p="svg"===document.documentElement.tagName.toLowerCase(),q=p?o:m()?function(){function a(){this._elImage.src=this._elCanvas.toDataURL("image/png"),this._elImage.style.display="block",this._elCanvas.style.display="none"}function d(a,b){var c=this;if(c._fFail=b,c._fSuccess=a,null===c._bSupportDataURI){var d=document.createElement("img"),e=function(){c._bSupportDataURI=!1,c._fFail&&_fFail.call(c)},f=function(){c._bSupportDataURI=!0,c._fSuccess&&c._fSuccess.call(c)};return d.onabort=e,d.onerror=e,d.onload=f,d.src="data:image/gif;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==",void 0}c._bSupportDataURI===!0&&c._fSuccess?c._fSuccess.call(c):c._bSupportDataURI===!1&&c._fFail&&c._fFail.call(c)}if(this._android&&this._android<=2.1){var b=1/window.devicePixelRatio,c=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(a,d,e,f,g,h,i,j){if("nodeName"in a&&/img/i.test(a.nodeName))for(var l=arguments.length-1;l>=1;l--)arguments[l]=arguments[l]*b;else"undefined"==typeof j&&(arguments[1]*=b,arguments[2]*=b,arguments[3]*=b,arguments[4]*=b);c.apply(this,arguments)}}var e=function(a,b){this._bIsPainted=!1,this._android=n(),this._htOption=b,this._elCanvas=document.createElement("canvas"),this._elCanvas.width=b.width,this._elCanvas.height=b.height,a.appendChild(this._elCanvas),this._el=a,this._oContext=this._elCanvas.getContext("2d"),this._bIsPainted=!1,this._elImage=document.createElement("img"),this._elImage.style.display="none",this._el.appendChild(this._elImage),this._bSupportDataURI=null};return e.prototype.draw=function(a){var b=this._elImage,c=this._oContext,d=this._htOption,e=a.getModuleCount(),f=d.width/e,g=d.height/e,h=Math.round(f),i=Math.round(g);b.style.display="none",this.clear();for(var j=0;e>j;j++)for(var k=0;e>k;k++){var l=a.isDark(j,k),m=k*f,n=j*g;c.strokeStyle=l?d.colorDark:d.colorLight,c.lineWidth=1,c.fillStyle=l?d.colorDark:d.colorLight,c.fillRect(m,n,f,g),c.strokeRect(Math.floor(m)+.5,Math.floor(n)+.5,h,i),c.strokeRect(Math.ceil(m)-.5,Math.ceil(n)-.5,h,i)}this._bIsPainted=!0},e.prototype.makeImage=function(){this._bIsPainted&&d.call(this,a)},e.prototype.isPainted=function(){return this._bIsPainted},e.prototype.clear=function(){this._oContext.clearRect(0,0,this._elCanvas.width,this._elCanvas.height),this._bIsPainted=!1},e.prototype.round=function(a){return a?Math.floor(1e3*a)/1e3:a},e}():function(){var a=function(a,b){this._el=a,this._htOption=b};return a.prototype.draw=function(a){for(var b=this._htOption,c=this._el,d=a.getModuleCount(),e=Math.floor(b.width/d),f=Math.floor(b.height/d),g=['<table style="border:0;border-collapse:collapse;">'],h=0;d>h;h++){g.push("<tr>");for(var i=0;d>i;i++)g.push('<td style="border:0;border-collapse:collapse;padding:0;margin:0;width:'+e+"px;height:"+f+"px;background-color:"+(a.isDark(h,i)?b.colorDark:b.colorLight)+';"></td>');g.push("</tr>")}g.push("</table>"),c.innerHTML=g.join("");var j=c.childNodes[0],k=(b.width-j.offsetWidth)/2,l=(b.height-j.offsetHeight)/2;k>0&&l>0&&(j.style.margin=l+"px "+k+"px")},a.prototype.clear=function(){this._el.innerHTML=""},a}();QRCode=function(a,b){if(this._htOption={width:256,height:256,typeNumber:4,colorDark:"#000000",colorLight:"#ffffff",correctLevel:d.H},"string"==typeof b&&(b={text:b}),b)for(var c in b)this._htOption[c]=b[c];"string"==typeof a&&(a=document.getElementById(a)),this._android=n(),this._el=a,this._oQRCode=null,this._oDrawing=new q(this._el,this._htOption),this._htOption.text&&this.makeCode(this._htOption.text)},QRCode.prototype.makeCode=function(a){this._oQRCode=new b(r(a,this._htOption.correctLevel),this._htOption.correctLevel),this._oQRCode.addData(a),this._oQRCode.make(),this._el.title=a,this._oDrawing.draw(this._oQRCode),this.makeImage()},QRCode.prototype.makeImage=function(){"function"==typeof this._oDrawing.makeImage&&(!this._android||this._android>=3)&&this._oDrawing.makeImage()},QRCode.prototype.clear=function(){this._oDrawing.clear()},QRCode.CorrectLevel=d}();]]></script>
      </head>
      <body style="width:850px;">
        <xsl:for-each select="$XML">
          <!-- GONDERICI - EARSIV LOGO - FIRMA LOGO TABLOSU -->
          <table style="width: 100%;">
            <tbody>
              <tr>
                <td style="width: 40%;">
                  <hr />
                  <!-- GONDERICI TABLOSU -->
                   <img src="data:image/jpeg;base64,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" />

                  <hr />
                </td>
                <!-- E-ARSIV FATURA LOGO -->
                <td style="width: 20%; text-align: center;">
                  <img style="width:91px;" align="middle" alt="E-Fatura Logo" src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4QBoRXhpZgAASUkqAAgAAAADABIBAwABAAAAAQAAADEBAgAQAAAAMgAAAGmHBAABAAAAQgAAAAAAAABTaG90d2VsbCAwLjIyLjAAAgACoAkAAQAAAKYBAAADoAkAAQAAAKYBAAAAAAAA/+EJ9Gh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8APD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iWE1QIENvcmUgNC40LjAtRXhpdjIiPiA8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPiA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIiB4bWxuczpleGlmPSJodHRwOi8vbnMuYWRvYmUuY29tL2V4aWYvMS4wLyIgeG1sbnM6dGlmZj0iaHR0cDovL25zLmFkb2JlLmNvbS90aWZmLzEuMC8iIGV4aWY6UGl4ZWxYRGltZW5zaW9uPSI0MjIiIGV4aWY6UGl4ZWxZRGltZW5zaW9uPSI0MjIiIHRpZmY6SW1hZ2VXaWR0aD0iNDIyIiB0aWZmOkltYWdlSGVpZ2h0PSI0MjIiIHRpZmY6T3JpZW50YXRpb249IjEiLz4gPC9yZGY6UkRGPiA8L3g6eG1wbWV0YT4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8P3hwYWNrZXQgZW5kPSJ3Ij8+/9sAQwADAgIDAgIDAwMDBAMDBAUIBQUEBAUKBwcGCAwKDAwLCgsLDQ4SEA0OEQ4LCxAWEBETFBUVFQwPFxgWFBgSFBUU/9sAQwEDBAQFBAUJBQUJFA0LDRQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU/8AAEQgAaQBpAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/aAAwDAQACEQMRAD8A/VOiioL6+ttMsp7y8njtbSBGlmnmcIkaKMszMeAABkk0bgT1458QP2nfDvhbxDJ4W8N2F/8AEHxsvB0Hw6gla3PTNzMf3cC567jkelcJqHjHxT+1FJeL4Z1a48B/Bq03i88Vg+Tfa0qZ8wWpb/UwDBzMeTjj+IVTl+JHhz4QeArPT/gf4dtJ7SG/FtqEj6dcuVLQmSGaX7ssiT4wtyPMU/wiQkLXuUcCoO1Vc0/5dkv8T6P+6tel09DzqmIurwdl36v0X6/mdDdaJ8c/HdpJfeJ/GWh/B7QgNz2OhwpfXqIf4ZbubEaN/tRrisTSv2evhJ4v8XXnhrxD4w8W/EHxDaq7Twa9r94UOzZ5gTyzHG2wyR7lTOzeoYDIr1P4l/CeL41aDod415eeGNUjETuypuZ7dmjkmtJoyQGB2Lz1VlBHcHW0D4L+GfDPxC1Xxlp0E9vq2pl3uFWUiFncIHfb3J8tepIB3FQCzZFjeSD5ZcktdIpKz0teW7W/VsHQ5parmXdu/wCGy+4+KPi34e+Cvwt8W+NPDSfBfSr+60p7VNLaTUrkG/zBHcXhY7iV8qKRW4znPOK9b1f4H/Anwn4p1LQNHvPFPgTXtOsZdSdtB1bULYeVFGskjRu7NExVWUkD1I6g4+gfEHwW8EeK9VudS1bw5aX1/cGQy3Eu7e3mQJA/IPG6KKNDjsorD1/9m7wVr2peItQa3vbO/wBes7yyvZ7a8flLpY1nZEYsiMwhQZC9j611vNIzjCLqTTS195u706N7aN7dTH6m4tvli9dNLaa+W/8AkeYeFtE+Lek28M/gP4lP4th+wWuonw98RNM/exxTqWRDf24GZcKQV+bbwTwwJ6rw/wDtT2mka3beHfin4cvfhdr87eXBNqMizaVeN6Q3q/Jnvh9pGQOTVHx/8NvF1l4ss4fBPnpqOq+IV1m8164RFstPtY7B7RINgk3SMn7t1j27WYnJA3Yk8G+L734o+MvEnw08V+FYtY8L6bFNaTXWq+XLPN5TJHHLcIMAGf8AeSJhFwqBlLZ+XOfsq8eecVJWu2rRkvu0evdXfdFR56cuWLad+uqf6r5Ox7+jrKiujBkYZDA5BFOr5QdtX/Za8SX9p4K1R/Hfw/05EuNX8Dtci41bw9A+SJ7XJ3vDgE+U3IAyDySPpTwX400X4h+GLDxD4e1CHVNHvoxLBcwHIYdwR1BByCpwQQQRkV5NfCuilUi+aD2f6NdH+fRtHbSrKb5XpJdP8u/9XNuiiiuI6Ar5m8X3M37U/wARNR8IW9y9t8I/CtwE8R3sTlBrV6mG+wq4/wCWMfBlIPJwPQ13X7TfxD1Twd4FtdE8MMP+E18W3iaFovPMUsv37g+ixR7nz0BC5615L9v8P+GPDKfBnw7pZ8XeE7SyxfX3htxeX9ldQXCec9/aEDzElmOSiszOvmDYV5HuYGhKEPbr4nt5Jby9VtHzvbVI87EVE37N7Lfz7L/Py9To/EfirUNS+KZ8F6PpNv4T1rS7SCTw3GYhPb6rp5a4juIrpIgwhtD9nQKRypeFiMkR17N8P/hZoXw6tIYtMt2MsMBtIZ5yHlitfNeSO2V8AmKMyFUByQuBmsr4HfCWP4R+CLPSJboajfRhla4HmbIkLErDCJHdkiXsm4jJYjGcV6LXHia6b9lRfur8fPv52u92b0aTXvz3/IK+Zf2vv2s4/gnYL4e8NyQ3PjS6QPl1DpYRHo7joXP8Kn6njAPo/wC0d8cLH4D/AA5utcmEc+qz5t9Ns2P+unI4JHXav3mPoMdSK/IfxL4k1Hxdr1/rOr3cl9qV9M09xcSHJdiefoPQdAOBXw2dZo8JH2FF++/wX+Z/QfhlwLHiCs80zGN8NTdkn9uS6f4V17vTue6f8N7/ABl/6GC0/wDBbB/8RR/w3t8Zf+hgtP8AwWwf/EV88gV9ifsa/sejx6bXxx41tSPDiMH0/TZRj7eQf9Y4/wCeQPQfxf7v3vksJWzHGVVSpVZX9Xp5s/oTiDLeDuGsDLH47A0lFaJKEbyfSKVt3+C1eh6x+zL4o+P/AMaGg13X/EMWheDshll/suAT3w9IgU4X/bIx6A84+vJ45HtpEjlMUrIVWXaDtOODjoa8y8Y/tIfDH4XeILfwzrXiW00zUFCJ9kiid1twQNocopWMYxwxGBg9K9NtrmK8t4p4JEmhlUOkkbBldSMggjqCK/RsHGNKLpqpzyW93d39Oh/GHEdevjq8ca8EsNRn/DUYcsXHunZc77v7rI+PtE8Az/AL4gQeJ/HGpy3K27XN3ay2d0ss+vag8TrPcSeZGv2aPyNm6NphCrxxnICiti51K1+AOqad8WPBwkl+DfjDybrX9KjjIXS5JwPL1KGP+FTuUSoB3BweNv0Z478B6L8RNBfS9c0201S3DrNFHexeZGsqnKkgEEjPBGRuUsp4JFeA/DbT00Dxj4p0/wCKfivStd1TXZW0aHR5rZlmisnfy4FMccrxW9vMVbYpRSTJEGkZ2Ar7WniliIudTV2tKP8AMvJdGt79H5Oy/O5UXSkox23T7Pz/ACt1Ppu2uYb22iuLeVJoJUEkcsbBldSMggjqCO9S18//ALM+o3nw/wBd8T/BbWbmS5n8LFLvQbmc5e60aUnyee5hYGInpwor6Arw8RR9hUcL3W6fdPVP7j0aVT2kFLZ9fXqfPujIPib+2HrmoS/vdL+HOjxadaKeVGoXo8yaRT6rCqIfTdXp9z4K8I6t8RYtZ/s5I/F2mQpI1/brJBI8UgkRUkdcLMvyP8jFgCAcDg185fCLwrrvjv4f6x400S2g1W5vviPqHiGXSrq9e0j1G3haS3hhMqq2PLZI5FDAqWiAPByPoL4O2fiCHSdcvfEMipPqOrz3dvpyagb4adGQim387AziRJX2jhPM2DhRXp42PsnaM7ciUbX+/wA9Xd7W13vocdB8+8d3e/5fojvqQkAEk4Apa8a/a6+I7/DL4DeI7+3l8rUL2MabaMDgiSX5SR7qm9h/u187WqxoU5VZbJXPosuwNXM8ZRwVH4qklFerdvwPz3/a++Nknxm+Ld9Lazl/D+kFrHTUB+VlU/PKPd2Gc/3Qo7V4dSk5NPghe5mjiiRpJXYKiKMliTgAe9fjVetPE1ZVZ7tn+leV5bh8mwNLA4ZWhTikvlu35t6vzPe/2Pf2eG+OPj/7RqcLf8Ino5Wa/PIFwx+5AD/tYy2Oig9CRX6ZfEfxEnw3+F/iLWrSCONdG0ue4t4FXCAxxkogA6DIAxXP/s6/Ci2+C3wm0Tw8FRdQ8sXOoSDGZLlwC/PcDhB7IK7Lxn4bs/G3hHWvD95JttdUs5bOVlIyqyIVJHuM5r9Oy7A/UsLyx+OS19ei+R/DHGfFS4mz5VarbwtKXLFd4p+9L1la/pZdD8SNV1S71vU7rUL+eS6vbqVp555TlpHY5ZifUkmv1v8A2P7m9u/2bfAz6gzNOLNkUuefKWV1i/DYFr4y8N/8E8fH9547GnaxPYWXhuKb95q8NwrmaIH/AJZx/eDEdmAA9T3/AEg8PaDZeFtC0/R9NhFvp9hbpbW8Q/gjRQqj8hXkZDgsRQq1KtZNaW1667n6L4s8T5RmmBwuX5ZUjUafPeO0VytJeTd9ultbaGhXgP7Q/g/RdD1jSvHz6fpE+p200apJrt9cR2cdwvMMwtoI3a5nGAqjggKMHgY9+rmPiWryeCNVSK6ns7howIZLW+SylaTcNqJM4IQscLnH8XHNffYWo6VVNddHrbRn8v1oKcGjwb4n63eaTqXwP+M11YTaPe/aYdD1+2miaFktL9Qp8xW+ZVjnCMFbkbuea+ntwr4+8T6HonjP9lH4ry2N5p93qklnLcmWx8XzeIpGazUXCb5pMbJAwJ2IMAFTnnjiP+Hg8v8Aeh/Svell9bG00qEbuDcflo136trfZHnRxMKEm5v4rP57P8kdx+y7oHj/AFX4LfCu78Ha5ZaJYQ2niBdSfU7R7yCSd9UQxAwJPES4CXGHyQo3DHzivqbwXpGoaH4dt7XVptOuNT3yy3E+k2Js7eR3kZyyxF3Kk7ssSxy2498V4/8AsZn+y/h74p8LtxJ4Z8W6vpZX0X7QZlP0KzAj6175XnZnWlPEVIWVuZtaa6tta79TpwkEqUZdbL8kv0Cvh7/gpz4keLRvA2gI/wAk9xc30i+6KiIf/Ij19w1+eX/BTcufHXgsHPl/2dNj6+aM/wBK+LzuTjgKlutvzR+yeF1CNfizCc/2ed/NQlb8dT4ur2n9jvwUnjr9obwnaTxiS0s521GYEZGIVLrn2LhB+NeLV9c/8E1LBJ/jNr90wy1vocgX2LTw8/kP1r87y2mquMpQe11+Gp/ZHGuMngOHMdXpu0lTkl5OXu3+VzqP26vhv8RPiV8X7STw94U1jVNH0/TIrdLi0gZo3kLO7kEf7yj/AIDXxz4o8O674K1mbSNdsrrStThCmS0ugUkQMAy5HbIIP41+4dfjh+054k/4Sz4/+O9QDb0/tSW2RvVYcQr+kYr6DPsFCh/tCk3Kb26H5B4T8TYnNUsmlQhGlh6fxK/M3dWvd21u2dd+xBo8mv8A7SfhbeWeKzFxeOCScbIX2n/vorX6w1+cP/BNLQftnxX8Sasy5Wx0jyQcdGllTH6RtX6PV7fD8OXBcz6t/wCX6H5f4wYlVuJfYx2p04x++8v/AG5BXE/GL4dWnxP8C3ujXUl5HgrcxGwEJmMiZIVRMDGd3K/MMfNnIxkdtRX1MJypyU47o/DpRU4uL2Z8xaH8N20L4XfEjVNb0vxVaan/AMI9c2aXPimbTC7W4tWUpGLBtmwBEyJOcgEdzX46ea3qfzr90f2rfES+Fv2b/iNfswUnRbi1Q/7cy+Sn47pBXxR/w781T/nxH5Gv0nh7NKWGp1a2JdudpL/t1a/mj5bMsHOrKEKWvKvzf/APpZRqvw7/AGjfif4e0Z0trvx54fXX9AeXHlLqVvEYJk54JP7mQ54xXoXwV07xPazXt1qy6vaaXcQqYrHxBqAu7xZlmlBkJGRGrxeSSgOA2QAMZOV+1L4O1W+8L6P468MW5uPF/gW8/tmyhT711AF23VrxziSLPA5JVRWP4cTRLvXLH4ueFf7X8W3fiy13WFjaxqEVSiArPO3ESRkMNpIwcgK7KK/OsfF1I0sYtbe7LyaVk/nG3q79j7/KqkXSxGXSsnL3otq7fXlvdKKvd8z+Fdrs+g6+F/8Agp1oDNaeA9bVfkR7qzkb3YRug/8AHXr7V0DWU1my3GS2e8gIhvI7SbzY4Z9qsyB8DONw5wPoOleJftzeBW8bfs9a1LDH5l1oskeqxgDnahKyflG7n8K8LNKft8FUjHtf7tf0PrOBcb/ZPE+DrVdFz8r/AO304/d71z8oa+tP+CbGpLa/GzWbRiAbrQ5dvuVmhOPyz+VfJhr2P9kLxingj9obwdeTSeXbXN0dPlJOBidTGufYMyn8K/M8uqKli6U33X46H9v8Z4OWP4dx2Hhq3Tk16xXMl87H62a7q0Wg6JqGp3BxBZ28lxIfRUUsf0FfhzqV9Lqmo3N5O26e4laaRvVmJJ/U1+vX7WHiT/hFf2dvHV5u2PLp7WSnvmdhDx/38r8fB1r6TiWpepTpdk39/wDwx+MeCGC5cHjca18UoxX/AG6m3/6Uj9Bv+CY/h/yPCXjbWyv/AB9XsFmrY/55Rs5/9HCvtevm/wD4J/aF/ZH7OWnXO3a2p391dk+uH8ofpFX0hX1OVU/Z4KlHyv8Afr+p+C8e4v67xPjqt9puP/gCUf0CuH+KPjy28IWFvZzWWrXU2q77aBtJVRKH25IR3KqHCCRwM5PlnGTgHtycCvJbnVj4/wBUlstbtbGz0+xiD614X8T2CSoI1LEXUE/3HXjr8y/LzsYGu6tJ25Y7v+v6/I+Vy+lCVT2tZXhDV6/dtrv6K9k5K6PKPiP4hs/i5p3wp+H2leIb3xTbeJ9fXUr+41G3WCddNsSJ5Y5UWNMEuIlBKjOe/Wvq/wApfQV82fss+GrPxj4t8T/Fm208afoV4G0TwpbFSuzTY5WeW4weczzln55wo7Yr6Wr1cTF0YU8LLeC97/E9X92i+R5U5069eriKSajJvlva/L0vZJeeitqJ1r5Y1jT4/wBmPxpqWl6g1xb/AAT8bXLH7TbTPD/wjmoyn51LoQY7eY8hgQEY44Byfqis3xH4c0zxdoV9o2s2UOpaXexNBcWtwu5JEPUEf5xUYetGneFRXhLRr9V5rp92zZnOMrqdN2lHVM5rwNoGuaHf3Ee7R9P8JRIbfTNF023JaGNT8kpmyAS4LFk24Hy4YncW2v7U0fxe+uaEHW+S3X7JfxhSYwZEOYi3TdtIJXqAy56ivnk3niv9keGXS9SfU/FHwbZSlnrdsv2jU/DCngJMuCZrdOqvglAMEEYB6DTLfXbhvDdp8MdaEngO9iiY67Zm2ulkZmle8nuJHzIZmxGEKjG9239MDmxWHlhIxlBc9N7Nflbo+6e3TTU9vBzhmdSbq1FTqpJ66LTd3Sbk+1ruTbbd1Z/CPjn9kf4k+HvGOs6bpnhDV9W022upI7W+t7Yuk8W47HBHquM++ax7b9mr4uWdxFPB4D8QRTROHR1tGBVgcgj8a/UTwt8dvDHie11+88+TTdM0dofN1G/Ait5Y5c+VIjk/dbgjODhlPRhXf2t5BfQRT280c8MqLJHJEwZXQjIYEdQR0NfGLh/CVHzQqP5WP3qfi9n+CgqGKwcLpJNtS1dk9dbXaabXmfLH7Ulr45+Kn7MPhqz07wrqkviLU7i1fVNNSAiS32I5k3L6eYq49QQa+If+GXPiz/0IGuf+Apr9hbi7gtQhmmSISOI03sF3MeijPUn0rF8XePND8CwW8utXjW32gsIY4oJJ5JNq7m2pGrMcLknA4AzXdjcoo4ufta1RqyS6Hy/DHiLmPD+GeX5dhISUpykl7zevRWetkkvRHOfs9+ErjwL8E/BmiXlu1re22mxG4gcYaOVhvdSPUMxBr0JmCgkkADnmuR1T4r+GtI1Pw7Y3F8wk1/Z9glWFzDJvH7vL42jd0AJycivH9evL342DxFoeuLL4E13w5L9qt9RWZVhNoXKyxu5Yh0IjyzYAGY2xkc+sqkaMI0qXvNaJei/yPz14TEZliamNxn7uM25Sk1tzSabS3aUtHa9vz634h+L4vHWv6n8NLRr/AEbV2jjnhvLi3Js73ad7QOUO9Y2ClSw2kgNgnGG828VPqPxg1OH4HeGNVvbjQdNC/wDCb+IjcGZreAncNLinwC8jfcLH5lRfmyxYU6Txtrvx11N9A+FFwfsUUX9na38W7q0jSR4g2WgsSqqJZMk/OoCKeRyQa9++GPwx8P8Awi8IWnhzw5afZrGDLvJId01xKfvyyv1d2PJJ+gwAAPco0f7Pbr1/4r+Ffyro5ea6L5vpfwcXjI4ulHB4ZWpLWT/mlazadk7O3Xbpvpv6PpFnoGk2emadbR2dhZwpb29vCu1Io1AVVUdgAAKuUUVwttu7OZK2iCiiikMa6LIhVgGVhggjIIrwnxD+y8NA1y68SfCXxHP8NdcuH825sLeIT6PfN6zWhwqk9N8e0jJOCa94oroo4iph23Te+63T9U9H8zKdOFT4l/n958uT+MPF/ga3Nl8RvgvLeWIv4tSm1v4cAXltc3ERUpLLa/LMMFEJ3bvuj0qj4c+NvwXuvi/qfjFviTb6Tqd3bmA6br1tPYS2zeXHHsLSlF8seXu2bfvOx3dMfWNfOn7YX/Iqx/7hrso0sHjasYVKXK77xdlf0af4NI1+v47BU5unWbTTTTV9Ha6v52XnoZfgnxZ4P0HwVbabe/G3wjqM9vrttqa3T+IonP2eNoy8RZpOS2x+w+98xY7naT46fHD4HeM9N0uzv/iXoTzWF8LuNbGIat5v7t42jMUYcMGWQ8EEZA4Nfmrqf/IeH+9/Wvvr9h/oP9w/yr3Mbw5g8BhueTlJW2ul+NmctHiXH4nFqtFqM027pdXo9PToa2neNJfFmk+HNO+H3we8R+M20OD7PY+IPGoGl2IXKMJD5mGmAaNGCiMbSi7cYGOtg/Zp8QfFHUU1X40+KU8QxAqy+E9ARrPSE2klRKc+bc4JJG8gDJ4wa+hx0FLXzscTGhphaah57y+97fJI6KrrYp3xVRz30e2ru9PN6+pU0vSrLQ9Ot7DTrSCwsbdBHDbW0YjjjUdFVRwAPQVbooribbd2VtogooopAf/Z" />
                  <h1 style="text-align: center;">
                    <span style="font-weight:bold; ">
                      <xsl:choose>
                        <xsl:when test="//n1:Invoice/cbc:ProfileID='EARSIVFATURA' or //n1:Invoice/cbc:ProfileID='EBELGE'">
                          <xsl:text>e-Arşiv Fatura</xsl:text>
                        </xsl:when>
                        <xsl:when test="//n1:Invoice/cbc:ProfileID='EGIDERPUSULASI'">
                          <xsl:text>e-Gider Pusulası</xsl:text>
                        </xsl:when>
                        <xsl:otherwise>
                          <xsl:text>e-FATURA</xsl:text>
                        </xsl:otherwise>
                      </xsl:choose>
                    </span>
                  </h1>
                </td>
                <!-- FIRMA LOGOSU -->
                   
                <td style="width: 20%; text-align: center;">
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
                  <script type="text/javascript">var qrcode = new QRCode(document.getElementById("qrcode"), { width : 160, height : 160, correctLevel : QRCode.CorrectLevel.L, }); var minifiedValues = JSON.stringify(JSON.parse(document.getElementById("qrvalue").innerHTML));qrcode.makeCode(minifiedValues)</script>
                </td>
              </tr>
            </tbody>
          </table>
          <!-- ALICI - IMZA - FATURA BILGILERI TABLOSU -->
          <table>
            <tbody>
              <tr>
                <td style="width: 40%;">
                  <table id="customerPartyTable" align="left" border="0">
                    <tbody>
                      <tr>
                        <td>
                          <hr />
                          <table align="center" border="0">
                            <tbody>
                              <tr>
                                <xsl:for-each select="n1:Invoice/cac:AccountingCustomerParty/cac:Party">
                                  <td style="width:469px; " align="left">
                                    <span style="font-weight:bold; ">
                                      <xsl:text>SAYIN</xsl:text>
                                    </span>
                                  </td>
                                </xsl:for-each>
                              </tr>
                              <tr>
                                <xsl:choose>
                                  <xsl:when test="n1:Invoice/cac:BuyerCustomerParty/cac:Party/cac:PartyIdentification/cbc:ID[@schemeID='PARTYTYPE' and text()='TAXFREE']">
                                    <xsl:for-each select="n1:Invoice/cac:BuyerCustomerParty/cac:Party">
                                      <xsl:call-template name="Party_Title">
                                        <xsl:with-param name="PartyType">TAXFREE</xsl:with-param>
                                      </xsl:call-template>
                                    </xsl:for-each>
                                  </xsl:when>
                                  <xsl:when test="n1:Invoice/cac:BuyerCustomerParty/cac:Party/cac:PartyIdentification/cbc:ID[@schemeID='PARTYTYPE' and starts-with(text(), 'EXPORT')]">
                                    <xsl:for-each select="n1:Invoice/cac:BuyerCustomerParty/cac:Party">
                                      <xsl:call-template name="Party_Title">
                                        <xsl:with-param name="PartyType">EXPORT</xsl:with-param>
                                      </xsl:call-template>
                                    </xsl:for-each>
                                  </xsl:when>
                                  <xsl:otherwise>
                                    <xsl:for-each select="n1:Invoice/cac:AccountingCustomerParty/cac:Party">
                                      <xsl:call-template name="Party_Title">
                                        <xsl:with-param name="PartyType">OTHER</xsl:with-param>
                                      </xsl:call-template>
                                    </xsl:for-each>
                                  </xsl:otherwise>
                                </xsl:choose>
                              </tr>
                              <xsl:choose>
                                <xsl:when test="n1:Invoice/cac:BuyerCustomerParty/cac:Party/cac:PartyIdentification/cbc:ID[@schemeID='PARTYTYPE' and text()='TAXFREE']">
                                  <xsl:for-each select="n1:Invoice/cac:BuyerCustomerParty/cac:Party">
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
                                <xsl:when test="n1:Invoice/cac:BuyerCustomerParty/cac:Party/cac:PartyIdentification/cbc:ID[@schemeID='PARTYTYPE' and starts-with(text(), 'EXPORT')]">
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
                                  <xsl:for-each select="n1:Invoice/cac:AccountingCustomerParty/cac:Party">
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
                              <xsl:if test="$varSenaryoName='1' and not($varVknComp='1')">
                                <tr align="left">
                                  <td style="width:469px; " align="left">
                                    <span style="font-weight:bold; ">
                                      <br></br>
                                      <xsl:text> Ödeme Yapacak Kurum </xsl:text>
                                    </span>
                                  </td>
                                </tr>
                                <tr align="left">
                                  <td>
                                    <xsl:text> VKN: </xsl:text>
                                    <xsl:value-of select="n1:Invoice/cac:BuyerCustomerParty/cac:Party/cac:PartyIdentification/cbc:ID[@schemeID='VKN']" />
                                  </td>
                                </tr>
                                <tr align="left">
                                  <td>
                                    <xsl:text> Ünvan: </xsl:text>
                                    <xsl:value-of select="n1:Invoice/cac:BuyerCustomerParty/cac:Party/cac:PartyName/cbc:Name" />
                                  </td>
                                </tr>
                                <tr align="left">
                                  <td>
                                    <xsl:text> Adres: </xsl:text>
                                    <xsl:value-of select="n1:Invoice/cac:BuyerCustomerParty/cac:Party/cac:PostalAddress/cbc:CityName" />
                                    <xsl:text>/ </xsl:text>
                                    <xsl:value-of select="n1:Invoice/cac:BuyerCustomerParty/cac:Party/cac:PostalAddress/cac:Country/cbc:Name" />
                                  </td>
                                </tr>
                              </xsl:if>
                            </tbody>
                          </table>
                          <hr />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
                <td style="width: 30%; text-align: center;">
                  <!-- SIGN_REF -->
                </td>
                <td style="width: 30%;">
                  <table style="width:100%; border-collapse: collapse;">
                    <tbody>
                      <tr>
                        <td id="invoice-info-td" style="width: 50%;">
                          <span style="font-weight:bold; ">
                            <xsl:text>Özelleştirme No:</xsl:text>
                          </span>
                        </td>
                        <td id="invoice-info-td" style="width: 50%;">
                          <xsl:for-each select="n1:Invoice/cbc:CustomizationID">
                            <xsl:apply-templates />
                          </xsl:for-each>
                        </td>
                      </tr>
                      <tr style="height:13px; ">
                        <td id="invoice-info-td" style="width: 50%;">
                          <span style="font-weight:bold; ">
                            <xsl:text>Senaryo:</xsl:text>
                          </span>
                        </td>
                        <td id="invoice-info-td" style="width: 50%;">
                          <xsl:for-each select="n1:Invoice/cbc:ProfileID">
                            <xsl:apply-templates />
                          </xsl:for-each>
                        </td>
                      </tr>
                      <xsl:if test="not(//n1:Invoice/cbc:ProfileID='EGIDERPUSULASI')">
                        <tr style="height:13px; ">
                          <td id="invoice-info-td" style="width: 50%;">
                            <span style="font-weight:bold; ">
                              <xsl:text>Fatura Tipi:</xsl:text>
                            </span>
                          </td>
                          <td id="invoice-info-td" style="width: 50%;">
                            <xsl:for-each select="n1:Invoice/cbc:InvoiceTypeCode">
                              <xsl:apply-templates />
                            </xsl:for-each>
                          </td>
                        </tr>
                      </xsl:if>
                      <xsl:if test="//n1:Invoice/cbc:AccountingCost">
                        <tr style="height:13px; ">
                          <td id="invoice-info-td" style="width: 50%;">
                            <span style="font-weight:bold; ">
                              <xsl:text>İlave Fatura Tipi:</xsl:text>
                            </span>
                          </td>
                          <td id="invoice-info-td" style="width: 50%;">
                            <xsl:for-each select="n1:Invoice/cbc:AccountingCost">
                              <xsl:apply-templates />
                            </xsl:for-each>
                          </td>
                        </tr>
                      </xsl:if>
                      <tr style="height:13px; ">
                        <td id="invoice-info-td" style="width: 50%;">
                          <xsl:choose>
                            <xsl:when test="//n1:Invoice/cbc:ProfileID='EGIDERPUSULASI'">
                              <span style="font-weight:bold; ">
                                <xsl:text>Pusula No:</xsl:text>
                              </span>
                            </xsl:when>
                            <xsl:otherwise>
                              <span style="font-weight:bold; ">
                                <xsl:text>Fatura No:</xsl:text>
                              </span>
                            </xsl:otherwise>
                          </xsl:choose>
                        </td>
                        <td id="invoice-info-td" style="width: 50%;">
                          <xsl:for-each select="n1:Invoice/cbc:ID">
                            <xsl:apply-templates />
                          </xsl:for-each>
                        </td>
                      </tr>
                      <tr style="height:13px; ">
                        <td id="invoice-info-td" style="width: 50%;">
                          <xsl:choose>
                            <xsl:when test="//n1:Invoice/cbc:ProfileID='EGIDERPUSULASI'">
                              <span style="font-weight:bold; ">
                                <xsl:text>Pusula Tarihi:</xsl:text>
                              </span>
                            </xsl:when>
                            <xsl:otherwise>
                              <span style="font-weight:bold; ">
                                <xsl:text>Fatura Tarihi:</xsl:text>
                              </span>
                            </xsl:otherwise>
                          </xsl:choose>
                        </td>
                        <td id="invoice-info-td" style="width: 50%;">
                          <xsl:for-each select="n1:Invoice/cbc:IssueDate">
                            <xsl:apply-templates select="." />
                            <xsl:text> </xsl:text>
                            <xsl:value-of select="substring(../cbc:IssueTime,1,5)" />
                          </xsl:for-each>
                        </td>
                      </tr>
                      <xsl:for-each select="//n1:Invoice/cac:AdditionalDocumentReference/cbc:DocumentTypeCode[text()='MUKELLEF_KODU' or text()='MUKELLEF_ADI' or text()='DOSYA_NO']">
                        <tr style="height:13px; ">
                          <td id="invoice-info-td" style="width: 50%;">
                            <span style="font-weight:bold;">
                              <xsl:if test="../cbc:DocumentTypeCode='MUKELLEF_KODU'">
                                <xsl:text>Mükellef Kodu:</xsl:text>
                              </xsl:if>
                              <xsl:if test="../cbc:DocumentTypeCode='MUKELLEF_ADI'">
                                <xsl:text>Mükellef Adı:</xsl:text>
                              </xsl:if>
                              <xsl:if test="../cbc:DocumentTypeCode='DOSYA_NO'">
                                <xsl:text>Dosya No:</xsl:text>
                              </xsl:if>
                            </span>
                          </td>
                          <td id="invoice-info-td" style="width: 50%;">
                            <xsl:value-of select="../cbc:DocumentType" />
                          </td>
                        </tr>
                      </xsl:for-each>
                      <xsl:if test="(//n1:Invoice/cbc:AccountingCost) and (//n1:Invoice/cac:InvoicePeriod)">
                        <tr style="height:13px; ">
                          <td id="invoice-info-td" style="width: 50%;">
                            <span style="font-weight:bold;">
                              <xsl:text>Dönem Başlangıcı:</xsl:text>
                            </span>
                          </td>
                          <td id="invoice-info-td" style="width: 50%;">
                            <xsl:for-each select="//n1:Invoice/cac:InvoicePeriod">
                              <xsl:apply-templates select="cbc:StartDate" />
                            </xsl:for-each>
                          </td>
                        </tr>
                        <tr style="height:13px; ">
                          <td id="invoice-info-td" style="width: 50%;">
                            <span style="font-weight:bold;">
                              <xsl:text>Dönem Bitişi:</xsl:text>
                            </span>
                          </td>
                          <td id="invoice-info-td" style="width: 50%;">
                            <xsl:for-each select="//n1:Invoice/cac:InvoicePeriod">
                              <xsl:apply-templates select="cbc:EndDate" />
                            </xsl:for-each>
                          </td>
                        </tr>
                      </xsl:if>
                      <xsl:for-each select="n1:Invoice/cac:DespatchDocumentReference">
                        <tr style="height:13px; ">
                          <td id="invoice-info-td" style="width: 50%;">
                            <span style="font-weight:bold; ">
                              <xsl:text>İrsaliye No:</xsl:text>
                            </span>
                            <xsl:text> </xsl:text>
                          </td>
                          <td id="invoice-info-td" style="width: 50%;">
                            <xsl:value-of select="cbc:ID" />
                          </td>
                        </tr>
                        <tr style="height:13px; ">
                          <td id="invoice-info-td" style="width: 50%;">
                            <span style="font-weight:bold; ">
                              <xsl:text>İrsaliye Tarihi:</xsl:text>
                            </span>
                          </td>
                          <td id="invoice-info-td" style="width: 50%;">
                            <xsl:for-each select="cbc:IssueDate">
                              <xsl:apply-templates select="." />
                            </xsl:for-each>
                          </td>
                        </tr>
                      </xsl:for-each>
                      <xsl:if test="//n1:Invoice/cbc:paymentDueDate">
                        <tr style="height:13px; ">
                          <td id="invoice-info-td" style="width: 50%;">
                            <span style="font-weight:bold; ">
                              <xsl:text>Son Ödeme Tarihi:</xsl:text>
                            </span>
                          </td>
                          <td id="invoice-info-td" style="width: 50%;">
                            <xsl:for-each select="n1:Invoice/cbc:paymentDueDate">
                              <xsl:apply-templates />
                            </xsl:for-each>
                          </td>
                        </tr>
                      </xsl:if>
                      <xsl:if test="//n1:Invoice/cac:OrderReference">
                        <tr style="height:13px">
                          <td id="invoice-info-td" style="width: 50%;">
                            <span style="font-weight:bold; ">
                              <xsl:text>Sipariş No:</xsl:text>
                            </span>
                          </td>
                          <td id="invoice-info-td" style="width: 50%;">
                            <xsl:for-each select="n1:Invoice/cac:OrderReference/cbc:ID">
                              <xsl:apply-templates />
                            </xsl:for-each>
                          </td>
                        </tr>
                      </xsl:if>
                      <xsl:if test="//n1:Invoice/cac:OrderReference/cbc:IssueDate">
                        <tr style="height:13px">
                          <td id="invoice-info-td" style="width: 50%;">
                            <span style="font-weight:bold; ">
                              <xsl:text>Sipariş Tarihi:</xsl:text>
                            </span>
                          </td>
                          <td id="invoice-info-td" style="width: 50%;">
                            <xsl:for-each select="n1:Invoice/cac:OrderReference/cbc:IssueDate">
                              <xsl:apply-templates select="." />
                            </xsl:for-each>
                          </td>
                        </tr>
                      </xsl:if>
                      <xsl:if test="n1:Invoice/cac:AccountingCustomerParty/cac:Party/cac:PartyIdentification/cbc:ID[@schemeID='VKN' and text()='7350019759']">
                        <tr style="height:13px">
                          <td id="invoice-info-td" style="width: 50%;">
                            <span style="font-weight:bold; ">
                              <xsl:text>Sipariş Sorumlusu:</xsl:text>
                            </span>
                          </td>
                          <td id="invoice-info-td" style="width: 50%;">
                            <xsl:value-of select="$varsiparissorumlusu" />
                          </td>
                        </tr>
                      </xsl:if>
                      <xsl:for-each select="n1:Invoice/cac:ReceiptDocumentReference">
                        <tr style="height:13px; ">
                          <td id="invoice-info-td" style="width: 50%;">
                            <span style="font-weight:bold; ">
                              <xsl:text>Mal Kabul No:</xsl:text>
                            </span>
                            <xsl:text> </xsl:text>
                          </td>
                          <td id="invoice-info-td" style="width: 50%;">
                            <xsl:value-of select="cbc:ID" />
                          </td>
                        </tr>
                      </xsl:for-each>
                      <xsl:for-each select="n1:Invoice/cac:TaxRepresentativeParty/cac:PartyIdentification/cbc:ID[@schemeID='ARACIKURUMVKN']">
                        <tr>
                          <td id="invoice-info-td" style="width: 50%;">
                            <span style="font-weight:bold; ">
                              <xsl:text>Aracı Kurum VKN:</xsl:text>
                            </span>
                          </td>
                          <td id="invoice-info-td" style="width: 50%;">
                            <xsl:value-of select="." />
                          </td>
                        </tr>
                        <tr>
                          <td id="invoice-info-td" style="width: 50%;">
                            <span style="font-weight:bold; ">
                              <xsl:text>Aracı Kurum Unvan:</xsl:text>
                            </span>
                          </td>
                          <td id="invoice-info-td" style="width: 50%;">
                            <xsl:value-of select="../../cac:PartyName/cbc:Name" />
                          </td>
                        </tr>
                      </xsl:for-each>
                      <!--											<xsl:if	test="//n1:Invoice/cac:PaymentMeans/cbc:PaymentMeansCode">-->
                      <!--												<tr style="height:13px">-->
                      <!--													<td id="invoice-info-td" style="width: 50%;">-->
                      <!--														<span style="font-weight:bold; ">-->
                      <!--															<xsl:text>Ödeme Şekli:</xsl:text>-->
                      <!--														</span>-->
                      <!--													</td>-->
                      <!--													<td id="invoice-info-td" style="width: 50%;">-->
                      <!--														<xsl:for-each select="n1:Invoice/cac:PaymentMeans/cbc:PaymentMeansCode">-->
                      <!--															<xsl:call-template name="PaymentMeansCode">-->
                      <!--																<xsl:with-param name="PaymentMeansCodeType">-->
                      <!--																	<xsl:value-of select="."/>-->
                      <!--																</xsl:with-param>-->
                      <!--															</xsl:call-template>-->
                      <!--														</xsl:for-each>-->
                      <!--													</td>-->
                      <!--												</tr>-->
                      <!--											</xsl:if>-->
                      <xsl:if test="//n1:Invoice/cac:PaymentMeans/cbc:PaymentDueDate">
                        <tr style="height:13px">
                          <td id="invoice-info-td" style="width: 50%;">
                            <span style="font-weight:bold; ">
                              <xsl:text>Ödeme Tarihi:</xsl:text>
                            </span>
                          </td>
                          <td id="invoice-info-td" style="width: 50%;">
                            <xsl:for-each select="n1:Invoice/cac:PaymentMeans/cbc:PaymentDueDate">
                              <xsl:value-of select="substring(.,9,2)" />-<xsl:value-of select="substring(.,6,2)" />-<xsl:value-of select="substring(.,1,4)" /></xsl:for-each>
                          </td>
                        </tr>
                      </xsl:if>
                    </tbody>
                  </table>
                </td>
              </tr>
            </tbody>
          </table>
          <!-- ETTN SATIRI -->
          <table style="width: 40%; margin-bottom: 5px;">
            <tr>
              <td style="width: 100%;">
                <span style="font-weight:bold; ">
                  <xsl:text>ETTN:</xsl:text>
                </span>
								 
								<xsl:for-each select="n1:Invoice/cbc:UUID"><xsl:apply-templates /></xsl:for-each></td>
            </tr>
          </table>
          <!-- URUNLER SATIRI (TABLOSU) -->
          <table style="width: 100%; border-collapse: collapse; border-style: solid; border-width: 2px;">
            <tbody>
              <tr>
                <td id="invoice-line-td" style="width:3%">
                  <span style="font-weight:bold;">
                    <xsl:text>Sıra No</xsl:text>
                  </span>
                </td>
                <xsl:choose>
                  <xsl:when test="$varItemCode &gt; 0">
                    <td id="invoice-line-td" style="width:7%">
                      <span style="font-weight:bold;">
                        <xsl:text>Ürün Kodu</xsl:text>
                      </span>
                    </td>
                  </xsl:when>
                  <xsl:otherwise></xsl:otherwise>
                </xsl:choose>
                <xsl:choose>
                  <xsl:when test="//n1:Invoice/cac:AccountingCustomerParty/cac:Party/cac:PartyIdentification/cbc:ID[@schemeID='VKN' and text()='7350019759']">
                    <td id="invoice-line-td" style="width:7%">
                      <span style="font-weight:bold;">
                        <xsl:text>Sipariş Satır No</xsl:text>
                      </span>
                    </td>
                  </xsl:when>
                </xsl:choose>
                <xsl:if test="$varfaturatipi='SGK'">
                  <td id="invoice-line-td" style="width:80%">
                    <span style="font-weight:bold;">
                      <xsl:text>Açıklama</xsl:text>
                    </span>
                  </td>
                </xsl:if>
                <xsl:if test="not($varfaturatipi='SGK')">
                  <td id="invoice-line-td" style="width:20%">
                    <span style="font-weight:bold;">
                      <xsl:text>Mal Hizmet</xsl:text>
                    </span>
                  </td>
                  <td id="invoice-line-td" style="width:7.4%">
                    <span style="font-weight:bold;">
                      <xsl:text>Miktar</xsl:text>
                    </span>
                  </td>
                  <xsl:if test="$varEtiketFiyati='1'">
                    <td id="invoice-line-td" class="table-background table-header" style="width:10%; border-color: #c9c9c9">
                      <span style="font-weight:bold;">
                        <xsl:text>Etiket Fiyatı</xsl:text>
                      </span>
                    </td>
                  </xsl:if>
                  <xsl:if test="$varDepocuFiyati='1'">
                    <td id="invoice-line-td" class="table-background table-header" style="width:9%; border-color: #c9c9c9">
                      <span style="font-weight:bold;">
                        <xsl:text>Depocu Fiyatı</xsl:text>
                      </span>
                    </td>
                  </xsl:if>
                  <td id="invoice-line-td" class="table-background table-header" style="width:9%; border-color: #c9c9c9">
                    <span style="font-weight:bold;">
                      <xsl:text>Birim Fiyat</xsl:text>
                    </span>
                  </td>
                  <xsl:if test="$varEczaciKar='1'">
                    <td id="invoice-line-td" class="table-background table-header" style="width:10%; border-color: #c9c9c9">
                      <span style="font-weight:bold;">
                        <xsl:text>Eczacı Kâr Oranı.</xsl:text>
                      </span>
                    </td>
                  </xsl:if>
                  <xsl:if test="$varKurumIskonto='1'">
                    <td id="invoice-line-td" class="table-background table-header" style="width:10%; border-color: #c9c9c9">
                      <span style="font-weight:bold;">
                        <xsl:text>Kurum İskontosu</xsl:text>
                      </span>
                    </td>
                  </xsl:if>
                  <xsl:if test="$varVade='1'">
                    <td id="invoice-line-td" class="table-background table-header" style="width:10%; border-color: #c9c9c9">
                      <span style="font-weight:bold;">
                        <xsl:text>Vade Tarihi</xsl:text>
                      </span>
                    </td>
                  </xsl:if>
                  <xsl:if test="$varAllowanceRate &gt; 0">
                    <td id="invoice-line-td" style="width:7%">
                      <span style="font-weight:bold;">
                        <xsl:text>İskonto/ Arttırım Oranı</xsl:text>
                      </span>
                    </td>
                  </xsl:if>
                  <xsl:if test="$varAllowanceAmount &gt; 0">
                    <td id="invoice-line-td" style="width:9%">
                      <span style="font-weight:bold;">
                        <xsl:text>İskonto/ Arttırım Tutarı</xsl:text>
                      </span>
                    </td>
                  </xsl:if>
                  <xsl:if test="$varAllowanceReason &gt; 0">
                    <td id="invoice-line-td" style="width:9%">
                      <span style="font-weight:bold;">
                        <xsl:text>İskonto/ Arttırım Nedeni</xsl:text>
                      </span>
                    </td>
                  </xsl:if>
                  <td id="invoice-line-td" style="width:7%">
                    <span style="font-weight:bold;">
                      <xsl:text>KDV Oranı</xsl:text>
                    </span>
                  </td>
                  <td id="invoice-line-td" style="width:10%">
                    <span style="font-weight:bold;">
                      <xsl:text>KDV Tutarı</xsl:text>
                    </span>
                  </td>
                  
                </xsl:if>
                <td id="invoice-line-td" style="width:10.6%">
                  <span style="font-weight:bold;">
                    <xsl:text>Mal Hizmet Tutarı</xsl:text>
                  </span>
                </td>
                <xsl:if test="//n1:Invoice/cbc:ProfileID='EARSIVFATURA' and //n1:Invoice/cbc:InvoiceTypeCode='ISTISNA'">
                  <td id="invoice-line-td" style="width:10.6%">
                    <span style="font-weight:bold;">
                      <xsl:text>GTIP</xsl:text>
                    </span>
                  </td>
                </xsl:if>
                <xsl:if test="//n1:Invoice/cbc:ProfileID='HKS' or /n1:Invoice/cbc:InvoiceTypeCode='HKSSATIS' or /n1:Invoice/cbc:InvoiceTypeCode='HKSKOMISYONCU'">
                  <td id="invoice-line-td" style="width:5%">
                    <span style="font-weight:bold;">
                      <xsl:text>Künye Numarası</xsl:text>
                    </span>
                  </td>
                </xsl:if>
                <xsl:if test="//n1:Invoice/cbc:ProfileID='HKS' and /n1:Invoice/cbc:InvoiceTypeCode='SATIS'">
                  <td id="invoice-line-td" style="width:5%">
                    <span style="font-weight:bold;">
                      <xsl:text>Mal Sahibi VKN/TCKN</xsl:text>
                    </span>
                  </td>
                  <td id="invoice-line-td" style="width:5%">
                    <span style="font-weight:bold;">
                      <xsl:text>Mal Sahibi Ad/Soyad</xsl:text>
                    </span>
                  </td>
                </xsl:if>
                <xsl:if test="//n1:Invoice/cbc:InvoiceTypeCode='HKSSATIS'">
                  <td id="invoice-line-td" style="width:5%">
                    <span style="font-weight:bold;">
                      <xsl:text>Mal Sahibi VKN/TCKN</xsl:text>
                    </span>
                  </td>
                  <td id="invoice-line-td" style="width:5%">
                    <span style="font-weight:bold;">
                      <xsl:text>Mal Sahibi Ad/Soyad</xsl:text>
                    </span>
                  </td>
                </xsl:if>
                <xsl:if test="//n1:Invoice/cbc:ProfileID='IHRACAT' or //n1:Invoice/cbc:ProfileID='OZELFATURA'">
                  <td id="invoice-line-td" style="width:10.6%">
                    <span style="font-weight:bold;">
                      <xsl:text>Teslim Şartı</xsl:text>
                    </span>
                  </td>
                  <td id="invoice-line-td" style="width:10.6%">
                    <span style="font-weight:bold;">
                      <xsl:text>Eşya Kap Cinsi</xsl:text>
                    </span>
                  </td>
                  <td id="invoice-line-td" style="width:10.6%">
                    <span style="font-weight:bold;">
                      <xsl:text>Kap No</xsl:text>
                    </span>
                  </td>
                  <td id="invoice-line-td" style="width:10.6%">
                    <span style="font-weight:bold;">
                      <xsl:text>Kap Adet</xsl:text>
                    </span>
                  </td>
                  <td id="invoice-line-td" style="width:10.6%">
                    <span style="font-weight:bold;">
                      <xsl:text>Teslim/Bedel Ödeme Yeri</xsl:text>
                    </span>
                  </td>
                  <td id="invoice-line-td" style="width:10.6%">
                    <span style="font-weight:bold;">
                      <xsl:text>Gönderilme Şekli</xsl:text>
                    </span>
                  </td>
                  <td id="invoice-line-td" style="width:10.6%">
                    <span style="font-weight:bold;">
                      <xsl:text>GTİP</xsl:text>
                    </span>
                  </td>
                  <td id="invoice-line-td" style="width:10.6%">
                    <span style="font-weight:bold;">
                      <xsl:text>Byn. Edilen Kıymet Değeri</xsl:text>
                    </span>
                  </td>
                </xsl:if>
              </tr>
              <xsl:if test="count(//n1:Invoice/cac:InvoiceLine) &gt;= 1">
                <xsl:for-each select="//n1:Invoice/cac:InvoiceLine">
                  <xsl:apply-templates select="." />
                </xsl:for-each>
              </xsl:if>
              <xsl:if test="count(//n1:Invoice/cac:InvoiceLine) &lt; 1">
                <xsl:choose>
                  <xsl:when test="//n1:Invoice/cac:InvoiceLine[1]">
                    <xsl:apply-templates select="//n1:Invoice/cac:InvoiceLine[1]" />
                  </xsl:when>
                  <xsl:otherwise>
                    <xsl:apply-templates select="//n1:Invoice" />
                  </xsl:otherwise>
                </xsl:choose>
              </xsl:if>
            </tbody>
          </table>
        </xsl:for-each>
        <table id="budgetContainerTable" table-layout="fixed" width="850px">
          <tbody>
            <tr>
              <xsl:if test="//n1:Invoice/cbc:InvoiceTypeCode='HKSKOMISYONCU' or //n1:Invoice/cbc:InvoiceTypeCode='KOMISYONCU'">
                <td align="left" valign="top" width="300px">
                  <table>
                    <tbody>
                      <xsl:for-each select="n1:Invoice/cac:AllowanceCharge">
                        <xsl:if test="cbc:AllowanceChargeReason = 'HKSKOMISYON'">
                          <tr align="left" border="0">
                            <td align="left" width="200px">
                              <span style="font-weight:bold; ">
                                <xsl:text>Masraflar:</xsl:text>
                              </span>
                            </td>
                          </tr>
                          <tr align="left">
                            <td class="lineTableBudgetTd" align="right" width="200px">
                              <span style="font-weight:bold; ">
                                <xsl:text>Komisyon - %</xsl:text>
                              </span>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:Amount">
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:MultiplierFactorNumeric">
                                <xsl:text> %</xsl:text>
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                          </tr>
                        </xsl:if>
                        <xsl:if test="cbc:AllowanceChargeReason = 'HKSKOMISYONKDV'">
                          <tr align="right">
                            <td class="lineTableBudgetTd" align="right" width="200px">
                              <span style="font-weight:bold; ">
                                <xsl:text>Komisyon KDV - %</xsl:text>
                              </span>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:Amount">
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:MultiplierFactorNumeric">
                                <xsl:text> %</xsl:text>
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                          </tr>
                        </xsl:if>
                        <xsl:if test="cbc:AllowanceChargeReason = 'HKSNAVLUN'">
                          <tr align="right">
                            <td class="lineTableBudgetTd" align="right" width="200px">
                              <span style="font-weight:bold; ">
                                <xsl:text>Navlun - %</xsl:text>
                              </span>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:Amount">
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:MultiplierFactorNumeric">
                                <xsl:text> %</xsl:text>
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                          </tr>
                        </xsl:if>
                        <xsl:if test="cbc:AllowanceChargeReason = 'HKSNAVLUNKDV'">
                          <tr align="right">
                            <td class="lineTableBudgetTd" align="right" width="200px">
                              <span style="font-weight:bold; ">
                                <xsl:text>Navlun KDV - %</xsl:text>
                              </span>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:Amount">
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:MultiplierFactorNumeric">
                                <xsl:text> %</xsl:text>
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                          </tr>
                        </xsl:if>
                        <xsl:if test="cbc:AllowanceChargeReason = 'HKSHAMMALIYE'">
                          <tr align="right">
                            <td class="lineTableBudgetTd" align="right" width="200px">
                              <span style="font-weight:bold; ">
                                <xsl:text>Hammaliye - %</xsl:text>
                              </span>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:Amount">
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:MultiplierFactorNumeric">
                                <xsl:text> %</xsl:text>
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                          </tr>
                        </xsl:if>
                        <xsl:if test="cbc:AllowanceChargeReason = 'HKSHAMMALIYEKDV'">
                          <tr align="right">
                            <td class="lineTableBudgetTd" align="right" width="200px">
                              <span style="font-weight:bold; ">
                                <xsl:text>Hammaliye KDV - %</xsl:text>
                              </span>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:Amount">
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:MultiplierFactorNumeric">
                                <xsl:text> %</xsl:text>
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                          </tr>
                        </xsl:if>
                        <xsl:if test="cbc:AllowanceChargeReason = 'HKSNAKLIYE'">
                          <tr align="right">
                            <td class="lineTableBudgetTd" align="right" width="200px">
                              <span style="font-weight:bold; ">
                                <xsl:text>Nakliye - %</xsl:text>
                              </span>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:Amount">
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:MultiplierFactorNumeric">
                                <xsl:text> %</xsl:text>
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                          </tr>
                        </xsl:if>
                        <xsl:if test="cbc:AllowanceChargeReason = 'HKSNAKLIYEKDV'">
                          <tr align="right">
                            <td class="lineTableBudgetTd" align="right" width="200px">
                              <span style="font-weight:bold; ">
                                <xsl:text>Nakliye KDV - %</xsl:text>
                              </span>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:Amount">
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:MultiplierFactorNumeric">
                                <xsl:text> %</xsl:text>
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                          </tr>
                        </xsl:if>
                        <xsl:if test="cbc:AllowanceChargeReason = 'HKSGVTEVKIFAT'">
                          <tr align="right">
                            <td class="lineTableBudgetTd" align="right" width="200px">
                              <span style="font-weight:bold; ">
                                <xsl:text>G.V. Tevkifat - %</xsl:text>
                              </span>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:Amount">
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:MultiplierFactorNumeric">
                                <xsl:text> %</xsl:text>
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                          </tr>
                        </xsl:if>
                        <xsl:if test="cbc:AllowanceChargeReason = 'HKSBAGKURTEVKIFAT'">
                          <tr align="right">
                            <td class="lineTableBudgetTd" align="right" width="200px">
                              <span style="font-weight:bold; ">
                                <xsl:text>Bağkur Tevkifat - %</xsl:text>
                              </span>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:Amount">
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:MultiplierFactorNumeric">
                                <xsl:text> %</xsl:text>
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                          </tr>
                        </xsl:if>
                        <xsl:if test="cbc:AllowanceChargeReason = 'HKSRUSUM'">
                          <tr align="right">
                            <td class="lineTableBudgetTd" align="right" width="200px">
                              <span style="font-weight:bold; ">
                                <xsl:text>Rüsum - %</xsl:text>
                              </span>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:Amount">
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:MultiplierFactorNumeric">
                                <xsl:text> %</xsl:text>
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                          </tr>
                        </xsl:if>
                        <xsl:if test="cbc:AllowanceChargeReason = 'HKSRUSUMKDV'">
                          <tr align="right">
                            <td class="lineTableBudgetTd" align="right" width="200px">
                              <span style="font-weight:bold; ">
                                <xsl:text>Rüsum KDV - %</xsl:text>
                              </span>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:Amount">
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:MultiplierFactorNumeric">
                                <xsl:text> %</xsl:text>
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                          </tr>
                        </xsl:if>
                        <xsl:if test="cbc:AllowanceChargeReason = 'HKSTICBORSASI'">
                          <tr align="right">
                            <td class="lineTableBudgetTd" align="right" width="200px">
                              <span style="font-weight:bold; ">
                                <xsl:text>Ticaret Borsası - %</xsl:text>
                              </span>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:Amount">
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:MultiplierFactorNumeric">
                                <xsl:text> %</xsl:text>
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                          </tr>
                        </xsl:if>
                        <xsl:if test="cbc:AllowanceChargeReason = 'HKSTICBORSASIKDV'">
                          <tr align="right">
                            <td class="lineTableBudgetTd" align="right" width="200px">
                              <span style="font-weight:bold; ">
                                <xsl:text>Ticaret Borsası KDV - %</xsl:text>
                              </span>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:Amount">
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:MultiplierFactorNumeric">
                                <xsl:text> %</xsl:text>
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                          </tr>
                        </xsl:if>
                        <xsl:if test="cbc:AllowanceChargeReason = 'HKSMILLISAVUNMAFON'">
                          <tr align="right">
                            <td class="lineTableBudgetTd" align="right" width="200px">
                              <span style="font-weight:bold; ">
                                <xsl:text>Milli Savunma Fon - %</xsl:text>
                              </span>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:Amount">
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:MultiplierFactorNumeric">
                                <xsl:text> %</xsl:text>
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                          </tr>
                        </xsl:if>
                        <xsl:if test="cbc:AllowanceChargeReason = 'HKSMSFONKDV'">
                          <tr align="right">
                            <td class="lineTableBudgetTd" align="right" width="200px">
                              <span style="font-weight:bold; ">
                                <xsl:text>Milli Savunma Fon KDV - %</xsl:text>
                              </span>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:Amount">
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:MultiplierFactorNumeric">
                                <xsl:text> %</xsl:text>
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                          </tr>
                        </xsl:if>
                        <xsl:if test="cbc:AllowanceChargeReason = 'HKSDIGERMASRAFLAR'">
                          <tr align="right">
                            <td class="lineTableBudgetTd" align="right" width="200px">
                              <span style="font-weight:bold; ">
                                <xsl:text>Diğer Masraflar - %</xsl:text>
                              </span>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:Amount">
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:MultiplierFactorNumeric">
                                <xsl:text> %</xsl:text>
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                          </tr>
                        </xsl:if>
                        <xsl:if test="cbc:AllowanceChargeReason = 'HKSDIGERKDV'">
                          <tr align="right">
                            <td class="lineTableBudgetTd" align="right" width="200px">
                              <span style="font-weight:bold; ">
                                <xsl:text>Diğer KDV - %</xsl:text>
                              </span>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:Amount">
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                            <td class="lineTableBudgetTd" style="width:81px; " align="right">
                              <xsl:for-each select="cbc:MultiplierFactorNumeric">
                                <xsl:text> %</xsl:text>
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </td>
                          </tr>
                        </xsl:if>
                      </xsl:for-each>
                    </tbody>
                  </table>
                </td>
              </xsl:if>
              <td align="right" valign="top">
                <table>
                  <tbody>
                    <xsl:if test="not($varfaturatipi='SGK' and $varoptik='medula')">
                      <tr align="right">
                        <td />
                        <td class="lineTableBudgetTd" align="right" width="200px">
                          <span style="font-weight:bold; ">
                            <xsl:text>Mal Hizmet Toplam Tutarı</xsl:text>
                          </span>
                        </td>
                        <td class="lineTableBudgetTd" style="width:81px; " align="right">
                          <xsl:for-each select="n1:Invoice/cac:LegalMonetaryTotal/cbc:LineExtensionAmount">
                            <xsl:call-template name="Curr_Type" />
                          </xsl:for-each>
                        </td>
                      </tr>
                    </xsl:if>
                    <xsl:for-each select="n1:Invoice/cac:TaxTotal/cac:TaxSubtotal">
                      <xsl:if test="cac:TaxCategory/cac:TaxScheme/cbc:TaxTypeCode = '4171'">
                        <tr align="right">
                          <td />
                          <td class="lineTableBudgetTd" align="right" width="200px">
                            <span style="font-weight:bold; ">
                              <xsl:text>Teslim Bedeli</xsl:text>
                            </span>
                          </td>
                          <td class="lineTableBudgetTd" style="width:81px; " align="right">
                            <xsl:for-each select="//n1:Invoice/cac:LegalMonetaryTotal/cbc:LineExtensionAmount">
                              <xsl:call-template name="Curr_Type" />
                            </xsl:for-each>
                          </td>
                        </tr>
                      </xsl:if>
                    </xsl:for-each>
                    <xsl:if test="not($varfaturatipi='SGK')">
                      <tr align="right">
                        <td />
                        <xsl:choose>
                          <xsl:when test="//n1:Invoice/cac:AllowanceCharge/cbc:ChargeIndicator='true'">
                            <td class="lineTableBudgetTd" align="right" width="200px">
                              <span style="font-weight:bold; ">
                                <xsl:text>Toplam Arttırım - </xsl:text>
                                <xsl:for-each select="n1:Invoice/cac:AllowanceCharge/cbc:AllowanceChargeReason">
                                  <xsl:apply-templates />
                                </xsl:for-each>
                              </span>
                            </td>
                          </xsl:when>
                          <xsl:otherwise>
                            <td class="lineTableBudgetTd" align="right" width="200px">
                              <span style="font-weight:bold; ">
                                <xsl:if test="not($varoptik='medikal')">
                                  <xsl:text>Toplam İskonto</xsl:text>
                                </xsl:if>
                                <xsl:if test="$varoptik='medikal'">
                                  <xsl:text>Katılım Payı</xsl:text>
                                </xsl:if>
                              </span>
                            </td>
                          </xsl:otherwise>
                        </xsl:choose>
                        <td class="lineTableBudgetTd" style="width:81px; " align="right">
                          <xsl:if test="$varoptik='medikal' and not($varisitmekatilimpayi='')">
                            <xsl:value-of select="format-number(number($varisitmekatilimpayi), '###.##0,00', 'european')" />
                            <xsl:text> TL</xsl:text>
                          </xsl:if>
                          <xsl:if test="not($varoptik='medikal' and not($varisitmekatilimpayi=''))">
                            <xsl:for-each select="n1:Invoice/cac:LegalMonetaryTotal/cbc:AllowanceTotalAmount">
                              <xsl:call-template name="Curr_Type" />
                            </xsl:for-each>
                          </xsl:if>
                        </td>
                      </tr>
                    </xsl:if>
                    <xsl:if test="$varfaturatipi='SGK' and $varoptik='cezaeviEczanem'">
                      <tr align="right">
                        <td />
                        <td class="lineTableBudgetTd" align="right" width="200px">
                          <span style="font-weight:bold; ">
                            <xsl:text>Toplam İskonto</xsl:text>
                          </span>
                        </td>
                        <td class="lineTableBudgetTd" style="width:81px; " align="right">
                          <span>
                            <xsl:value-of select="format-number(number($variskonto), '###.##0,00', 'european')" />
                            <xsl:text> TL</xsl:text>
                          </span>
                        </td>
                      </tr>
                      <tr align="right">
                        <td />
                        <td class="lineTableBudgetTd" align="right" width="200px">
                          <span style="font-weight:bold; ">
                            <xsl:text>İlaç Farkı</xsl:text>
                          </span>
                        </td>
                        <td class="lineTableBudgetTd" style="width:81px; " align="right">
                          <span>
                            <xsl:value-of select="format-number(number($varilacfarki), '###.##0,00', 'european')" />
                            <xsl:text> TL</xsl:text>
                          </span>
                        </td>
                      </tr>
                    </xsl:if>
                    <xsl:if test="$varfaturatipi='SGK' and $varoptik='optik'">
                      <tr align="right">
                        <td />
                        <td class="lineTableBudgetTd" align="right" width="200px">
                          <span style="font-weight:bold; ">
                            <xsl:text>Toplam Katılım Payı</xsl:text>
                          </span>
                        </td>
                        <td class="lineTableBudgetTd" style="width:81px; " align="right">
                          <span>
                            <xsl:value-of select="format-number(number($varkatilimpayi), '###.##0,00', 'european')" />
                            <xsl:text> TL</xsl:text>
                          </span>
                        </td>
                      </tr>
                    </xsl:if>
                    <xsl:if test="$varfaturatipi='SGK' and $varoptik='medula'">
                      <!--TEBEOS Cezaevi faturası için sgk şeklinde bir tasarım istermiştir ona göre düzenleme yapılmıştır.
                                                Resources altına oluşturdukları xml atılacaktır. Değişiklik yaparken o xmle de görede kontrol sağlanmalıdır.-->
                      <xsl:if test="not($varpsf='undefined' or $varpsf='' or $varfaturatype='CETAS')">
                        <tr align="right">
                          <td />
                          <td class="lineTableBudgetTd" align="right" width="200px">
                            <span style="font-weight:bold; ">
                              <xsl:value-of select="$varreceteadedi" /> Adet Reçete PSF Toplamı
														</span>
                          </td>
                          <td class="lineTableBudgetTd" style="width:81px; " align="right">
                            <span>
                              <xsl:value-of select="format-number(number($varpsf), '###.##0,00', 'european')" />
                              <xsl:text> TL</xsl:text>
                            </span>
                          </td>
                        </tr>
                      </xsl:if>
                      <!--TEBEOS Cezaevi faturası için sgk şeklinde bir tasarım istermiştir ona göre düzenleme yapılmıştır.
												Resources altına oluşturdukları xml atılacaktır. Değişiklik yaparken o xmle de görede kontrol sağlanmalıdır.-->
                      <xsl:if test="not($varpsf='undefined' or $varpsf='' or $varfaturatype='CETAS')">
                        <tr align="right">
                          <td />
                          <td class="lineTableBudgetTd" align="right" width="200px">
                            <span style="font-weight:bold; ">
                              <xsl:text>Kamu Kurum İskontosu</xsl:text>
                            </span>
                          </td>
                          <td class="lineTableBudgetTd" style="width:81px; " align="right">
                            <span>
                              <xsl:value-of select="format-number((number($varpsf)- number($vartutar)), '###.##0,00', 'european')" />
                              <xsl:text> TL</xsl:text>
                            </span>
                          </td>
                        </tr>
                      </xsl:if>
                      <!--TEBEOS Cezaevi faturası için sgk şeklinde bir tasarım istermiştir ona göre düzenleme yapılmıştır.
                                                Resources altına oluşturdukları xml atılacaktır. Değişiklik yaparken o xmle de görede kontrol sağlanmalıdır.-->
                      <xsl:if test="not($varfaturatype='CETAS')">
                        <tr align="right">
                          <td />
                          <td class="lineTableBudgetTd" align="right" width="200px">
                            <span style="font-weight:bold; ">
                              <xsl:value-of select="$varreceteadedi" /> Adet Reçete Kamu Fiyatı Toplamı
														</span>
                          </td>
                          <td class="lineTableBudgetTd" style="width:81px; " align="right">
                            <span>
                              <xsl:for-each select="n1:Invoice/cac:LegalMonetaryTotal/cbc:LineExtensionAmount">
                                <xsl:call-template name="Curr_Type" />
                              </xsl:for-each>
                            </span>
                          </td>
                        </tr>
                      </xsl:if>
                      <tr align="right">
                        <td />
                        <td class="lineTableBudgetTd" align="right" width="200px">
                          <span style="font-weight:bold; ">
                            <xsl:text>Eczane İskontosu</xsl:text>
                          </span>
                        </td>
                        <td class="lineTableBudgetTd" style="width:81px; " align="right">
                          <span>
                            <xsl:for-each select="n1:Invoice/cac:LegalMonetaryTotal/cbc:AllowanceTotalAmount">
                              <xsl:call-template name="Curr_Type" />
                            </xsl:for-each>
                          </span>
                        </td>
                      </tr>
                      <!--TEBEOS Cezaevi faturası için sgk şeklinde bir tasarım istermiştir ona göre düzenleme yapılmıştır.
												Resources altına oluşturdukları xml atılacaktır. Değişiklik yaparken o xmle de görede kontrol sağlanmalıdır.-->
                      <xsl:if test="not($varfaturatype='CETAS')">
                        <tr align="right">
                          <td />
                          <td class="lineTableBudgetTd" align="right" width="200px">
                            <span style="font-weight:bold; ">
                              <xsl:text>Hasta Katılım Payı(%10 - %20)</xsl:text>
                            </span>
                          </td>
                          <td class="lineTableBudgetTd" style="width:81px; " align="right">
                            <span>
                              <xsl:value-of select="format-number(number($varkatilimpayi), '###.##0,00', 'european')" />
                              <xsl:text> TL</xsl:text>
                            </span>
                          </td>
                        </tr>
                      </xsl:if>
                      <!--TEBEOS Cezaevi faturası için sgk şeklinde bir tasarım istermiştir ona göre düzenleme yapılmıştır.
												Resources altına oluşturdukları xml atılacaktır. Değişiklik yaparken o xmle de görede kontrol sağlanmalıdır.-->
                      <xsl:if test="not($varfaturatype='CETAS')">
                        <tr align="right">
                          <td />
                          <td class="lineTableBudgetTd" width="210px" align="right">
                            <span style="font-weight:bold; ">
                              <xsl:text>Vergiler Dahil Reçete Toplam Tutarı</xsl:text>
                            </span>
                          </td>
                          <td class="lineTableBudgetTd" style="width:82px; " align="right">
                            <span>
                              <xsl:value-of select="format-number((number($vartutar) -(number($variskonto) + number($varkatilimpayi))), '###.##0,00', 'european')" />
                              <xsl:text> TL</xsl:text>
                            </span>
                          </td>
                        </tr>
                      </xsl:if>
                      <!--TEBEOS Cezaevi faturası için sgk şeklinde bir tasarım istermiştir ona göre düzenleme yapılmıştır.
												Resources altına oluşturdukları xml atılacaktır. Değişiklik yaparken o xmle de görede kontrol sağlanmalıdır.-->
                      <xsl:if test="not($varfaturatype='CETAS')">
                        <tr align="right">
                          <td />
                          <td class="lineTableBudgetTd" width="210px" align="right">
                            <span style="font-weight:bold; ">
                              <xsl:text>Vergiler Hariç Reçete Toplam Tutarı</xsl:text>
                            </span>
                          </td>
                          <td class="lineTableBudgetTd" style="width:82px; " align="right">
                            <span>
                              <xsl:value-of select="format-number((number($vartutar) -(number($variskonto) + number($varkatilimpayi) + number($varkdv8) + number($varkdv10) + number($varkdv18) + number($varkdv20))), '###.##0,00', 'european')" />
                              <xsl:text> TL</xsl:text>
                            </span>
                          </td>
                        </tr>
                      </xsl:if>
                      <xsl:if test="not($varkdv8='undefined' or $varkdv8='')">
                        <tr align="right">
                          <td />
                          <td class="lineTableBudgetTd" align="right" width="200px">
                            <span style="font-weight:bold; ">
                              <xsl:text>KDV (%8)</xsl:text>
                            </span>
                          </td>
                          <td class="lineTableBudgetTd" style="width:81px; " align="right">
                            <span>
                              <xsl:value-of select="format-number(number($varkdv8), '###.##0,00', 'european')" />
                              <xsl:text> TL</xsl:text>
                            </span>
                          </td>
                        </tr>
                      </xsl:if>
                      <xsl:if test="not($varkdv10='undefined' or $varkdv10='')">
                        <tr align="right">
                          <td />
                          <td class="lineTableBudgetTd" align="right" width="200px">
                            <span style="font-weight:bold; ">
                              <xsl:text>KDV (%10)</xsl:text>
                            </span>
                          </td>
                          <td class="lineTableBudgetTd" style="width:81px; " align="right">
                            <span>
                              <xsl:value-of select="format-number(number($varkdv10), '###.##0,00', 'european')" />
                              <xsl:text> TL</xsl:text>
                            </span>
                          </td>
                        </tr>
                      </xsl:if>
                      <xsl:if test="not($varkdv18='undefined' or $varkdv18='')">
                        <tr align="right">
                          <td />
                          <td class="lineTableBudgetTd" align="right" width="200px">
                            <span style="font-weight:bold; ">
                              <xsl:text>KDV (%18)</xsl:text>
                            </span>
                          </td>
                          <td class="lineTableBudgetTd" style="width:81px; " align="right">
                            <span>
                              <xsl:value-of select="format-number(number($varkdv18), '###.##0,00', 'european')" />
                              <xsl:text> TL</xsl:text>
                            </span>
                          </td>
                        </tr>
                      </xsl:if>
                      <xsl:if test="not($varkdv20='undefined' or $varkdv20='')">
                        <tr align="right">
                          <td />
                          <td class="lineTableBudgetTd" align="right" width="200px">
                            <span style="font-weight:bold; ">
                              <xsl:text>KDV (%20)</xsl:text>
                            </span>
                          </td>
                          <td class="lineTableBudgetTd" style="width:81px; " align="right">
                            <span>
                              <xsl:value-of select="format-number(number($varkdv20), '###.##0,00', 'european')" />
                              <xsl:text> TL</xsl:text>
                            </span>
                          </td>
                        </tr>
                      </xsl:if>
                      <!--TEBEOS Cezaevi faturası için sgk şeklinde bir tasarım istermiştir ona göre düzenleme yapılmıştır.
												Resources altına oluşturdukları xml atılacaktır. Değişiklik yaparken o xmle de görede kontrol sağlanmalıdır.-->
                      <xsl:if test="not($varfaturatype='CETAS')">
                        <tr align="right">
                          <td />
                          <td class="lineTableBudgetTd" width="220px" align="right">
                            <span style="font-weight:bold; ">
                              <xsl:text>Vergiler Dahil Reçete Toplam Tutarı</xsl:text>
                            </span>
                          </td>
                          <td class="lineTableBudgetTd" style="width:82px; " align="right">
                            <span>
                              <xsl:value-of select="format-number((number($vartutar) -(number($variskonto) + number($varkatilimpayi))), '###.##0,00', 'european')" />
                              <xsl:text> TL</xsl:text>
                            </span>
                          </td>
                        </tr>
                      </xsl:if>
                      <tr align="right">
                        <td />
                        <td class="lineTableBudgetTd" align="right" width="210px">
                          <span style="font-weight:bold; ">
                            <xsl:choose>
                              <!--TEBEOS Cezaevi faturası için sgk şeklinde bir tasarım istermiştir ona göre düzenleme yapılmıştır.
                                                                Resources altına oluşturdukları xml atılacaktır. Değişiklik yaparken o xmle de görede kontrol sağlanmalıdır.-->
                              <xsl:when test="$varfaturatype='CETAS'">
                                <xsl:text>Eczane Hizmet Bedeli KDV(%18) Hariç Tutarı</xsl:text>
                              </xsl:when>
                              <xsl:otherwise>
                                <xsl:text>Eczane Hizmet Bedeli KDV Hariç Tutarı</xsl:text>
                              </xsl:otherwise>
                            </xsl:choose>
                          </span>
                        </td>
                        <td class="lineTableBudgetTd" style="width:81px; " align="right">
                          <xsl:choose>
                            <!--TEBEOS Cezaevi faturası için sgk şeklinde bir tasarım istermiştir ona göre düzenleme yapılmıştır.
                                                            Resources altına oluşturdukları xml atılacaktır. Değişiklik yaparken o xmle de görede kontrol sağlanmalıdır.-->
                            <xsl:when test="$varfaturatype='CETAS'">
                              <xsl:value-of select="format-number((number($vareczanehizmetbedeli) - number($vareczanekdv18)), '###.##0,00', 'european')" />
                            </xsl:when>
                            <xsl:otherwise>
                              <xsl:value-of select="format-number((number($vareczanehizmetbedeli) - number($vareczanekdv18) - number($vareczanekdv20)), '###.##0,00', 'european')" />
                            </xsl:otherwise>
                          </xsl:choose>
                          <xsl:text> TL</xsl:text>
                        </td>
                      </tr>
                      <!--TEBEOS Cezaevi faturası için sgk şeklinde bir tasarım istermiştir ona göre düzenleme yapılmıştır.
											Resources altına oluşturdukları xml atılacaktır. Değişiklik yaparken o xmle de görede kontrol sağlanmalıdır.-->
                      <xsl:if test="$varfaturatype='CETAS'">
                        <tr align="right">
                          <td />
                          <td class="lineTableBudgetTd" align="right" width="210px">
                            <span style="font-weight:bold; ">
                              <xsl:text>Eczane Hizmet Bedeli KDV(%20) Hariç Tutarı</xsl:text>
                            </span>
                          </td>
                          <td class="lineTableBudgetTd" style="width:81px; " align="right">
                            <!--TEBEOS Cezaevi faturası için sgk şeklinde bir tasarım istermiştir ona göre düzenleme yapılmıştır.
                                                            Resources altına oluşturdukları xml atılacaktır. Değişiklik yaparken o xmle de görede kontrol sağlanmalıdır.-->
                            <xsl:value-of select="format-number((number($vareczanehizmetbedeli20) - number($vareczanekdv20)), '###.##0,00', 'european')" />
                            <xsl:text> TL</xsl:text>
                          </td>
                        </tr>
                      </xsl:if>
                      <tr align="right">
                        <td />
                        <td class="lineTableBudgetTd" align="right" width="200px">
                          <span style="font-weight:bold; ">
                            <xsl:choose>
                              <!--TEBEOS Cezaevi faturası için sgk şeklinde bir tasarım istermiştir ona göre düzenleme yapılmıştır.
																Resources altına oluşturdukları xml atılacaktır. Değişiklik yaparken o xmle de görede kontrol sağlanmalıdır.-->
                              <xsl:when test="$varfaturatype='CETAS'">
                                <xsl:text>Eczane Hizmet Bedeli KDV (%18)</xsl:text>
                              </xsl:when>
                              <xsl:otherwise>
                                <xsl:text>KDV (%18)</xsl:text>
                              </xsl:otherwise>
                            </xsl:choose>
                          </span>
                        </td>
                        <td class="lineTableBudgetTd" style="width:81px; " align="right">
                          <xsl:value-of select="format-number(number($vareczanekdv18), '###.##0,00', 'european')" />
                          <xsl:text> TL</xsl:text>
                        </td>
                      </tr>
                      <tr align="right">
                        <td />
                        <td class="lineTableBudgetTd" align="right" width="200px">
                          <span style="font-weight:bold; ">
                            <xsl:choose>
                              <!--TEBEOS Cezaevi faturası için sgk şeklinde bir tasarım istermiştir ona göre düzenleme yapılmıştır.
																Resources altına oluşturdukları xml atılacaktır. Değişiklik yaparken o xmle de görede kontrol sağlanmalıdır.-->
                              <xsl:when test="$varfaturatype='CETAS'">
                                <xsl:text>Eczane Hizmet Bedeli KDV (%20)</xsl:text>
                              </xsl:when>
                              <xsl:otherwise>
                                <xsl:text>KDV (%20)</xsl:text>
                              </xsl:otherwise>
                            </xsl:choose>
                          </span>
                        </td>
                        <td class="lineTableBudgetTd" style="width:81px; " align="right">
                          <xsl:value-of select="format-number(number($vareczanekdv20), '###.##0,00', 'european')" />
                          <xsl:text> TL</xsl:text>
                        </td>
                      </tr>
                      <tr align="right">
                        <td />
                        <td class="lineTableBudgetTd" align="right" width="210px">
                          <span style="font-weight:bold; ">
                            <xsl:choose>
                              <!--TEBEOS Cezaevi faturası için sgk şeklinde bir tasarım istermiştir ona göre düzenleme yapılmıştır.
																Resources altına oluşturdukları xml atılacaktır. Değişiklik yaparken o xmle de görede kontrol sağlanmalıdır.-->
                              <xsl:when test="$varfaturatype='CETAS'">
                                <xsl:text>Eczane Hizmet Bedeli KDV(%18) Dahil Tutarı</xsl:text>
                              </xsl:when>
                              <xsl:otherwise>
                                <xsl:text>Eczane Hizmet Bedeli KDV Dahil Tutarı</xsl:text>
                              </xsl:otherwise>
                            </xsl:choose>
                          </span>
                        </td>
                        <td class="lineTableBudgetTd" style="width:81px; " align="right">
                          <xsl:value-of select="format-number(number($vareczanehizmetbedeli), '###.##0,00', 'european')" />
                          <xsl:text> TL</xsl:text>
                        </td>
                      </tr>
                      <!--TEBEOS Cezaevi faturası için sgk şeklinde bir tasarım istermiştir ona göre düzenleme yapılmıştır.
											Resources altına oluşturdukları xml atılacaktır. Değişiklik yaparken o xmle de görede kontrol sağlanmalıdır.-->
                      <xsl:if test="$varfaturatype='CETAS'">
                        <tr align="right">
                          <td />
                          <td class="lineTableBudgetTd" align="right" width="210px">
                            <span style="font-weight:bold; ">
                              <xsl:text>Eczane Hizmet Bedeli KDV(%20) Dahil Tutarı</xsl:text>
                            </span>
                          </td>
                          <td class="lineTableBudgetTd" style="width:81px; " align="right">
                            <xsl:value-of select="format-number(number($vareczanehizmetbedeli20), '###.##0,00', 'european')" />
                            <xsl:text> TL</xsl:text>
                          </td>
                        </tr>
                      </xsl:if>
                    </xsl:if>
                    <xsl:if test="not($varfaturatipi='SGK' and $varoptik='medula')">
                      <xsl:for-each select="n1:Invoice/cac:TaxTotal/cac:TaxSubtotal">
                        <xsl:if test="cac:TaxCategory/cac:TaxScheme/cbc:TaxTypeCode[text()='0015']">
                          <tr align="right">
                            <td />
                            <td class="lineTableBudgetTd" width="211px" align="right">
                              <span style="font-weight:bold; ">
                                <xsl:text>Hesaplanan </xsl:text>
                                <xsl:value-of select="cac:TaxCategory/cac:TaxScheme/cbc:Name" />
                                <xsl:if test="../../cbc:InvoiceTypeCode!='OZELMATRAH'">
                                  <xsl:text> MATRAHI(%</xsl:text>
                                  <xsl:value-of select="cbc:Percent" />
                                  <xsl:text>)</xsl:text>
                                </xsl:if>
                              </span>
                            </td>
                            <td class="lineTableBudgetTd" style="width:82px; " align="right">
                              <xsl:for-each select="cac:TaxCategory/cac:TaxScheme">
                                <xsl:text></xsl:text>
                                <xsl:value-of select="format-number(../../cbc:TaxableAmount, '###.##0,00', 'european')" />
                                <xsl:if test="../../cbc:TaxableAmount/@currencyID">
                                  <xsl:text></xsl:text>
                                  <xsl:if test="../../cbc:TaxableAmount/@currencyID = 'TRL' or ../../cbc:TaxableAmount/@currencyID = 'TRY'">
                                    <xsl:text>TL</xsl:text>
                                  </xsl:if>
                                  <xsl:if test="../../cbc:TaxableAmount/@currencyID != 'TRL' and ../../cbc:TaxableAmount/@currencyID != 'TRY'">
                                    <xsl:value-of select="../../cbc:TaxAmount/@currencyID" />
                                  </xsl:if>
                                </xsl:if>
                              </xsl:for-each>
                            </td>
                          </tr>
                        </xsl:if>
                      </xsl:for-each>
                    </xsl:if>
                    <!-- EXCHANGERATE_REF -->
                    <xsl:if test="$varfaturatipi='SGK' and $varoptik='medikalIcmal'">
                      <xsl:if test="string-length($varkatilimpayi)&gt;0 and not($varkatilimpayi=0)">
                        <tr align="right">
                          <td />
                          <td class="lineTableBudgetTd" width="211px" align="right">
                            <span style="font-weight:bold; ">
                              <xsl:text>Katılım Payı</xsl:text>
                            </span>
                          </td>
                          <td class="lineTableBudgetTd" style="width:82px; " align="right">
                            <xsl:value-of select="format-number(number($varkatilimpayi), '###.##0,00', 'european')" />
                            <xsl:text> TL</xsl:text>
                          </td>
                        </tr>
                      </xsl:if>
                    </xsl:if>
                    <xsl:if test="not($varfaturatipi='SGK' and $varoptik='medula')">
                      <xsl:for-each select="n1:Invoice/cac:TaxTotal/cac:TaxSubtotal">
                        <tr align="right">
                          <td />
                          <td class="lineTableBudgetTd" width="211px" align="right">
                            <span style="font-weight:bold; ">
                              <xsl:text>Hesaplanan </xsl:text>
                              <xsl:value-of select="cac:TaxCategory/cac:TaxScheme/cbc:Name" />
                              <xsl:if test="../../cbc:InvoiceTypeCode!='OZELMATRAH'">
                                <xsl:text>(%</xsl:text>
                                <xsl:value-of select="cbc:Percent" />
                                <xsl:text>)</xsl:text>
                              </xsl:if>
                            </span>
                          </td>
                          <td class="lineTableBudgetTd" style="width:82px; " align="right">
                            <xsl:for-each select="cac:TaxCategory/cac:TaxScheme">
                              <xsl:text></xsl:text>
                              <xsl:value-of select="format-number(../../cbc:TaxAmount, '###.##0,00', 'european')" />
                              <xsl:if test="../../cbc:TaxAmount/@currencyID">
                                <xsl:text></xsl:text>
                                <xsl:if test="../../cbc:TaxAmount/@currencyID = 'TRL' or ../../cbc:TaxAmount/@currencyID = 'TRY'">
                                  <xsl:text>TL</xsl:text>
                                </xsl:if>
                                <xsl:if test="../../cbc:TaxAmount/@currencyID != 'TRL' and ../../cbc:TaxAmount/@currencyID != 'TRY'">
                                  <xsl:value-of select="../../cbc:TaxAmount/@currencyID" />
                                </xsl:if>
                              </xsl:if>
                            </xsl:for-each>
                          </td>
                        </tr>
                      </xsl:for-each>
                    </xsl:if>
                    <xsl:for-each select="n1:Invoice/cac:TaxTotal/cac:TaxSubtotal">
                      <xsl:if test="cac:TaxCategory/cac:TaxScheme/cbc:TaxTypeCode = '4171'">
                        <tr align="right">
                          <td />
                          <td class="lineTableBudgetTd" align="right" width="200px">
                            <span style="font-weight:bold; ">
                              <xsl:text>KDV Matrahı</xsl:text>
                            </span>
                          </td>
                          <td class="lineTableBudgetTd" style="width:81px; " align="right">
                            <xsl:value-of select="format-number(sum(//n1:Invoice/cac:TaxTotal/cac:TaxSubtotal[cac:TaxCategory/cac:TaxScheme/cbc:TaxTypeCode=0015]/cbc:TaxableAmount), '###.##0,00', 'european')" />
                            <xsl:if test="//n1:Invoice/cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount/@currencyID">
                              <xsl:text></xsl:text>
                              <xsl:if test="//n1:Invoice/cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount/@currencyID = 'TRL' or //n1:Invoice/cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount/@currencyID = 'TRY'">
                                <xsl:text>TL</xsl:text>
                              </xsl:if>
                              <xsl:if test="//n1:Invoice/cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount/@currencyID != 'TRL' and //n1:Invoice/cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount/@currencyID != 'TRY'">
                                <xsl:value-of select="//n1:Invoice/cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount/@currencyID" />
                              </xsl:if>
                            </xsl:if>
                          </td>
                        </tr>
                        <tr align="right">
                          <td />
                          <td class="lineTableBudgetTd" align="right" width="200px">
                            <span style="font-weight:bold; ">
                              <xsl:text>Tevkifat Dahil Toplam Tutar</xsl:text>
                            </span>
                          </td>
                          <td class="lineTableBudgetTd" style="width:81px; " align="right">
                            <xsl:for-each select="//n1:Invoice/cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount">
                              <xsl:call-template name="Curr_Type" />
                            </xsl:for-each>
                          </td>
                        </tr>
                        <tr align="right">
                          <td />
                          <td class="lineTableBudgetTd" align="right" width="200px">
                            <span style="font-weight:bold; ">
                              <xsl:text>Tevkifat Hariç Toplam Tutar</xsl:text>
                            </span>
                          </td>
                          <td class="lineTableBudgetTd" style="width:81px; " align="right">
                            <xsl:for-each select="//n1:Invoice/cac:LegalMonetaryTotal/cbc:PayableAmount">
                              <xsl:call-template name="Curr_Type" />
                            </xsl:for-each>
                          </td>
                        </tr>
                      </xsl:if>
                    </xsl:for-each>
                    <xsl:for-each select="n1:Invoice/cac:WithholdingTaxTotal/cac:TaxSubtotal">
                      <tr align="right">
                        <td />
                        <td class="lineTableBudgetTd" width="211px" align="right">
                          <span style="font-weight:bold; ">
                            <xsl:text>Hesaplanan KDV Tevkifat</xsl:text>
                            <xsl:text>(%</xsl:text>
                            <xsl:value-of select="cbc:Percent" />
                            <xsl:text>)</xsl:text>
                          </span>
                        </td>
                        <td class="lineTableBudgetTd" style="width:82px; " align="right">
                          <xsl:for-each select="cac:TaxCategory/cac:TaxScheme">
                            <xsl:text></xsl:text>
                            <xsl:value-of select="format-number(../../cbc:TaxAmount, '###.##0,00', 'european')" />
                            <xsl:if test="../../cbc:TaxAmount/@currencyID">
                              <xsl:text></xsl:text>
                              <xsl:if test="../../cbc:TaxAmount/@currencyID = 'TRL' or ../../cbc:TaxAmount/@currencyID = 'TRY'">
                                <xsl:text>TL</xsl:text>
                              </xsl:if>
                              <xsl:if test="../../cbc:TaxAmount/@currencyID != 'TRL' and ../../cbc:TaxAmount/@currencyID != 'TRY'">
                                <xsl:value-of select="../../cbc:TaxAmount/@currencyID" />
                              </xsl:if>
                            </xsl:if>
                          </xsl:for-each>
                        </td>
                      </tr>
                    </xsl:for-each>
                    <xsl:if test="sum(n1:Invoice/cac:TaxTotal/cac:TaxSubtotal[cac:TaxCategory/cac:TaxScheme/cbc:TaxTypeCode=9015]/cbc:TaxableAmount)&gt;0">
                      <tr align="right">
                        <td />
                        <td class="lineTableBudgetTd" width="211px" align="right">
                          <span style="font-weight:bold; ">
                            <xsl:text>Tevkifata Tabi İşlem Tutarı</xsl:text>
                          </span>
                        </td>
                        <td class="lineTableBudgetTd" style="width:82px; " align="right">
                          <xsl:value-of select="format-number(sum(n1:Invoice/cac:InvoiceLine[cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cac:TaxScheme/cbc:TaxTypeCode=9015]/cbc:LineExtensionAmount), '###.##0,00', 'european')" />
                          <xsl:if test="n1:Invoice/cbc:DocumentCurrencyCode = 'TRL'">
                            <xsl:text>TL</xsl:text>
                          </xsl:if>
                          <xsl:if test="n1:Invoice/cbc:DocumentCurrencyCode != 'TRL'">
                            <xsl:value-of select="n1:Invoice/cbc:DocumentCurrencyCode" />
                          </xsl:if>
                        </td>
                      </tr>
                      <tr align="right">
                        <td />
                        <td class="lineTableBudgetTd" width="211px" align="right">
                          <span style="font-weight:bold; ">
                            <xsl:text>Tevkifata Tabi İşlem Üzerinden Hes. KDV</xsl:text>
                          </span>
                        </td>
                        <td class="lineTableBudgetTd" style="width:82px; " align="right">
                          <xsl:value-of select="format-number(sum(n1:Invoice/cac:TaxTotal/cac:TaxSubtotal[cac:TaxCategory/cac:TaxScheme/cbc:TaxTypeCode=9015]/cbc:TaxableAmount), '###.##0,00', 'european')" />
                          <xsl:if test="n1:Invoice/cbc:DocumentCurrencyCode = 'TRL'">
                            <xsl:text>TL</xsl:text>
                          </xsl:if>
                          <xsl:if test="n1:Invoice/cbc:DocumentCurrencyCode != 'TRL'">
                            <xsl:value-of select="n1:Invoice/cbc:DocumentCurrencyCode" />
                          </xsl:if>
                        </td>
                      </tr>
                    </xsl:if>
                    <xsl:if test="n1:Invoice/cac:InvoiceLine[cac:WithholdingTaxTotal/cac:TaxSubtotal/cac:TaxCategory/cac:TaxScheme]">
                      <tr align="right">
                        <td />
                        <td class="lineTableBudgetTd" width="211px" align="right">
                          <span style="font-weight:bold; ">
                            <xsl:text>Tevkifata Tabi İşlem Tutarı</xsl:text>
                          </span>
                        </td>
                        <td class="lineTableBudgetTd" style="width:82px; " align="right">
                          <xsl:if test="n1:Invoice/cac:InvoiceLine[cac:WithholdingTaxTotal/cac:TaxSubtotal/cac:TaxCategory/cac:TaxScheme]">
                            <xsl:value-of select="format-number(sum(n1:Invoice/cac:InvoiceLine[cac:WithholdingTaxTotal/cac:TaxSubtotal/cac:TaxCategory/cac:TaxScheme]/cbc:LineExtensionAmount), '###.##0,00', 'european')" />
                          </xsl:if>
                          <xsl:if test="//n1:Invoice/cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cac:TaxScheme/cbc:TaxTypeCode='9015'">
                            <xsl:value-of select="format-number(sum(n1:Invoice/cac:InvoiceLine[cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cac:TaxScheme/cbc:TaxTypeCode=9015]/cbc:LineExtensionAmount), '###.##0,00', 'european')" />
                          </xsl:if>
                          <xsl:if test="n1:Invoice/cbc:DocumentCurrencyCode = 'TRL' or n1:Invoice/cbc:DocumentCurrencyCode = 'TRY'">
                            <xsl:text>TL</xsl:text>
                          </xsl:if>
                          <xsl:if test="n1:Invoice/cbc:DocumentCurrencyCode != 'TRL' and n1:Invoice/cbc:DocumentCurrencyCode != 'TRY'">
                            <xsl:value-of select="n1:Invoice/cbc:DocumentCurrencyCode" />
                          </xsl:if>
                        </td>
                      </tr>
                      <tr align="right">
                        <td />
                        <td class="lineTableBudgetTd" width="211px" align="right">
                          <span style="font-weight:bold; ">
                            <xsl:text>Tevkifata Tabi İşlem Üzerinden Hes. KDV</xsl:text>
                          </span>
                        </td>
                        <td class="lineTableBudgetTd" style="width:82px; " align="right">
                          <xsl:if test="n1:Invoice/cac:InvoiceLine[cac:WithholdingTaxTotal/cac:TaxSubtotal/cac:TaxCategory/cac:TaxScheme]">
                            <xsl:value-of select="format-number(sum(n1:Invoice/cac:WithholdingTaxTotal/cac:TaxSubtotal[cac:TaxCategory/cac:TaxScheme]/cbc:TaxableAmount), '###.##0,00', 'european')" />
                          </xsl:if>
                          <xsl:if test="//n1:Invoice/cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cac:TaxScheme/cbc:TaxTypeCode='9015'">
                            <xsl:value-of select="format-number(sum(n1:Invoice/cac:TaxTotal/cac:TaxSubtotal[cac:TaxCategory/cac:TaxScheme/cbc:TaxTypeCode=9015]/cbc:TaxableAmount), '###.##0,00', 'european')" />
                          </xsl:if>
                          <xsl:if test="n1:Invoice/cbc:DocumentCurrencyCode = 'TRL' or n1:Invoice/cbc:DocumentCurrencyCode = 'TRY'">
                            <xsl:text>TL</xsl:text>
                          </xsl:if>
                          <xsl:if test="n1:Invoice/cbc:DocumentCurrencyCode != 'TRL' and n1:Invoice/cbc:DocumentCurrencyCode != 'TRY'">
                            <xsl:value-of select="n1:Invoice/cbc:DocumentCurrencyCode" />
                          </xsl:if>
                        </td>
                      </tr>
                    </xsl:if>
                    <xsl:if test="not($varfaturatipi='SGK' and $varoptik='medula') and  $varExportCarriage &gt; 0">
                      <tr align="right">
                        <td />
                        <td class="lineTableBudgetTd" width="200px" align="right">
                          <span style="font-weight:bold; ">
                            <xsl:text>Navlun</xsl:text>
                          </span>
                        </td>
                        <td class="lineTableBudgetTd" style="width:82px; " align="right">
                          <xsl:value-of select="format-number(sum(//n1:Invoice/cac:InvoiceLine/cac:Delivery/cac:Shipment/cbc:DeclaredForCarriageValueAmount), '###.##0,00', 'european')" />
                          <xsl:if test="//n1:Invoice/cac:InvoiceLine/cac:Delivery/cac:Shipment/cbc:DeclaredForCarriageValueAmount/@currencyID">
                            <xsl:text></xsl:text>
                            <xsl:if test="//n1:Invoice/cac:InvoiceLine/cac:Delivery/cac:Shipment/cbc:DeclaredForCarriageValueAmount/@currencyID = 'TRL' or //n1:Invoice/cac:InvoiceLine/cac:Delivery/cac:Shipment/cbc:DeclaredForCarriageValueAmount/@currencyID = 'TRY'">
                              <xsl:text>TL</xsl:text>
                            </xsl:if>
                            <xsl:if test="//n1:Invoice/cac:InvoiceLine/cac:Delivery/cac:Shipment/cbc:DeclaredForCarriageValueAmount/@currencyID != 'TRL' and //n1:Invoice/cac:InvoiceLine/cac:Delivery/cac:Shipment/cbc:DeclaredForCarriageValueAmount/@currencyID != 'TRY'">
                              <xsl:value-of select="//n1:Invoice/cac:InvoiceLine/cac:Delivery/cac:Shipment/cbc:DeclaredForCarriageValueAmount/@currencyID" />
                            </xsl:if>
                          </xsl:if>
                        </td>
                      </tr>
                    </xsl:if>
                    <xsl:if test="not($varfaturatipi='SGK' and $varoptik='medula') and  $varExportInsurance &gt; 0">
                      <tr align="right">
                        <td />
                        <td class="lineTableBudgetTd" width="200px" align="right">
                          <span style="font-weight:bold; ">
                            <xsl:text>Sigorta</xsl:text>
                          </span>
                        </td>
                        <td class="lineTableBudgetTd" style="width:82px; " align="right">
                          <xsl:value-of select="format-number(sum(//n1:Invoice/cac:InvoiceLine/cac:Delivery/cac:Shipment/cbc:InsuranceValueAmount), '###.##0,00', 'european')" />
                          <xsl:if test="//n1:Invoice/cac:InvoiceLine/cac:Delivery/cac:Shipment/cbc:InsuranceValueAmount/@currencyID">
                            <xsl:text></xsl:text>
                            <xsl:if test="//n1:Invoice/cac:InvoiceLine/cac:Delivery/cac:Shipment/cbc:InsuranceValueAmount/@currencyID = 'TRL' or //n1:Invoice/cac:InvoiceLine/cac:Delivery/cac:Shipment/cbc:InsuranceValueAmount/@currencyID = 'TRY'">
                              <xsl:text>TL</xsl:text>
                            </xsl:if>
                            <xsl:if test="//n1:Invoice/cac:InvoiceLine/cac:Delivery/cac:Shipment/cbc:InsuranceValueAmount/@currencyID != 'TRL' and //n1:Invoice/cac:InvoiceLine/cac:Delivery/cac:Shipment/cbc:InsuranceValueAmount/@currencyID != 'TRY'">
                              <xsl:value-of select="//n1:Invoice/cac:InvoiceLine/cac:Delivery/cac:Shipment/cbc:InsuranceValueAmount/@currencyID" />
                            </xsl:if>
                          </xsl:if>
                        </td>
                      </tr>
                    </xsl:if>
                    <xsl:if test="not($varfaturatipi='SGK' and $varoptik='medula')">
                      <tr align="right">
                        <td />
                        <td class="lineTableBudgetTd" width="200px" align="right">
                          <span style="font-weight:bold; ">
                            <xsl:text>Vergiler Dahil Toplam Tutar</xsl:text>
                          </span>
                        </td>
                        <td class="lineTableBudgetTd" style="width:82px; " align="right">
                          <xsl:for-each select="n1:Invoice/cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount">
                            <xsl:call-template name="Curr_Type" />
                          </xsl:for-each>
                        </td>
                      </tr>
                    </xsl:if>
                    <xsl:if test="(//n1:Invoice/cbc:ProfileID='HKS' and //n1:Invoice/cbc:InvoiceTypeCode='KOMISYONCU') or (//n1:Invoice/cbc:ProfileID='EARSIVFATURA' and //n1:Invoice/cbc:InvoiceTypeCode='HKSKOMISYONCU')">
                      <tr align="right">
                        <td />
                        <td class="lineTableBudgetTd" width="200px" align="right">
                          <span style="font-weight:bold; ">
                            <xsl:text>Toplam Masraflar</xsl:text>
                          </span>
                        </td>
                        <td class="lineTableBudgetTd" style="width:82px; " align="right">
                          <xsl:for-each select="n1:Invoice/cac:LegalMonetaryTotal/cbc:ChargeTotalAmount">
                            <xsl:call-template name="Curr_Type" />
                          </xsl:for-each>
                        </td>
                      </tr>
                    </xsl:if>
                    <xsl:if test="not($varfaturatipi='SGK') ">
                      <tr align="right">
                        <td />
                        <td class="lineTableBudgetTd" width="200px" align="right">
                          <span style="font-weight:bold; ">
                            <xsl:text>Ödenecek Tutar</xsl:text>
                          </span>
                        </td>
                        <td class="lineTableBudgetTd" style="width:82px; " align="right">
                          <xsl:for-each select="n1:Invoice/cac:LegalMonetaryTotal/cbc:PayableAmount">
                            <xsl:call-template name="Curr_Type" />
                          </xsl:for-each>
                        </td>
                      </tr>
                    </xsl:if>
                    <xsl:for-each select="n1:Invoice/cac:Delivery/cac:Shipment/cbc:DeclaredCustomsValueAmount">
                      <tr align="right">
                        <td />
                        <td class="lineTableBudgetTd" width="200px" align="right">
                          <span style="font-weight:bold; ">
                            <xsl:text>Toplam Byn. Edl. Kıymet Değeri</xsl:text>
                          </span>
                        </td>
                        <td class="lineTableBudgetTd" style="width:82px; " align="right">
                          <xsl:call-template name="Curr_Type" />
                        </td>
                      </tr>
                    </xsl:for-each>
                    <xsl:for-each select="n1:Invoice/cac:TaxTotal/cac:TaxSubtotal">
                      <xsl:if test="//n1:Invoice/cbc:DocumentCurrencyCode != 'TRY' and //n1:Invoice/cbc:DocumentCurrencyCode != 'TRL'">
                        <tr align="right">
                          <td />
                          <td class="lineTableBudgetTd" align="right" width="200px">
                            <span style="font-weight:bold; ">
                              <xsl:text>Hesaplanan </xsl:text>
                              <xsl:value-of select="cac:TaxCategory/cac:TaxScheme/cbc:Name" />
                              <xsl:text>(%</xsl:text>
                              <xsl:value-of select="cbc:Percent" />
                              <xsl:text>) (TL)</xsl:text>
                            </span>
                          </td>
                          <td class="lineTableBudgetTd" style="width:81px; " align="right">
                            <span>
                              <xsl:value-of select="format-number(cbc:TaxAmount * //n1:Invoice/cac:PricingExchangeRate/cbc:CalculationRate, '###.##0,00', 'european')" />
                              <xsl:text> TL</xsl:text>
                            </span>
                          </td>
                        </tr>
                      </xsl:if>
                    </xsl:for-each>
                    <xsl:if test="($varfaturatipi='SGK' and not($varoptik='medula'))">
                      <tr align="right">
                        <td />
                        <td class="lineTableBudgetTd" align="right" width="200px">
                          <span style="font-weight:bold; ">
                            <xsl:text>Toplam Ödenecek Tutar</xsl:text>
                          </span>
                        </td>
                        <td class="lineTableBudgetTd" style="width:82px; " align="right">
                          <xsl:for-each select="n1:Invoice/cac:LegalMonetaryTotal/cbc:PayableAmount">
                            <xsl:call-template name="Curr_Type" />
                          </xsl:for-each>
                        </td>
                      </tr>
                    </xsl:if>
                    <xsl:if test="($varfaturatipi='SGK' and $varoptik='medula')">
                      <tr align="right">
                        <td />
                        <td class="lineTableBudgetTd" align="right" width="200px">
                          <span style="font-weight:bold; ">
                            <xsl:text>KDV Hariç Ödenecek Tutar</xsl:text>
                          </span>
                        </td>
                        <td class="lineTableBudgetTd" style="width:82px; " align="right">
                          <span>
                            <xsl:value-of select="format-number(number(n1:Invoice/cac:LegalMonetaryTotal/cbc:PayableAmount) - (number($varkdv8) + number($varkdv10) + number($varkdv18) + number($varkdv20) + number($vareczanekdv18)+ number($vareczanekdv20)), '###.##0,00', 'european')" />
                            <xsl:text> TL</xsl:text>
                          </span>
                        </td>
                      </tr>
                      <tr align="right">
                        <td />
                        <td class="lineTableBudgetTd" align="right" width="200px">
                          <span style="font-weight:bold; ">
                            <xsl:text>KDV(%8 + %10 + %18 + %20)</xsl:text>
                          </span>
                        </td>
                        <td class="lineTableBudgetTd" style="width:82px; " align="right">
                          <span>
                            <xsl:value-of select="format-number((number($varkdv8) + number($varkdv10) + number($varkdv18) + number($varkdv20) + number($vareczanekdv18) + number($vareczanekdv20)), '###.##0,00', 'european')" />
                            <xsl:text> TL</xsl:text>
                          </span>
                        </td>
                      </tr>
                      <tr align="right">
                        <td />
                        <td class="lineTableBudgetTd" align="right" width="200px">
                          <span style="font-weight:bold; ">
                            <xsl:text>Toplam Ödenecek Tutar</xsl:text>
                          </span>
                        </td>
                        <td class="lineTableBudgetTd" style="width:82px; " align="right">
                          <span style="font-weight:bold; ">
                            <xsl:for-each select="n1:Invoice/cac:LegalMonetaryTotal/cbc:PayableAmount">
                              <xsl:call-template name="Curr_Type" />
                            </xsl:for-each>
                          </span>
                        </td>
                      </tr>
                    </xsl:if>
                    <xsl:if test="//n1:Invoice/cac:LegalMonetaryTotal/cbc:LineExtensionAmount/@currencyID != 'TRL' and //n1:Invoice/cac:LegalMonetaryTotal/cbc:LineExtensionAmount/@currencyID != 'TRY'">
                      <tr align="right">
                        <td />
                        <td class="lineTableBudgetTd" align="right" width="200px">
                          <span style="font-weight:bold; ">
                            <xsl:text>Mal Hizmet Toplam Tutarı(TL)</xsl:text>
                          </span>
                        </td>
                        <td class="lineTableBudgetTd" style="width:81px; " align="right">
                          <xsl:value-of select="format-number(//n1:Invoice/cac:LegalMonetaryTotal/cbc:LineExtensionAmount * //n1:Invoice/cac:PricingExchangeRate/cbc:CalculationRate, '###.##0,00', 'european')" />
                          <xsl:text> TL</xsl:text>
                        </td>
                      </tr>
                      <tr align="right">
                        <td />
                        <td class="lineTableBudgetTd" width="200px" align="right">
                          <span style="font-weight:bold; ">
                            <xsl:text>Vergiler Dahil Toplam Tutar(TL)</xsl:text>
                          </span>
                        </td>
                        <td class="lineTableBudgetTd" style="width:82px; " align="right">
                          <xsl:value-of select="format-number(//n1:Invoice/cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount * //n1:Invoice/cac:PricingExchangeRate/cbc:CalculationRate, '###.##0,00', 'european')" />
                          <xsl:text> TL</xsl:text>
                        </td>
                      </tr>
                      <xsl:if test="not($varfaturatipi='SGK')">
                        <tr align="right">
                          <td />
                          <td class="lineTableBudgetTd" width="200px" align="right">
                            <span style="font-weight:bold; ">
                              <xsl:text>Vergiler Dahil Toplam Tutar</xsl:text>
                            </span>
                          </td>
                          <td class="lineTableBudgetTd" style="width:82px; " align="right">
                            <xsl:for-each select="n1:Invoice/cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount">
                              <xsl:call-template name="Curr_Type" />
                            </xsl:for-each>
                          </td>
                        </tr>
                      </xsl:if>
                      <tr align="right">
                        <td />
                        <td class="lineTableBudgetTd" width="200px" align="right">
                          <span style="font-weight:bold; ">
                            <xsl:text>Ödenecek Tutar(TL)</xsl:text>
                          </span>
                        </td>
                        <td class="lineTableBudgetTd" style="width:82px; " align="right">
                          <xsl:value-of select="format-number(//n1:Invoice/cac:LegalMonetaryTotal/cbc:PayableAmount * //n1:Invoice/cac:PricingExchangeRate/cbc:CalculationRate, '###.##0,00', 'european')" />
                          <xsl:text> TL</xsl:text>
                        </td>
                      </tr>
                    </xsl:if>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
        <br />
        <xsl:if test="//n1:Invoice/cac:BillingReference/cac:InvoiceDocumentReference/cbc:DocumentTypeCode[text()='İADE' or text()='IADE']">
          <table id="lineTable" width="850">
            <thead>
              <tr>
                <td align="left">
                  <span style="font-weight:bold; " align="center">     İadeye Konu Olan Faturalar</span>
                </td>
              </tr>
            </thead>
            <tbody>
              <tr align="left" class="lineTableTr">
                <td class="lineTableTd">
                  <span style="font-weight:bold; " align="center">     Fatura No</span>
                </td>
                <td class="lineTableTd">
                  <span style="font-weight:bold; " align="center">     Tarih</span>
                </td>
              </tr>
              <xsl:for-each select="//n1:Invoice/cac:BillingReference/cac:InvoiceDocumentReference/cbc:DocumentTypeCode[text()='İADE' or text()='IADE']">
                <tr align="left" class="lineTableTr">
                  <td class="lineTableTd">     
										<xsl:value-of select="../cbc:ID" /></td>
                  <td class="lineTableTd">     
										<xsl:for-each select="../cbc:IssueDate"><xsl:apply-templates select="." /></xsl:for-each></td>
                </tr>
              </xsl:for-each>
            </tbody>
          </table>
        </xsl:if>
        <br />
        <xsl:if test="//n1:Invoice/cac:BillingReference/cac:AdditionalDocumentReference/cbc:DocumentTypeCode='OKCBF'">
          <table border="1" id="lineTable" width="850">
            <thead>
              <tr>
                <th colspan="6">ÖKC Bilgileri</th>
              </tr>
            </thead>
            <tbody>
              <tr id="okcbfHeadTr" style="font-weight:bold;">
                <td style="width:20%">
                  <xsl:text>Fiş Numarası</xsl:text>
                </td>
                <td style="width:10%" align="center">
                  <xsl:text>Fiş Tarihi</xsl:text>
                </td>
                <td style="width:10%" align="center">
                  <xsl:text>Fiş Saati</xsl:text>
                </td>
                <td style="width:40%" align="center">
                  <xsl:text>Fiş Tipi</xsl:text>
                </td>
                <td style="width:10%" align="center">
                  <xsl:text>Z Rapor No</xsl:text>
                </td>
                <td style="width:10%" align="center">
                  <xsl:text>ÖKC Seri No</xsl:text>
                </td>
              </tr>
            </tbody>
            <xsl:for-each select="//n1:Invoice/cac:BillingReference/cac:AdditionalDocumentReference/cbc:DocumentTypeCode[text()='OKCBF']">
              <tr>
                <td style="width:20%">
                  <xsl:value-of select="../cbc:ID" />
                </td>
                <td style="width:10%" align="center">
                  <xsl:value-of select="../cbc:IssueDate" />
                </td>
                <td style="width:10%" align="center">
                  <xsl:value-of select="substring(../cac:ValidityPeriod/cbc:StartTime,1,5)" />
                </td>
                <td style="width:40%" align="center">
                  <xsl:choose>
                    <xsl:when test="../cbc:DocumentDescription='AVANS'">
                      <xsl:text>Ön Tahsilat(Avans) Bilgi Fişi</xsl:text>
                    </xsl:when>
                    <xsl:when test="../cbc:DocumentDescription='YEMEK_FIS'">
                      <xsl:text>Yemek Fişi/Kartı ile Yapılan Tahsilat Bilgi Fişi</xsl:text>
                    </xsl:when>
                    <xsl:when test="../cbc:DocumentDescription='E-FATURA'">
                      <xsl:text>E-Fatura Bilgi Fişi</xsl:text>
                    </xsl:when>
                    <xsl:when test="../cbc:DocumentDescription='E-FATURA_IRSALIYE'">
                      <xsl:text>İrsaliye Yerine Geçen E-Fatura Bilgi Fişi</xsl:text>
                    </xsl:when>
                    <xsl:when test="../cbc:DocumentDescription='E-ARSIV'">
                      <xsl:text>E-Arşiv Bilgi Fişi</xsl:text>
                    </xsl:when>
                    <xsl:when test="../cbc:DocumentDescription='E-ARSIV_IRSALIYE'">
                      <xsl:text>İrsaliye Yerine Geçen E-Arşiv Bilgi Fişi</xsl:text>
                    </xsl:when>
                    <xsl:when test="../cbc:DocumentDescription='FATURA'">
                      <xsl:text>Faturalı Satış Bilgi Fişi</xsl:text>
                    </xsl:when>
                    <xsl:when test="../cbc:DocumentDescription='OTOPARK'">
                      <xsl:text>Otopark Giriş Bilgi Fişi</xsl:text>
                    </xsl:when>
                    <xsl:when test="../cbc:DocumentDescription='FATURA_TAHSILAT'">
                      <xsl:text>Fatura Tahsilat Bilgi Fişi</xsl:text>
                    </xsl:when>
                    <xsl:when test="../cbc:DocumentDescription='FATURA_TAHSILAT_KOMISYONLU'">
                      <xsl:text>Komisyonlu Fatura Tahsilat Bilgi Fişi</xsl:text>
                    </xsl:when>
                    <xsl:otherwise>
                      <xsl:text></xsl:text>
                    </xsl:otherwise>
                  </xsl:choose>
                </td>
                <td style="width:10%" align="center">
                  <xsl:value-of select="../cac:Attachment/cac:ExternalReference/cbc:URI" />
                </td>
                <td style="width:10%" align="center">
                  <xsl:value-of select="../cac:IssuerParty/cbc:EndpointID" />
                </td>
              </tr>
            </xsl:for-each>
          </table>
          <br />
        </xsl:if>
        <table id="notesTable" style="width: 850px;">
          <tbody>
            <xsl:if test="($varfaturatipi='SGK' and $varoptik='medula')">
              <tr>
                <td style="width: 100%;">
                  <table style="margin-top: 10px; margin-left: 10px;">
                    <tbody>
                      <tr>
                        <td style="width: 25%; vertical-align: top;">
                          <table style="width: 100%;">
                            <tbody>
                              <!--TEBEOS Cezaevi faturası için sgk şeklinde bir tasarım istermiştir ona göre düzenleme yapılmıştır.
                                                                Resources altına oluşturdukları xml atılacaktır. Değişiklik yaparken o xmle de görede kontrol sağlanmalıdır.-->
                              <xsl:if test="not($varmaasdanilackatilimpayi='null' or $varmaasdanilackatilimpayi='' or $vareldenmuayenekatilimpayi='' or $vareldenrecetekatilimpayi='' or $varfaturatype='CETAS') or $varmaasdanilackatilimpayi='null'">
                                <tr>
                                  <td style="width: 50%; text-decoration: underline; font-weight: bold;">
                                    <xsl:text>Elden Tahsil Edilen</xsl:text>
                                  </td>
                                </tr>
                              </xsl:if>
                              <!--TEBEOS Cezaevi faturası için sgk şeklinde bir tasarım istermiştir ona göre düzenleme yapılmıştır.
                                                                Resources altına oluşturdukları xml atılacaktır. Değişiklik yaparken o xmle de görede kontrol sağlanmalıdır.-->
                              <xsl:if test="not($varmaasdanilackatilimpayi='null' or $varmaasdanilackatilimpayi='' or $varfaturatype='CETAS')">
                                <tr style="line-height: 14px;">
                                  <td style="width: 50%;">
                                    <xsl:text>İlaç Kat. Payı(Elden):</xsl:text>
                                  </td>
                                  <td style="width: 50%;">
                                    <xsl:value-of select="format-number(number($vareldenilackatilimpayi), '###.##0,00', 'european')" />
                                    <xsl:text> TL</xsl:text>
                                  </td>
                                </tr>
                              </xsl:if>
                              <!--TEBEOS Cezaevi faturası için sgk şeklinde bir tasarım istermiştir ona göre düzenleme yapılmıştır.
                                                                Resources altına oluşturdukları xml atılacaktır. Değişiklik yaparken o xmle de görede kontrol sağlanmalıdır.-->
                              <xsl:if test="not($vareldenmuayenekatilimpayi='' or $varfaturatype='CETAS')">
                                <tr style="line-height: 14px;">
                                  <td style="width: 50%;">
                                    <xsl:text>Muayene Kat. Payı(Elden):</xsl:text>
                                  </td>
                                  <td style="width: 50%;">
                                    <xsl:value-of select="format-number(number($vareldenmuayenekatilimpayi), '###.##0,00', 'european')" />
                                    <xsl:text> TL</xsl:text>
                                  </td>
                                </tr>
                              </xsl:if>
                              <!--TEBEOS Cezaevi faturası için sgk şeklinde bir tasarım istermiştir ona göre düzenleme yapılmıştır.
                                                                Resources altına oluşturdukları xml atılacaktır. Değişiklik yaparken o xmle de görede kontrol sağlanmalıdır.-->
                              <xsl:if test="not($vareldenrecetekatilimpayi='' or $varfaturatype='CETAS')">
                                <tr style="line-height: 14px;">
                                  <td style="width: 50%;">
                                    <xsl:text>Reçete Kat. Payı(Elden):</xsl:text>
                                  </td>
                                  <td style="width: 50%;">
                                    <xsl:value-of select="format-number(number($vareldenrecetekatilimpayi), '###.##0,00', 'european')" />
                                    <xsl:text> TL</xsl:text>
                                  </td>
                                </tr>
                              </xsl:if>
                              <xsl:if test="$varmaasdanilackatilimpayi='null'">
                                <tr style="line-height: 14px;">
                                  <td style="width: 60%;">
                                    <xsl:text>İlaç Kat. Payı(Elden + Maaş):</xsl:text>
                                  </td>
                                  <td style="width: 40%;">
                                    <xsl:value-of select="format-number(number($vareldenilackatilimpayi), '###.##0,00', 'european')" />
                                    <xsl:text> TL</xsl:text>
                                  </td>
                                </tr>
                              </xsl:if>
                            </tbody>
                          </table>
                        </td>
                        <td style="width: 25%; vertical-align: top;">
                          <table style="width: 100%">
                            <tbody>
                              <!--TEBEOS Cezaevi faturası için sgk şeklinde bir tasarım istermiştir ona göre düzenleme yapılmıştır.
                                                                Resources altına oluşturdukları xml atılacaktır. Değişiklik yaparken o xmle de görede kontrol sağlanmalıdır.-->
                              <xsl:if test="not($varmaasdanilackatilimpayi='null' or $varmaasdanilackatilimpayi='' or $varmaasmuayenekatilimpayi='' or $varmaastanrecetekatilimpayi='' or $varfaturatype='CETAS')">
                                <tr>
                                  <td style="width: 50%; text-decoration: underline; font-weight: bold;">
                                    <xsl:text>Maaştan Kesilen</xsl:text>
                                  </td>
                                </tr>
                              </xsl:if>
                              <!--TEBEOS Cezaevi faturası için sgk şeklinde bir tasarım istermiştir ona göre düzenleme yapılmıştır.
                                                                Resources altına oluşturdukları xml atılacaktır. Değişiklik yaparken o xmle de görede kontrol sağlanmalıdır.-->
                              <xsl:if test="not($varmaasdanilackatilimpayi='null' or $varmaasdanilackatilimpayi='' or $varfaturatype='CETAS')">
                                <tr style="line-height: 14px;">
                                  <td style="width: 50%;">
                                    <xsl:text>İlaç Kat. Payı(Maaş)</xsl:text>
                                  </td>
                                  <td style="width: 50%;">
                                    <xsl:value-of select="format-number(number($varmaasdanilackatilimpayi), '###.##0,00', 'european')" />
                                    <xsl:text> TL</xsl:text>
                                  </td>
                                </tr>
                              </xsl:if>
                              <!--TEBEOS Cezaevi faturası için sgk şeklinde bir tasarım istermiştir ona göre düzenleme yapılmıştır.
                                                                Resources altına oluşturdukları xml atılacaktır. Değişiklik yaparken o xmle de görede kontrol sağlanmalıdır.-->
                              <xsl:if test="not($varmaasmuayenekatilimpayi='' or $varfaturatype='CETAS')">
                                <tr style="line-height: 14px;">
                                  <td style="width: 50%;">
                                    <xsl:text>Muayene Kat. Payı(Maaş)</xsl:text>
                                  </td>
                                  <td style="width: 50%;">
                                    <xsl:value-of select="format-number(number($varmaasmuayenekatilimpayi), '###.##0,00', 'european')" />
                                    <xsl:text> TL</xsl:text>
                                  </td>
                                </tr>
                              </xsl:if>
                              <!--TEBEOS Cezaevi faturası için sgk şeklinde bir tasarım istermiştir ona göre düzenleme yapılmıştır.
                                                                Resources altına oluşturdukları xml atılacaktır. Değişiklik yaparken o xmle de görede kontrol sağlanmalıdır.-->
                              <xsl:if test="not($varmaastanrecetekatilimpayi='' or $varfaturatype='CETAS')">
                                <tr style="line-height: 14px;">
                                  <td style="width: 50%;">
                                    <xsl:text>Reçete Kat. Payı(Maaş):</xsl:text>
                                  </td>
                                  <td style="width: 50%;">
                                    <xsl:value-of select="format-number(number($varmaastanrecetekatilimpayi), '###.##0,00', 'european')" />
                                    <xsl:text> TL</xsl:text>
                                  </td>
                                </tr>
                              </xsl:if>
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </xsl:if>
            <tr align="left">
              <td id="notesTableTd" style="width: 80%" height="100">
                <xsl:for-each select="//n1:Invoice/cac:TaxTotal/cac:TaxSubtotal">
                  <xsl:if test="(cac:TaxCategory/cac:TaxScheme/cbc:TaxTypeCode='0015' or ../../cbc:InvoiceTypeCode='OZELMATRAH') and cac:TaxCategory/cbc:TaxExemptionReason">
                    <b>      Vergi İstisna Muafiyet Sebebi: </b>
                    <xsl:value-of select="cac:TaxCategory/cbc:TaxExemptionReasonCode" />
                    <xsl:text>-</xsl:text>
                    <xsl:value-of select="cac:TaxCategory/cbc:TaxExemptionReason" />
                    <br />
                  </xsl:if>
                  <xsl:if test="starts-with(cac:TaxCategory/cac:TaxScheme/cbc:TaxTypeCode,'007') and cac:TaxCategory/cbc:TaxExemptionReason">
                    <b>      ÖTV İstisna Muafiyet Sebebi: </b>
                    <xsl:value-of select="cac:TaxCategory/cbc:TaxExemptionReasonCode" />
                    <xsl:text>-</xsl:text>
                    <xsl:value-of select="cac:TaxCategory/cbc:TaxExemptionReason" />
                    <br />
                  </xsl:if>
                </xsl:for-each>
                <xsl:for-each select="//n1:Invoice/cac:WithholdingTaxTotal/cac:TaxSubtotal/cac:TaxCategory/cac:TaxScheme">
                  <b>      Tevkifat Sebebi: </b>
                  <xsl:value-of select="cbc:TaxTypeCode" />
                  <xsl:text>-</xsl:text>
                  <xsl:value-of select="cbc:Name" />
                  <br />
                </xsl:for-each>
                <!-- NOTE_REF -->
                <xsl:for-each select="//n1:Invoice/cbc:Note">
                  <xsl:if test="not(starts-with(.,'SGK_')) and not(starts-with(.,'FATURATIPI:SGK')) and not(starts-with(.,'SS:')) and not(starts-with(.,'FATURA_TYPE:CETAS'))">
                    <b>      Not: </b>
                    <xsl:value-of select="." />
                    <br />
                  </xsl:if>
                </xsl:for-each>
                <xsl:for-each select="//n1:Invoice/cac:AdditionalDocumentReference">
                  <xsl:if test="cbc:ID='INTERNET_SATIS'">
                    <b>      Not: </b>
                    <xsl:text>Bu satış internet üzerinden yapılmıştır.</xsl:text>
                    <br />
                    <b>      Ödeme Şekli: </b>
                    <xsl:value-of select="cbc:DocumentType" />
                    <br />
                    <b>      Satışın Yapıldığı Web Adresi: </b>
                    <xsl:value-of select="cac:IssuerParty/cbc:WebsiteURI" />
                    <br />
                    <b>      Ödeme Tarihi: </b>
                    <xsl:value-of select="cbc:IssueDate" />
                    <br />
                  </xsl:if>
                </xsl:for-each>
                <xsl:if test="//n1:Invoice/cac:Delivery">
                  <xsl:if test="//n1:Invoice/cac:Delivery/cac:CarrierParty/cac:PartyIdentification/cbc:ID[@schemeID='VKN']">
                    <b>      Taşıyıcı Unvan: </b>
                    <xsl:value-of select="//n1:Invoice/cac:Delivery/cac:CarrierParty/cac:PartyName/cbc:Name" />
                    <br />
                  </xsl:if>
                  <xsl:if test="//n1:Invoice/cac:Delivery/cac:CarrierParty/cac:PartyIdentification/cbc:ID[@schemeID='TCKN']">
                    <b>      Taşıyıcı Ad-Soyad: </b>
                    <xsl:value-of select="//n1:Invoice/cac:Delivery/cac:CarrierParty/cac:Person/cbc:FirstName" />
                    <xsl:text></xsl:text>
                    <xsl:value-of select="//n1:Invoice/cac:Delivery/cac:CarrierParty/cac:Person/cbc:FamilyName" />
                    <br />
                  </xsl:if>
                  <b>      Taşıyıcı TCKN/VKN: </b>
                  <xsl:value-of select="//n1:Invoice/cac:Delivery/cac:CarrierParty/cac:PartyIdentification/cbc:ID" />
                  <br />
                  <b>      Gönderim Tarihi: </b>
                  <xsl:value-of select="//n1:Invoice/cac:Delivery/cbc:ActualDeliveryDate" />
                  <br />
                </xsl:if>
                <xsl:if test="//n1:Invoice/cac:PaymentMeans/cbc:InstructionNote">
                  <b>      Ödeme Notu: </b>
                  <xsl:value-of select="//n1:Invoice/cac:PaymentMeans/cbc:InstructionNote" />
                  <br />
                </xsl:if>
                <xsl:if test="//n1:Invoice/cac:PaymentMeans/cac:PayeeFinancialAccount/cbc:PaymentNote">
                  <b>      Hesap Açıklaması: </b>
                  <xsl:value-of select="//n1:Invoice/cac:PaymentMeans/cac:PayeeFinancialAccount/cbc:PaymentNote" />
                  <br />
                </xsl:if>
                <xsl:if test="//n1:Invoice/cac:PaymentTerms/cbc:Note">
                  <b>      Ödeme Koşulu: </b>
                  <xsl:value-of select="//n1:Invoice/cac:PaymentTerms/cbc:Note" />
                  <br />
                </xsl:if>
                <xsl:if test="//n1:Invoice/cac:BuyerCustomerParty/cac:Party/cac:PartyIdentification/cbc:ID[@schemeID='PARTYTYPE']='TAXFREE' and //n1:Invoice/cac:TaxRepresentativeParty/cac:PartyTaxScheme/cbc:ExemptionReasonCode">
                  <br />
                  <b>      VAT OFF - NO CASH REFUND </b>
                </xsl:if>
              </td>
              <td style="width: 20%" />
            </tr>
          </tbody>
        </table>
        <!-- ORDER-REFUND -->
        <!-- IBAN_REF -->
  <table width="850px" border="1px" border-color="black">
            <tbody>
              <tr align="left">
                <th>
                  <font color="black">BANKA/ŞUBE</font>
                </th>
                <th>
                  <font color="black">ŞUBE ADI</font>
                </th>
                <th>
                  <font color="black">ŞUBE KODU</font>
                </th>
                <th>
                  <font color="black">HESAP NO</font>
                </th>
                <th>
                  <font color="black">IBAN NO</font>
                </th>
              </tr>
             


<tr align="left">
                <td>DENİZBANK</td>
                <td>SAMSUN BÜYÜK İŞLETMELER</td>
                <td>5555</td>
                <td>23346818</td>
                <td>TR60 0013 4000 0233 4681 8000 01</td>
              </tr>




<tr align="left">
                <td>İŞBANKASI</td>
                <td>GAZİ</td>
                <td>7304</td>
                <td>0804063</td>
                <td>TR30 0006  4000 0017 3040 8040 63</td>
              </tr>


 <tr align="left">
                <td>TEB</td>
                <td>SAMSUN</td>
                <td>90</td>
                <td>90593569</td>
                <td>TR37 0003 2000 0000 0090 5935 69</td>
              </tr>

<tr align="left">
                <td>HALKBANKASI</td>
                <td>CANİK</td>
                <td>9662</td>
                <td>10262471</td>
                <td>TR34 0001 2009 6620 0010 2624 71</td>
              </tr>



              <tr align="left">
                <td>AKBANK</td>
                <td>ÇİFTLİK</td>
                <td>233</td>
                <td>00251004</td>
                <td>TR09 0004 6002 3388 8000 2510 04</td>
              </tr>
              <tr align="left">
                <td>YAPIKREDİ</td>
                <td>ATAKUM</td>
                <td>1169</td>
                <td>77636607</td>
                <td>TR68 0006 7010 0000 0077 6366 07</td>
              </tr>
         


              <tr align="left"></tr>
           
 </tbody>
   
       </table>
     
</body>
<div class="row_not">Elektronik ortamda düzenlenmiştir.İRSALİYE YERİNE GEÇER</div>
  <img src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/4QAiRXhpZgAATU0AKgAAAAgAAQESAAMAAAABAAEAAAAAAAD/2wBDABEMDQ8NCxEPDg8TEhEVGiscGhgYGjUmKB8rPzdCQT43PDtFTmNURUleSzs8VnZXXmdqb3BvQ1N6g3lsgmNtb2v/2wBDARITExoXGjMcHDNrRzxHa2tra2tra2tra2tra2tra2tra2tra2tra2tra2tra2tra2tra2tra2tra2tra2tra2v/wAARCABnAxMDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDvKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKSigBaKKKACiiigAooqCe7trbH2i4iiz03uFz+dAE9FRxTRTpvhkSRT/EjAipKACiiigAoopCwXqQPrQAtFN8xP76/nR5if31/Oi4DqKb5if31/OjzE/vr+dFwHUUUUAFFFFABRRSZoAWioop4ZiwilRypwQrA4qSgBaKSloAKKKKACiiigAoopCQOtAC0UUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAVry9gsYw9w+0E4GBkmsq68TWyKBb5du5ZSMfh3qHxFctDqVkxLLHG25iPqM/pVEX9k63TTfNI8khQsm7gj5fyrKUnex30sPHlUpK9zStfEiSECQRk9xnYf14/WrbeINPQ4eR1PpsNYEl5ZZKxlARFtSUw87sjJIx3qaGexkW3CweY6ld4EXopB+vODQpMqVCG/KzaXXrFo2kVpCi9WEZwKa3iHT0O15JFPoYyKzYZ7NfOXYkUpHIkXZ5nyYPbjk1DNqGnyebvXMnbMeT/AKvbj25p8zIVCDfws6a0u4rxGeEkhTg5GO2asVj+GYmi0pd4ILOW5FbFWndHLViozcV0GswUEsQAO5qhcazZwErv3N6D/wCvUHiN2FtBGHKrJKFYg44rAlTTxE6RyHzMsA7g8crjp7ZGaznNp2R0UMOprmlf5Gnea4l2EiidolLDewzkr6D9Kjj1OK0uEkiaRYyD5kcmeT1GM/Uj8KrtcWe1V+z/ACqQeFAJIJ4/EYprXiM4/d7VMiM6kKQBzuA+vBrPmfc6VSila2htw+ILOT7xKf5/OtKKeKdcxOGHtXIXEtiYmKRp5vBwRjPH+fSrOjskWtJFbOxiZDkE55xmqjNp2ZjPCx5XKN16nV0UUVucBQ1m8ks7EtAFM8jCOIN03Hv+ABP4VydlZ3N1O067EkGY5JZcyGVgecDPHT/61b3i61kuNIEkQLNbyCUgdSACD+hrC0LVrS2sXtryVozk7ZMZBU5OM+uf6VlUUnpF2N4K0HIZG1zot0f3iRyRqZMDgXHPIIPQ4P8AWu5t5kuII5ozlJFDKfYivOL29N6y28ESyIrlYGC4Zs8Af4/SvQtPtzaafbW5OTFGqE/QYp072tIVRaJ9WWaKKK0MQrG18M7WcYaRQ8uD5bbSRg962axPEU32c2c5RnCTAkL1PBqZ7GlL40Y1skeoybbW5vY2RhvV5c5UnGQfxqHS0lu5pVkubkhCoAWUjOWxTEv4bTnT7aRHZgXeVskgHOBipYdRtrSTfa2kyl5A8m45wAc4H41jdHoPms7fInihS7ikkhnvoRFkMJJc7vlJ4P4VU095nWOZrmYkXKR7S5wQc5/lTl1iZhEbhJJXjdsZPDIwwQff3pIp4PNtbazglSPz1kdpDkk9B+FF0FpJNM7odBS0g6ClroPLCiiigArE1q9PmCyAMYOGd3baGX0Hr+lbdUNaXOk3JCB2EZxx0qJpuLSLp25lc5pr5LWeMQBmmj6bFyR/s/TFVbjxBemT5oyM8gSM3T6AgfpR9vtlsRFMql2G1gq5YcdeQOc9eTUn9p2tw4UWrk7soFjBI5OO/I56VhGCirXPSUNdYXC18QTK481dg/vRMRj8CSDXY2Nwbm2WQ4zkgkdDjvXJ3ET3aeWLIwIxHzGMDacnJwOehFdZYRwxWcSQPvjA4b19TVUneTs7nPiVDlTSsyzRRRXQcQUUUUAMkcIhYlR9TxWBNqQLFZL2FCCOAQehz61X1S5+1X97FNIFhtEU7GYqGJ7kgZwKyClqlvLdi2WQCQRqiyNsHy53ZxnB6D6GsKicvQ7aNKF7Sep1mnX3nSlTcRSJzyDzk1q1wSR20FtFchEV5mfajyurKAcbVIHJ+tdJ4Zvpb2wYzfejbbzVU7x0ZFWlGzlDZGzRRRWpyhRRRQBWu7tLYLuI3McCs231hpbl4pQYfL37y3TC+nH41Z1CCGYKZU3Oso2EHBU4rKfVGDtA9nMbknGzPBz3z6VhVr+zdkrszd76uxsabqUd/HlflbuD1q/WXp8UcSuEiCOWVm5z7Y/KtStYyUoqS6lRvbUKKKKooKKKKAKMurWMMrRyXKK6nBBzxTf7b07/AJ+0/WuXvoydbuJGVTGshyX6Uyc2crgtKCR0C5AqYttPVHbKjTi4q0ndX01sdX/benf8/afrR/bem/8AP0n61yomsYzmMYJ7gGmmS1mXy44yzc7AF5JNDdldyRKopte5K3fQ7iCeO4iWWFg6N0I71JVDRYmh0uGNwAwzkDtyeKv04u6uc00lJpCEhQSSAB1NVUupJ+baHdH/AH3baD9O5pb5fMSKEnCyyBW9xgkj9KzLy+vLbXTFGsZto7RpSm4jIBGT069gKA0Sua6yTA/vYhj1Rs09JFcsFP3Tg1zGsa9KbALErQs9tFcF1bkBnAKj8M0smuEWy30cEO51eVIyzMxjHc4GFJ96Tv0EdRS1z1jqi3epm3aFLXcMx53B3GM5Bxgj2zW5CxZSGOWU7TVBYlqOaVYU3OfYDuakqnqELSxqVG7bnI9iKTJexD/aTO+yJBnsM5P9B+tH9oyp99FJ6f5wTVC5sVvLtrmKVFK7SI2B4IHQ4qimkzFCpWNxtCgo46A5596xcpLqbRp02r85ui/nYFlRdo5PA/8Aih/KpE1DDbZoynfPP54/wzWDLpcsrsE2IzDG3zO2AP6VpQzSywLbyxBpkYYK9MCnFyfUmpCMYpxlc2Qc80HgUyCMxQRxk5KqBmqWtuwslQZCySKjkf3SeR+PT8a2WpAybWogSLeNpwP48hU/M9fwzUKa5IW5t4mHok3P6gD9az9QuH0ySxEQh3Tr80jrkJ06eg5pkOrajeKN0UGx3RFDR5GGzz17Yoc4p2sbRw85R5tLGtJrRVvlttq+ssgX9BmhNcUn54CV7mJg+Pw4P5Csb+1b63VTBawopQuSE643dTxjpVjTr251bUAl3AotyGK4TkEdOexFL2kL2sU8NUUXLQ6SCeK5iEsLh0PQipKxtLUwapcwBiy7ct6Eg8H6kHB/3a2apqzOcKKKKQBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAx40k+8oPv3pjQHaQkjLxj1qaqN2t2tyskG9owBlFI5+bnr7UDux4t5VyPNZwffGP0qKS0Ew2usrf7+wiqsA1TcvnCbqAQGTrgc/T736UINXKpuDhuByVxnC5J9j81AXLLaZC5/1YQD+EOxH5ZAq0lsEQIGIUDAVQABWdbjUIYivkykZUqCyE4DZbv3Ga0rTzfskX2j/XbRv+v4UrIbnJ7skRAi7VGBTqKKZJT1HT01CNI5GIVW3cd6gi0OyjGPLLe5PNadZupTX8c8K2ce5G4c7c7eRz+QI/GpcE3dlqpNLlT0LC6faqMCEfiSaX7Ba/88VH0rN+2amDE/kOyYO8bMchV/H724UjT6sIlYo28bQyhBjPzZxx0JC/nRyR7E8z7l19Hsn6xfrn+dRWuiQWl2lxCzArng98060kvnnj804jO/eCvIx0HQdc+/TrWlS5I9i1Vmla4UUUVZmZ2t211dWBSymaKYMCCrbcjuM1ykukC3kWPajsDzsGR9Oea7tuh69O1ZCanYbYl8koSN4XAyvzbfz5P5GnzSSsiouKeqOe07RjdqUdVt5jlkBH4cEf5611+nWpsrCG3L7yi4LepqnDqtqhhgWNlDEJH/47/wDF/oa1qqU3IiwUUUVAwqjqVk94I9jBdjZ5+n/16vUUmk1ZjTsc8PDrhGXzl+Ygk46Uf8I8/wC7/fL8nTjrzmtm+aVbUmDcH3Lyq5IG4ZwPpmsuS41fySFibzQMnCgDov1/2qz9jEfOyP8A4R+TzC/nLkjGMU6HQZIiuJlIVw/T0rRsJbqR5RcqQF4BK4ydzdPw21do9lEOZiDpS0UVqSFFFFABSEAggjIPalooAxrnSdLkfJKqxbb8oVsH05BxUsOm2MA2iX+HdwwTj1+XHFJ/Y/7wsLg4LZwVzxzx19+tI+i+Yqo9wdojETBVxuUHOOtTyxfQv2krWuPudPjZSLNwswPILkjHfI5qxZWX2MSATPIHIPzY4OKjsNMWymeUStI8igNkdT6/59Kv0lTinzJaic5NWYUUUVZIUUUUAYGsaHLcXQvbGdobkDBIOMj0rBex12K5aYNP5hG0sGGGA6cHj9K72sfy9Swf9aWy2CHUAc8Z5ORj/IqHDszop4hxVnFP1MGx0rW3ldvPmgEhy5Zs5Pr9fpiuq0ywTT7YRISxJyzHualtBILaMTbvMx827rn8zU9CjYmpWc9LJLyCiiirMQooqhqT3ajFqCR5bk4HcAYFAEt1AZFJTr1/H1rNa2Y3qXDI3mIhQKB1z3pTeaqHwsBZQ0mT5Z7Abf1oa61IyhVjdo8D5vKIJ+c8+3AH59Kxq0IVHeQjQtYGX55OCTnFW6xrW61CS3/0iJ1l+QgBD/e+b26Ve0yW4ltFa7TZNk7lxjHpWsUoqyGW6KKKYBRRRQBzU+nyXeoXH2a3RRvO6aXnJ9hSnw7cnrcQ/wDfutq/me2tvMjXLB1GPqRms1NauGB3Wyq4Qny+ckjOce3H61kqMN7Beb3k/vK//COXH/PxD/3xUkWg3K8G8VFPXYmDT5tauVfy0gVwVJEi5xwWGR+S/ma0rC6a6SVnVVKSMmAR2OPX/Cn7GHYT5no5P72S2lulrbpChJVe5PJqaiitAStoQ3EZdFKffRgy/wCfpmoLiwt7uaO4lhDSKpUEkjg9QcdRVymyllhcpjcASMjPNA7mWPDum8f6NnA2jMrdAcgdfWnNoGnM5b7MAW3ZAkYDB6jGentUUuqXqJ8luJJAuSAhHUJ/8U35U5NVne6SIw7UaXaGKH5l6Aj8Q34UrAWIdJtYbtLlYzvRdqAuSE4xkA9DV8KASQOvJpaKYBRRRQBVvjDFA00yfd/iHUfjWb9ttT80hnfJx2HPXtzWjqk4trGSUxiUAqNpGc5YD+tZou0dsiyhJZlBw3K5OOfxwfpUtXBKPVCxX1o5QB5WRz93A55xzxmtpERBhFCj0AxWVp1zbXkhQ2yRsF3AHr14/TB/GtemlYb5eiCorm3S6geGUfKw7dR6Ee9S0UxGG8d3aRmK4t1u4ACBIq5IHuvX8Bn8KjjgtkhDxGRYCNwMdw6qB/IVtXc4tbd5ijOFx8q9TzWIs2ny3XyaeryFkJwflywznHTg4yfenp1Q1KS0TJoxaSA+SGuFHHzTuw+hHNQopkuN+nWab1yvmqSsYPQ/X64NJPf6dc7ZJrHc7KTnocBA2D045xWvps8dxZI8MXkxgsoTGMYJHT8KPd7BzS7hp9mbSJvMfzJnOXfH6D2q3RRSEFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBGZowSCwyKPOj/vCsvULuO1l+ZXdmbASNcsfU49OaezqoXewUscAE9T6V5M8dUjJqxsqaZo+dH/eFPBBGR0rLkkWNC7sFUdSa0o/9Wv0rowmJlWb5kTOCjsPopCQBknAqlNq1lE21p1Zum1fmP6V2tpbkKLlsi9RWVLr9nE211mB/3MU1fEVgx5aRfqtR7WD6mnsKlr8rNeiqlvqNpcnEU6E+mcGrVWmnsZtNaMWiikzTELRSZqjLqK7tsWMA4LH6Z6Um0txpNl+is20u5p4d8ssUTZ4Xg/TPPWrUE/mMVYqSBkMp4IouKzLHUYNVYtOtYlVVhU7TkEjkHJP9TVnNLTAhFpbggiFMg5B29Dx/gPyqaikJABJ6UALRWQ93eXszR2KhIl4Mzf0pfsuqxfPHeJKf7jLgGsvaX2V0aeztuzWoqlp999qDJIhjmQ4ZDV2tIyUldENNOzCiikNMQ2SRIxl2xUQugekUuPXZWPPrDx6oV/diBTjdtJJA6/SmzeImeAtbRbGDKPn5yDn/AArJ1F3OhYeemhvpIr9PyPBp9YY1+NlDfZ3z5ZfqB0OK07G4a6gErRNEG5UN1I7GqjJMznTlHVos0UUVZmFFFYmtXk9tOirGvk4BLyAlSc4x7VMnZXKhBzdkbdFYdvqlntJ3tC3J2oCRtGcHpjkDNStq9kCRJNK3OOFI/l9KlTK9lO9rGvRWR/algP8AVzSg8dmbrjAx+NacEnmwpIAQGGRkY/SqUrkuEo7okoooqiQoopCcUALRWNe+IbS2YpGDM44O3oPxrMk8U3JP7u3jUe5JrN1Io6IYWrNXSOsorlF8T3SN+9toyB1xla1dP121vGEZzFKeit3+hoVSLCeGqwV2jWopBS1oc4UU1mVRliAPc1Wu2dxshYhwMgcjP40nJLcaVyyzKoyzAD3NL1rEjE09xJ5pR9q7Qrfhk1ZkElqjPEzYTsVODk1j7e6TgropQ6GnRVOyvVusj5QR0w2d1XK3TvqS04uzCiiigQUVm3dzNIzRW8ix4JUE9WIGSBUNtNPZhzM7TgruxnlcYz1+tZOqk7W0NlSbV769jYpMVnnVFGf3D52b8ZHT/wDVzVy3l8+FZNjJu5w3WqjOMnZEShKKuyWiiobmcQRFsZPYetOUlFczJSu7Ie7rGMuwUe9RfbYDyHyPUCuXvb15bryGja5uD8xQZ2oCOmB1q0PtccQKpGMICQ3yhRXE69WXwLQ1dNLc6FJ4nOFcZ9DUtcjHM817MkU+2eIjzIydyEe3SumszIYF8371XQxEpT5JrUU6airplikKqxBIBIORkdKWiuwyCimNIobZkbyMhc9awr2+uJo8faFtQcZQEKygnByT7+npSbsXGPMzVutRtLP/AI+J0Q/3c5P5VUTxFprvt88r7shArnLiwtkQSSXK72QZJcY37eT3zyMfjRJDoybTHcPJ2IfIB79hnoT+IrNykdkaFG2t38jtkdJUDIysrcgg5Bp2B6Cub0LzBPELZA9oFJLkMCGPcZ/LjiulrRO5x1IcrsJgZzgUtFFMgKKKKAEIDDBAI96asMS42xoMdMKKfRQBH5EWCPKTng/KKeqhRhQAOvFLRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQByPiWCWS6kmjSbMUJ2MnHzFhjofas6UX00rtJKpkjl3KHlVQCN4yAf+A1183+ub60ghcjcErw/bS5nGMb2udHKrbnJWcWoz38G6WUgN5jMJcqBuzg447kY967uP/Vr9KzyCDgjFaEf+rX6V1YOo5zd1axE1ZHLeJbu4F20JLLEACqg438VmRaVdR3Pnm5O0MNqgjBGOSB9SPwzXcXNrBdJtnjDgdPUfQ1lXXh2Odt63MoOMDf82K7JQau7XNoVYtKLdrGMllDJLPLJctLuc/NnAXr2+gJo/s6M7Fy6OwLHJBwP8a0JvDlzLgNehwOm7PFNXwtJ/FcqPotYuDf2TojWjFWUynFa2pyiMS5BYFuwHHHvnP4VtaDcSTGdMs8CEbGb9RTbfw3aRMDKzykdjwK2IokhQJGgRR0AFa04NO+xz1q0ZK246uX8SXF3HqKpbSFQIgxGfc11NZt/o0F9cieSSZHCbPkIHGc9xWsldHNF2ZyJu9T2EmZvpnmr0eocCW6syzIByHwOO9bH/COwZz9pus/7y/8AxNNPhu1IObm5xjB+Zf8AD3rLkl5GnPHo2Y7XwZVMVmCGO5eSev4/WqjXmou4MeY1ACqq9ABXSjw7bAIFuLlQowMMv+FH/CN22FAnuRtz0Ze/XtQoS8g511bOa+1apwfPIGM5z0rttPYvp9s7HJaNST68Vmnw1bNjNxc8f7S/4VrwRLBBHCpJVFCjPXAq4Ra3InJPYkrJ1zUTaRiFYi/mIxJDYwBWtVa6sbe7KtMhLJnawYgj8qqSurBTcVJOWxiQarLDbCBLPkj/AJ688nGenrVawv7qLFxslmjCnCvIMfX7vtS30P2R3imiES7spKS7I3154NVBtdt0slu4H/PMuzH9aw5kjuUack3YvHWXN/5wsysit5bAS8E8+3tXSW0ont45gMB1DY9M1k6dpwnRpbq3aMN91PMcnHvzWyiqihVACgYAHataa6nNXlB2UVsOpKWitDnK7wQiQy+QjMeCdoyahIsFBVoYlB6gx/8A1quO6RgF2VQTgZOOaaZoQcGRAeerDt1pWKUu5XCwTEeXbKwxt3MmAB6c1bUAAAAAD0pqOkmSjK2Dg4OcGn0JCbuFFFFMQVn6hpi3sqyedJGVUrhehFaFMmljgjMkrhEXqx6Ck1ccZOLujMl0+1eMx/Z4kfAXepUkdu9LBYWsUKpi3O0dX+Ynr9PU1DdRWM8zTrdqhLLIdozkqSo/DNVpNO0+R1Ed8AVGAqDOfmPp/vAVPIivaTta5be2iygt4YkcMG3xAPwPbtV2zjmjLeZK8ik5BdcY+lU7aC2sbgXL3YbMTLg56LjJHJPGOa11IZQw6EZoUbPcTnJqzFoooqyQrP1syjS5/Izvx2647/pWhSEAgg8g0mrqxUZcskzz+FnICwBy20ggLu555/XrUqrtAeTzFHmHIfPCkD9c9/rXRXmn2drm4lDtBnmIYAJ9SeOPqajkfR8sotTlWdSY1xgqMnkfWlFzStodM6lKUubUwDIsRQ+YWwynAbORkkg+/aoBJhFCyOXCAc85bJ5/Ij8q3JINK3oD5yFzj+FuckdTnuK1rfRLOBw4Quw6bsf0FKUqktHYqE6ENVdss6cZTYQGf/WbBuzVmkHFLVLY427u5S8/ErOVB3ZC5PQA4/xNNku2MYO0KWwevOOv+NXJFUrydvPBqNfKQl2kBOAMkiocZdx3RAlyPM4iXcepB75//X+VKb07uEG3PXPv/gRUmyEAgSgIeqgjH/1qlV4QNodMDjGRxSUZILopNcYOI41Ri3O3jPHf8SK0F+6MnNN/dtlPlPHI9qVEWMYXP4mqimnqJu46iiirEZV/DLDukhh8zkkMDymevHeqSXQuZzHP+63qybj2Bxx+lbl1N9ngaTbuwQAM45Jx17dazRqyyyMgtVYrtBJbgZIHXHq36VhKi27pnRGskrNEzaWHywmO5t2TjIII/wD1VfjTYgXJOKpWGpLeuoii2xkMcluRg46Y7gg/jWhWkYKOxjKcpbhTWVWHIBp1R3Ehit5JFQuyqSFAySfSqauSc7qWlXdtqEt9YosqShd6ZwykYwRz7CsiabVLhDGtrOSRtyVxkenAHFdKdRvPswLWbtNuUMgjPQD5j+hx+FLHe3xsp3eDy5VcKn7skEHvjrjnn8ahwfQrm7lHRNEnFzcX1+Aks/8AAn8POa24rd45OXZk7cniqP2vUmjLIif8tODE3G37vGec06K6vxfRwvDuhYgNJsIxwT+XFS6EXJSe4c7NaiiitiSG4t1nUZJVhyrDqDWHe6IsqgSQMzjpNG2Tj0INX75dSE0jWh3L8pVSQB3LD/x0D/gRqqf7b2EBSTuc53L0IwoH0PP4Umr7lQnKDvFmUmgybgApI9fJwe3v7Vp2XhyFGEkygn0PP6f/AK6dCusruM4dzuO0KygYwOv15x71ZZL/AOywFWlMqxneCVyW4/8Ar0lBI2liqsla5pJGsahUGBTqwZzqyiSQeaExlVXaT1GB7fr/AI6Nh9r8yX7UGAGAuSOeW549ttUc5dooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAzb4XqXCmzjVkKgsTjOdw6fhmoIptXKhpYWUh2JRdvzLtyo+ueK2aKSilsBjWv9rSzQLdRqqKP3pO3Dcnpj/gP61sAAAAdBS0UcqvcArP1A3yyD7GcqYzxtHDZAH4c5/4DWhRTAxEl1IPJIYpclQSoxwcdBmnRNqjFQzP94ZJQDI2c9v71bNFAFexMzWcZuM+aR82Rjn8hViiigAooooAgvEd7SVY928qcbWwfzrJOnahIgPnBQyYK726lMfzrdooAxBp2oh2zcl1Jbb+8I256fka0rCKaC0SO4ffICctknPJ9as0UAFFFFABUV0ZRazGAZl2HZ9ccVLRQBiStqEku/wAqQqQ2FIGMZbGR6/dpkAvo7oyG22xbsjEa5xuHtn7ua3qKVkFynYvcu0n2hWUDAGRjJ5z/AEq5RRTAKKKKAKt9afbIkTfsKuGDYz/nrVD+wR3unI+fqvdhg9/XJ/GtmigCpY2QsxKBIX8x92T29vpVuiigAooooAKiubdLqBoZc7GxnHsc1LRQBlHw/ZGMJ+9wBt+92znH580v9hWYZnG/c3U8HPIPTGO1alFAGe+kQOwZ3lJUMF5Hyhs5HT3rQoooAKKKKACiiigCOaGOeMxyqGU9jUYsbYAgQJgjB46/5zViigCt/Z9rxmBDj1575/nzVmiigAooooAiuYRcQmMsVBIOR7EH+lZZ0I/Ni6PI28rnAHTv16/nWzRQBjjQgGGbglAzNt2DndgHP4Z+maY3h1DJvFyw+XYQF6jYFP4kZ59626KAKFhp32KaSTzjIZFVTkf3QAKv0UUAFFFFACMoZSrAFTwQR1pnkxf880/75H+ew/KpKKAGrGinKooPsP8APpTqKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/9k="/>
     
 </html>
  </xsl:template>
  <xsl:template match="//n1:Invoice/cac:InvoiceLine">
    <tr class="lineTableTr">
      <td class="lineTableTd">
        <xsl:text> </xsl:text>
        <xsl:value-of select="./cbc:ID" />
      </td>
      <xsl:choose>
        <xsl:when test="$varItemCode &gt; 0">
          <td class="lineTableTd">
            <xsl:text> </xsl:text>
            <xsl:value-of select="./cac:Item/cac:SellersItemIdentification/cbc:ID" />
          </td>
        </xsl:when>
        <xsl:otherwise></xsl:otherwise>
      </xsl:choose>
      <xsl:choose>
        <xsl:when test="//n1:Invoice/cac:AccountingCustomerParty/cac:Party/cac:PartyIdentification/cbc:ID[@schemeID='VKN' and text()='7350019759']">
          <td class="lineTableTd">
            <xsl:text> </xsl:text>
            <xsl:for-each select="./cbc:Note">
              <xsl:if test="contains(.,'#SS_Satir_NO=')">
                <xsl:value-of select="normalize-space(substring-after(substring(.,12),'='))" />
              </xsl:if>
            </xsl:for-each>
          </td>
        </xsl:when>
      </xsl:choose>
      <td class="lineTableTd">
        <xsl:text> </xsl:text>
        <xsl:value-of select="./cac:Item/cbc:Name" />
      </td>
      <xsl:if test="not($varfaturatipi='SGK')">
        <td class="lineTableTd" align="right">
          <xsl:text> </xsl:text>
          <xsl:value-of select="format-number(./cbc:InvoicedQuantity, '###.##0,####', 'european')" />
          <xsl:if test="./cbc:InvoicedQuantity/@unitCode">
            <xsl:for-each select="./cbc:InvoicedQuantity">
              <xsl:text></xsl:text>
              <xsl:choose>
                <xsl:when test="@unitCode  = 'TNE'">
                  <xsl:text>ton</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'BX'">
                  <xsl:text>Kutu</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'LTR'">
                  <xsl:text>lt</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'C62'">
                  <xsl:text>Adet</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'NIU'">
                  <xsl:text>Adet</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'TN'">
                  <xsl:text> Teneke</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'KGM'">
                  <xsl:text>kg</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'KJO'">
                  <xsl:text>kJ</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'GRM'">
                  <xsl:text>g</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'MGM'">
                  <xsl:text>mg</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'NT'">
                  <xsl:text>Net Ton</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'GT'">
                  <xsl:text>Gross Ton</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'MTR'">
                  <xsl:text>m</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'MMT'">
                  <xsl:text>mm</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'KTM'">
                  <xsl:text>km</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'MLT'">
                  <xsl:text>ml</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'MMQ'">
                  <xsl:text>mm3</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'CLT'">
                  <xsl:text>cl</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'CMK'">
                  <xsl:text>cm2</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'CMQ'">
                  <xsl:text>cm3</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'CMT'">
                  <xsl:text>cm</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'MTK'">
                  <xsl:text>m2</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'MTQ'">
                  <xsl:text>m3</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'DAY'">
                  <xsl:text> Gün</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'MON'">
                  <xsl:text> Ay</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'PA'">
                  <xsl:text> Paket</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'KWH'">
                  <xsl:text> KWH</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'ANN'">
                  <xsl:text> Yıl</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'HUR'">
                  <xsl:text> Saat</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'D61'">
                  <xsl:text> Dakika</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'D62'">
                  <xsl:text> Saniye</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'CCT'">
                  <xsl:text> Ton baş.taşıma kap.</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'D30'">
                  <xsl:text> Brüt kalori</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'D40'">
                  <xsl:text> 1000 lt</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'LPA'">
                  <xsl:text> saf alkol lt</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'B32'">
                  <xsl:text> kg.m2</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'NCL'">
                  <xsl:text> hücre adet</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'PR'">
                  <xsl:text> Çift</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'R9'">
                  <xsl:text> 1000 m3</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'SET'">
                  <xsl:text> Set</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'T3'">
                  <xsl:text> 1000 adet</xsl:text>
                </xsl:when>
                <xsl:when test="@unitCode  = 'PK'">
                  <xsl:text> Koli</xsl:text>
                </xsl:when>
              </xsl:choose>
            </xsl:for-each>
          </xsl:if>
        </td>
        <xsl:if test="$varEtiketFiyati='1'">
          <td class="lineTableTd" align="right">
            <xsl:for-each select="//n1:Invoice/cac:InvoiceLine/cbc:Note">
              <xsl:if test="contains(.,'ETF:') or contains(.,'ESF:')">
                <xsl:value-of select="substring-after(substring(.,4),':')" />
                <xsl:text></xsl:text>
                <xsl:if test="//n1:Invoice/cac:InvoiceLine/cac:Price/cbc:PriceAmount/@currencyID = &quot;TRL&quot; or //n1:Invoice/cac:InvoiceLine/cac:Price/cbc:PriceAmount/@currencyID = &quot;TRY&quot;">
                  <xsl:text>TL</xsl:text>
                </xsl:if>
                <xsl:if test="//n1:Invoice/cac:InvoiceLine/cac:Price/cbc:PriceAmount/@currencyID != &quot;TRL&quot; and //n1:Invoice/cac:InvoiceLine/cac:Price/cbc:PriceAmount/@currencyID != &quot;TRY&quot;">
                  <xsl:value-of select="//n1:Invoice/cac:InvoiceLine/cac:Price/cbc:PriceAmount/@currencyID" />
                </xsl:if>
              </xsl:if>
            </xsl:for-each>
          </td>
        </xsl:if>
        <td class="lineTableTd" align="right">
          <xsl:text> </xsl:text>
          <xsl:value-of select="format-number(./cac:Price/cbc:PriceAmount, '###.##0,########', 'european')" />
          <xsl:if test="./cac:Price/cbc:PriceAmount/@currencyID">
            <xsl:text></xsl:text>
            <xsl:if test="./cac:Price/cbc:PriceAmount/@currencyID = &quot;TRL&quot; or ./cac:Price/cbc:PriceAmount/@currencyID = &quot;TRY&quot;">
              <xsl:text>TL</xsl:text>
            </xsl:if>
            <xsl:if test="./cac:Price/cbc:PriceAmount/@currencyID != &quot;TRL&quot; and ./cac:Price/cbc:PriceAmount/@currencyID != &quot;TRY&quot;">
              <xsl:value-of select="./cac:Price/cbc:PriceAmount/@currencyID" />
            </xsl:if>
          </xsl:if>
        </td>
        <xsl:if test="$varDepocuFiyati='1'">
          <td class="lineTableTd" align="right">
            <xsl:text> </xsl:text>
            <xsl:for-each select="//n1:Invoice/cac:InvoiceLine/cbc:Note">
              <xsl:if test="contains(.,'DSF:')">
                <br />
                <xsl:value-of select="substring-after(substring(.,4),':')" />
                <xsl:text></xsl:text>
                <xsl:if test="//n1:Invoice/cac:InvoiceLine/cac:Price/cbc:PriceAmount/@currencyID = &quot;TRL&quot; or //n1:Invoice/cac:InvoiceLine/cac:Price/cbc:PriceAmount/@currencyID = &quot;TRY&quot;">
                  <xsl:text>TL</xsl:text>
                </xsl:if>
                <xsl:if test="//n1:Invoice/cac:InvoiceLine/cac:Price/cbc:PriceAmount/@currencyID != &quot;TRL&quot; and .//n1:Invoice/cac:InvoiceLine/cac:Price/cbc:PriceAmount/@currencyID != &quot;TRY&quot;">
                  <xsl:value-of select="//n1:Invoice/cac:InvoiceLine/cac:Price/cbc:PriceAmount/@currencyID" />
                </xsl:if>
              </xsl:if>
            </xsl:for-each>
            <br />
          </td>
        </xsl:if>
        <xsl:if test="$varEczaciKar='1'">
          <td class="lineTableTd" align="right">
            <xsl:text> </xsl:text>
            <xsl:for-each select="//n1:Invoice/cac:InvoiceLine/cbc:Note">
              <xsl:if test="contains(.,'ECK:') or contains(.,'EKO:')">
                <xsl:text>%</xsl:text>
                <xsl:value-of select="substring-after(substring(.,4),':')" />
                <xsl:text></xsl:text>
              </xsl:if>
            </xsl:for-each>
          </td>
        </xsl:if>
        <xsl:if test="$varKurumIskonto='1'">
          <td class="lineTableTd" align="right">
            <xsl:for-each select="//n1:Invoice/cac:InvoiceLine/cbc:Note">
              <xsl:if test="contains(.,'KRI:')">
                <xsl:value-of select="substring-after(substring(.,4),':')" />
                <xsl:text></xsl:text>
                <xsl:if test="//n1:Invoice/cac:InvoiceLine/cac:Price/cbc:PriceAmount/@currencyID = &quot;TRL&quot; or //n1:Invoice/cac:InvoiceLine/cac:Price/cbc:PriceAmount/@currencyID = &quot;TRY&quot;">
                  <xsl:text>TL</xsl:text>
                </xsl:if>
                <xsl:if test="//n1:Invoice/cac:InvoiceLine/cac:Price/cbc:PriceAmount/@currencyID != &quot;TRL&quot; and //n1:Invoice/cac:InvoiceLine/cac:Price/cbc:PriceAmount/@currencyID != &quot;TRY&quot;">
                  <xsl:value-of select="//n1:Invoice/cac:InvoiceLine/cac:Price/cbc:PriceAmount/@currencyID" />
                </xsl:if>
              </xsl:if>
            </xsl:for-each>
          </td>
        </xsl:if>
        <xsl:if test="$varVade='1'">
          <td class="lineTableTd" align="right">
            <xsl:text> </xsl:text>
            <xsl:for-each select="//n1:Invoice/cac:InvoiceLine/cbc:Note">
              <xsl:if test="contains(.,'VAD:')">
                <xsl:value-of select="substring-after(substring(.,4),':')" />
                <xsl:text></xsl:text>
              </xsl:if>
            </xsl:for-each>
            <br />
          </td>
        </xsl:if>
		
		
        <xsl:if test="$varAllowanceRate &gt; 0">
          <td class="lineTableTd" align="right">
		   <xsl:text> </xsl:text>
        <span>
        
          <xsl:value-of select="./cbc:Note[2]" />
        </span>
      </td>
        </xsl:if> 
		
		
        <xsl:if test="$varAllowanceAmount &gt; 0">
          <td class="lineTableTd" align="right">
            <xsl:text> </xsl:text>
            <xsl:for-each select="cac:AllowanceCharge/cbc:Amount">
              <xsl:call-template name="Curr_Type" />
              <br />
            </xsl:for-each>
          </td>
        </xsl:if>
        <xsl:if test="$varAllowanceReason &gt; 0">
          <td class="lineTableTd" align="right">
            <xsl:text> </xsl:text>
            <xsl:for-each select="cac:AllowanceCharge/cbc:AllowanceChargeReason">
              <xsl:choose>
                <xsl:when test="../cbc:ChargeIndicator='true'">
                  <xsl:text>Arttırım - </xsl:text>
                </xsl:when>
                <xsl:otherwise>
                  <xsl:text>İskonto - </xsl:text>
                </xsl:otherwise>
              </xsl:choose>
              <xsl:apply-templates />
              <br />
            </xsl:for-each>
          </td>
        </xsl:if>
        <td class="lineTableTd" align="right">
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
        </td>
        <td class="lineTableTd" align="right">
          <xsl:text> </xsl:text>
          <xsl:for-each select="./cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cac:TaxScheme">
            <xsl:if test="cbc:TaxTypeCode='0015' ">
              <xsl:text></xsl:text>
              <xsl:for-each select="../../cbc:TaxAmount">
                <xsl:call-template name="Curr_Type" />
              </xsl:for-each>
            </xsl:if>
          </xsl:for-each>
        </td>
        
        
      </xsl:if>
      <td class="lineTableTd" align="right">
        <xsl:text> </xsl:text>
        <xsl:for-each select="cbc:LineExtensionAmount">
          <xsl:call-template name="Curr_Type" />
        </xsl:for-each>
      </td>
      <xsl:if test="//n1:Invoice/cbc:ProfileID='EARSIVFATURA' and //n1:Invoice/cbc:InvoiceTypeCode='ISTISNA'">
        <td class="lineTableTd" align="right">
          <xsl:text> </xsl:text>
          <xsl:value-of select="cac:Delivery/cac:Shipment/cac:GoodsItem/cbc:RequiredCustomsID" />
        </td>
      </xsl:if>
      <xsl:if test="//n1:Invoice/cbc:ProfileID='HKS' or /n1:Invoice/cbc:InvoiceTypeCode='HKSSATIS' or /n1:Invoice/cbc:InvoiceTypeCode='HKSKOMISYONCU'">
        <td class="lineTableTd" align="right">
          <xsl:text> </xsl:text>
          <xsl:for-each select="cac:Item/cac:AdditionalItemIdentification/cbc:ID[@schemeID='KUNYENO']">
            <xsl:text> </xsl:text>
            <xsl:apply-templates />
          </xsl:for-each>
        </td>
      </xsl:if>
      <xsl:if test="//n1:Invoice/cbc:ProfileID='HKS' and /n1:Invoice/cbc:InvoiceTypeCode='SATIS'">
        <td class="lineTableTd" align="right">
          <xsl:text> </xsl:text>
          <xsl:for-each select="cac:Item/cac:AdditionalItemIdentification/cbc:ID[@schemeID='MALSAHIBIVKNTCKN']">
            <xsl:text> </xsl:text>
            <xsl:apply-templates />
          </xsl:for-each>
        </td>
        <td class="lineTableTd" align="right">
          <xsl:text> </xsl:text>
          <xsl:for-each select="cac:Item/cac:AdditionalItemIdentification/cbc:ID[@schemeID='MALSAHIBIADSOYADUNVAN']">
            <xsl:text> </xsl:text>
            <xsl:apply-templates />
          </xsl:for-each>
        </td>
      </xsl:if>
      <xsl:if test="//n1:Invoice/cbc:InvoiceTypeCode='HKSSATIS'">
        <td class="lineTableTd" align="right">
          <xsl:text> </xsl:text>
          <xsl:for-each select="cac:Item/cac:AdditionalItemIdentification/cbc:ID[@schemeID='MALSAHIBIVKNTCKN']">
            <xsl:text> </xsl:text>
            <xsl:apply-templates />
          </xsl:for-each>
        </td>
        <td class="lineTableTd" align="right">
          <xsl:text> </xsl:text>
          <xsl:for-each select="cac:Item/cac:AdditionalItemIdentification/cbc:ID[@schemeID='MALSAHIBIADSOYADUNVAN']">
            <xsl:text> </xsl:text>
            <xsl:apply-templates />
          </xsl:for-each>
        </td>
      </xsl:if>
      <xsl:if test="//n1:Invoice/cbc:ProfileID='IHRACAT' or //n1:Invoice/cbc:ProfileID='OZELFATURA'">
        <td class="lineTableTd" align="right">
          <xsl:text> </xsl:text>
          <xsl:for-each select="cac:Delivery/cac:DeliveryTerms/cbc:ID[@schemeID='INCOTERMS']">
            <xsl:text> </xsl:text>
            <xsl:apply-templates />
          </xsl:for-each>
        </td>
        <td class="lineTableTd" align="right">
          <xsl:text> </xsl:text>
          <xsl:for-each select="cac:Delivery/cac:Shipment/cac:TransportHandlingUnit/cac:ActualPackage/cbc:PackagingTypeCode">
            <xsl:text> </xsl:text>
            <xsl:call-template name="Packaging">
              <xsl:with-param name="PackagingType">
                <xsl:value-of select="." />
              </xsl:with-param>
            </xsl:call-template>
          </xsl:for-each>
        </td>
        <td class="lineTableTd" align="right">
          <xsl:text> </xsl:text>
          <xsl:for-each select="cac:Delivery/cac:Shipment/cac:TransportHandlingUnit/cac:ActualPackage/cbc:ID">
            <xsl:text> </xsl:text>
            <xsl:apply-templates />
          </xsl:for-each>
        </td>
        <td class="lineTableTd" align="right">
          <xsl:text> </xsl:text>
          <xsl:value-of select="format-number(cac:Delivery/cac:Shipment/cac:TransportHandlingUnit/cac:ActualPackage/cbc:Quantity, '###.##0,00', 'european')" />
        </td>
        <td class="lineTableTd" align="right">
          <xsl:text> </xsl:text>
          <xsl:for-each select="cac:Delivery/cac:DeliveryAddress">
            <xsl:text> </xsl:text>
            <xsl:apply-templates />
          </xsl:for-each>
        </td>
        <td class="lineTableTd" align="right">
          <xsl:text> </xsl:text>
          <xsl:for-each select="cac:Delivery/cac:Shipment/cac:ShipmentStage/cbc:TransportModeCode">
            <xsl:text> </xsl:text>
            <xsl:call-template name="TransportMode">
              <xsl:with-param name="TransportModeType">
                <xsl:value-of select="." />
              </xsl:with-param>
            </xsl:call-template>
          </xsl:for-each>
        </td>
        <td class="lineTableTd" align="right">
          <xsl:text> </xsl:text>
          <xsl:for-each select="cac:Delivery/cac:Shipment/cac:GoodsItem/cbc:RequiredCustomsID">
            <xsl:text> </xsl:text>
            <xsl:apply-templates />
          </xsl:for-each>
        </td>
        <td class="lineTableTd" align="right">
          <xsl:text> </xsl:text>
          <xsl:for-each select="cac:Delivery/cac:Shipment/cbc:DeclaredCustomsValueAmount">
            <xsl:call-template name="Curr_Type" />
          </xsl:for-each>
        </td>
      </xsl:if>
    </tr>
  </xsl:template>
  <xsl:template match="//cbc:IssueDate">
    <xsl:value-of select="substring(.,9,2)" />-<xsl:value-of select="substring(.,6,2)" />-<xsl:value-of select="substring(.,1,4)" /></xsl:template>
  <xsl:template match="//cbc:StartDate">
    <xsl:value-of select="substring(.,9,2)" />-<xsl:value-of select="substring(.,6,2)" />-<xsl:value-of select="substring(.,1,4)" /></xsl:template>
  <xsl:template match="//cbc:EndDate">
    <xsl:value-of select="substring(.,9,2)" />-<xsl:value-of select="substring(.,6,2)" />-<xsl:value-of select="substring(.,1,4)" /></xsl:template>
  <xsl:template match="//n1:Invoice">
    <tr class="lineTableTr">
      <td class="lineTableTd">
        <xsl:text> </xsl:text>
      </td>
      <td class="lineTableTd">
        <xsl:text> </xsl:text>
      </td>
      <td class="lineTableTd" align="right">
        <xsl:text> </xsl:text>
      </td>
      <td class="lineTableTd" align="right">
        <xsl:text> </xsl:text>
      </td>
      <td class="lineTableTd" align="right">
        <xsl:text> </xsl:text>
      </td>
      <td class="lineTableTd" align="right">
        <xsl:text> </xsl:text>
      </td>
      <td class="lineTableTd" align="right">
        <xsl:text> </xsl:text>
      </td>
      <td class="lineTableTd" align="right">
        <xsl:text> </xsl:text>
      </td>
      <td class="lineTableTd" align="right">
        <xsl:text> </xsl:text>
      </td>
      <td class="lineTableTd" align="right">
        <xsl:text> </xsl:text>
      </td>
      <td class="lineTableTd" align="right">
        <xsl:text> </xsl:text>
      </td>
      <xsl:if test="//n1:Invoice/cbc:ProfileID='HKS'">
        <td class="lineTableTd" align="right">
          <xsl:text> </xsl:text>
        </td>
      </xsl:if>
      <xsl:if test="//n1:Invoice/cbc:ProfileID='HKS' and /n1:Invoice/cbc:InvoiceTypeCode='SATIS'">
        <td class="lineTableTd" align="right">
          <xsl:text> </xsl:text>
        </td>
        <td class="lineTableTd" align="right">
          <xsl:text> </xsl:text>
        </td>
      </xsl:if>
      <xsl:if test="//n1:Invoice/cbc:ProfileID='IHRACAT' or //n1:Invoice/cbc:ProfileID='OZELFATURA'">
        <td class="lineTableTd" align="right">
          <xsl:text> </xsl:text>
        </td>
        <td class="lineTableTd" align="right">
          <xsl:text> </xsl:text>
        </td>
        <td class="lineTableTd" align="right">
          <xsl:text> </xsl:text>
        </td>
        <td class="lineTableTd" align="right">
          <xsl:text> </xsl:text>
        </td>
        <td class="lineTableTd" align="right">
          <xsl:text> </xsl:text>
        </td>
        <td class="lineTableTd" align="right">
          <xsl:text> </xsl:text>
        </td>
        <td class="lineTableTd" align="right">
          <xsl:text> </xsl:text>
        </td>
        <td class="lineTableTd" align="right">
          <xsl:text> </xsl:text>
        </td>
      </xsl:if>
    </tr>
  </xsl:template>
  <xsl:template name="Party_Title">
    <xsl:param name="PartyType" />
    <td style="width:469px; " align="left">
      <xsl:if test="cac:PartyName">
        <xsl:value-of select="cac:PartyName/cbc:Name" />
        <br />
      </xsl:if>
      <xsl:if test="cac:PartyLegalEntity">
        <xsl:text>Vergi No:</xsl:text>
        <xsl:value-of select="cac:PartyLegalEntity/cbc:CompanyID" />
        <br />
      </xsl:if>
      <xsl:for-each select="cac:Person">
        <xsl:for-each select="cbc:Title">
          <xsl:apply-templates />
          <xsl:text> </xsl:text>
        </xsl:for-each>
        <xsl:for-each select="cbc:FirstName">
          <xsl:apply-templates />
          <xsl:text> </xsl:text>
        </xsl:for-each>
        <xsl:for-each select="cbc:MiddleName">
          <xsl:apply-templates />
          <xsl:text>  </xsl:text>
        </xsl:for-each>
        <xsl:for-each select="cbc:FamilyName">
          <xsl:apply-templates />
          <xsl:text> </xsl:text>
        </xsl:for-each>
        <xsl:for-each select="cbc:NameSuffix">
          <xsl:apply-templates />
        </xsl:for-each>
        <xsl:if test="$PartyType='TAXFREE'">
          <br />
          <xsl:text>Pasaport No: </xsl:text>
          <xsl:value-of select="cac:IdentityDocumentReference/cbc:ID" />
          <br />
          <xsl:text>Ülkesi: </xsl:text>
          <xsl:for-each select="cbc:NationalityID">
            <xsl:call-template name="Country">
              <xsl:with-param name="CountryType">
                <xsl:value-of select="." />
              </xsl:with-param>
            </xsl:call-template>
          </xsl:for-each>
        </xsl:if>
      </xsl:for-each>
    </td>
  </xsl:template>
  <xsl:template name="Party_Adress">
    <xsl:param name="PartyType" />
    <td style="width:469px; " align="left">
      <xsl:for-each select="cac:PostalAddress">
        <xsl:for-each select="cbc:StreetName">
          <xsl:apply-templates />
          <xsl:text> </xsl:text>
        </xsl:for-each>
        <xsl:for-each select="cbc:BuildingName">
          <xsl:apply-templates />
        </xsl:for-each>
        <xsl:for-each select="cbc:BuildingNumber">
          <xsl:text> No:</xsl:text>
          <xsl:apply-templates />
          <xsl:text> </xsl:text>
        </xsl:for-each>
        <br />
        <xsl:for-each select="cbc:Room">
          <xsl:text>Kapı No:</xsl:text>
          <xsl:apply-templates />
          <xsl:text> </xsl:text>
        </xsl:for-each>
        <br />
        <xsl:for-each select="cbc:PostalZone">
          <xsl:apply-templates />
          <xsl:text> </xsl:text>
        </xsl:for-each>
        <xsl:for-each select="cbc:CitySubdivisionName">
          <xsl:apply-templates />
          <xsl:text>/ </xsl:text>
        </xsl:for-each>
        <xsl:for-each select="cbc:CityName">
          <xsl:apply-templates />
          <xsl:text> </xsl:text>
        </xsl:for-each>
        <xsl:for-each select="cac:Country/cbc:Name">
          <br />
          <xsl:apply-templates />
          <br />
        </xsl:for-each>
      </xsl:for-each>
    </td>
  </xsl:template>
  <xsl:template name="TransportMode">
    <xsl:param name="TransportModeType" />
    <xsl:choose>
      <xsl:when test="$TransportModeType=1">Denizyolu</xsl:when>
      <xsl:when test="$TransportModeType=2">Demiryolu</xsl:when>
      <xsl:when test="$TransportModeType=3">Karayolu</xsl:when>
      <xsl:when test="$TransportModeType=4">Havayolu</xsl:when>
      <xsl:when test="$TransportModeType=5">Posta</xsl:when>
      <xsl:when test="$TransportModeType=6">Çok araçlı</xsl:when>
      <xsl:when test="$TransportModeType=7">Sabit taşıma tesisleri</xsl:when>
      <xsl:when test="$TransportModeType=8">İç su taşımacılığı</xsl:when>
      <xsl:otherwise>
        <xsl:value-of select="$TransportModeType" />
      </xsl:otherwise>
    </xsl:choose>
  </xsl:template>
  <xsl:template name="PaymentMeansCode">
    <xsl:param name="PaymentMeansCodeType" />
    <xsl:choose>
      <xsl:when test="$PaymentMeansCodeType='1'">ODEME ARACISI</xsl:when>
      <xsl:when test="$PaymentMeansCodeType='10'">KAPIDA ODEME</xsl:when>
      <xsl:when test="$PaymentMeansCodeType='30'">EFT/HAVALE</xsl:when>
      <xsl:when test="$PaymentMeansCodeType='48'">KREDIKARTI/BANKAKARTI</xsl:when>
      <xsl:when test="$PaymentMeansCodeType='ZZZ'">Özel Tanımlı</xsl:when>
      <xsl:when test="$PaymentMeansCodeType='97'">DIGER</xsl:when>
      <xsl:otherwise>
        <xsl:value-of select="$PaymentMeansCodeType" />
      </xsl:otherwise>
    </xsl:choose>
  </xsl:template>
  <xsl:template name="Packaging">
    <xsl:param name="PackagingType" />
    <xsl:choose>
      <xsl:when test="$PackagingType='1A'">Çelik bidon</xsl:when>
      <xsl:when test="$PackagingType='1B'">Alüminyum bidon</xsl:when>
      <xsl:when test="$PackagingType='1D'">Kontraplak bidon</xsl:when>
      <xsl:when test="$PackagingType='1F'">Esnek ambalaj kutu</xsl:when>
      <xsl:when test="$PackagingType='1G'">Elyaflı silindir</xsl:when>
      <xsl:when test="$PackagingType='1W'">Ahşap silindir</xsl:when>
      <xsl:when test="$PackagingType='2C'">Ahşap varil</xsl:when>
      <xsl:when test="$PackagingType='3A'">Beş galonluk çelik bidon</xsl:when>
      <xsl:when test="$PackagingType='3H'">Beş galonluk plastik bidon</xsl:when>
      <xsl:when test="$PackagingType='43'">Torba, süper boy</xsl:when>
      <xsl:when test="$PackagingType='44'">Çoklu torba</xsl:when>
      <xsl:when test="$PackagingType='4A'">Çelik kutu</xsl:when>
      <xsl:when test="$PackagingType='4B'">Alüminyum kutu</xsl:when>
      <xsl:when test="$PackagingType='4C'">Doğal ahşap kutu</xsl:when>
      <xsl:when test="$PackagingType='4D'">Kontraplak kutu</xsl:when>
      <xsl:when test="$PackagingType='4F'">Yeniden üretilmiş ahşap kutu</xsl:when>
      <xsl:when test="$PackagingType='4G'">Elyaf tahta kutu</xsl:when>
      <xsl:when test="$PackagingType='4H'">Plastik kutu</xsl:when>
      <xsl:when test="$PackagingType='5H'">Plastik dokuma torba</xsl:when>
      <xsl:when test="$PackagingType='5L'">Kumaş torba</xsl:when>
      <xsl:when test="$PackagingType='5M'">Kağıt torba</xsl:when>
      <xsl:when test="$PackagingType='6H'">Kompozit ambalaj, plastik kap</xsl:when>
      <xsl:when test="$PackagingType='6P'">Kompozit ambalaj, cam kutu</xsl:when>
      <xsl:when test="$PackagingType='7A'">Araba kabı</xsl:when>
      <xsl:when test="$PackagingType='7B'">Ahşap kasa</xsl:when>
      <xsl:when test="$PackagingType='8A'">Ahşap palet</xsl:when>
      <xsl:when test="$PackagingType='8B'">Ahşap kasa</xsl:when>
      <xsl:when test="$PackagingType='8C'">Ahşap paketi</xsl:when>
      <xsl:when test="$PackagingType='AA'">Ortaboy sert plastik dolum konteynerı</xsl:when>
      <xsl:when test="$PackagingType='AB'">Elyaf kap</xsl:when>
      <xsl:when test="$PackagingType='AC'">Kağıt kap</xsl:when>
      <xsl:when test="$PackagingType='AD'">Ahşap kap</xsl:when>
      <xsl:when test="$PackagingType='AE'">Aerosol</xsl:when>
      <xsl:when test="$PackagingType='AF'">Palet, modüler, yaka 80cms * 60cms</xsl:when>
      <xsl:when test="$PackagingType='AG'">Sarılmış palet</xsl:when>
      <xsl:when test="$PackagingType='AH'">Palet, 100 cms * 110 cms</xsl:when>
      <xsl:when test="$PackagingType='AI'">Çift çeneli kepçe</xsl:when>
      <xsl:when test="$PackagingType='AJ'">Koni</xsl:when>
      <xsl:when test="$PackagingType='AL'">Top</xsl:when>
      <xsl:when test="$PackagingType='AM'">Korumasız ampul</xsl:when>
      <xsl:when test="$PackagingType='AP'">Korumalı ampül</xsl:when>
      <xsl:when test="$PackagingType='AT'">Püskürteç</xsl:when>
      <xsl:when test="$PackagingType='AV'">Kapsül</xsl:when>
      <xsl:when test="$PackagingType='B4'">Kemer</xsl:when>
      <xsl:when test="$PackagingType='BA'">Varil</xsl:when>
      <xsl:when test="$PackagingType='BB'">Bobin</xsl:when>
      <xsl:when test="$PackagingType='BC'">Şişe kasası/rafı</xsl:when>
      <xsl:when test="$PackagingType='BD'">Tahta</xsl:when>
      <xsl:when test="$PackagingType='BE'">Bohça</xsl:when>
      <xsl:when test="$PackagingType='BF'">Balon, korunmasız</xsl:when>
      <xsl:when test="$PackagingType='BG'">Torba</xsl:when>
      <xsl:when test="$PackagingType='BH'">Demet</xsl:when>
      <xsl:when test="$PackagingType='BI'">Çöp kutusu</xsl:when>
      <xsl:when test="$PackagingType='BJ'">Kova</xsl:when>
      <xsl:when test="$PackagingType='BK'">Sepet</xsl:when>
      <xsl:when test="$PackagingType='BL'">Sıkıştırılmış balya</xsl:when>
      <xsl:when test="$PackagingType='BM'">Kase</xsl:when>
      <xsl:when test="$PackagingType='BN'">Sıkıştırılmamış balya</xsl:when>
      <xsl:when test="$PackagingType='BO'">Şişe, korunmasız, silindirik</xsl:when>
      <xsl:when test="$PackagingType='BP'">Balon, korunmasız</xsl:when>
      <xsl:when test="$PackagingType='BQ'">Şişe, korunmuş, silindirik</xsl:when>
      <xsl:when test="$PackagingType='BR'">Çubuk</xsl:when>
      <xsl:when test="$PackagingType='BS'">Şişe, korunmasız, soğanbiçim</xsl:when>
      <xsl:when test="$PackagingType='BT'">Sürgü</xsl:when>
      <xsl:when test="$PackagingType='BU'">İzmarit</xsl:when>
      <xsl:when test="$PackagingType='BV'">Şişe, korunmuş, soğanbiçim</xsl:when>
      <xsl:when test="$PackagingType='BW'">Sıvılar için kutu</xsl:when>
      <xsl:when test="$PackagingType='BX'">Kutu</xsl:when>
      <xsl:when test="$PackagingType='BY'">Tahta, paket halinde/demet</xsl:when>
      <xsl:when test="$PackagingType='BZ'">Çıbuklar, paket halinde/demet</xsl:when>
      <xsl:when test="$PackagingType='CA'">Dikdörtgen teneke</xsl:when>
      <xsl:when test="$PackagingType='CB'">Bira kasası</xsl:when>
      <xsl:when test="$PackagingType='CC'">Yayık</xsl:when>
      <xsl:when test="$PackagingType='CD'">Teneke ibrik</xsl:when>
      <xsl:when test="$PackagingType='CE'">Balık sepeti</xsl:when>
      <xsl:when test="$PackagingType='CF'">Sandık</xsl:when>
      <xsl:when test="$PackagingType='CG'">Kafes</xsl:when>
      <xsl:when test="$PackagingType='CH'">Sandık</xsl:when>
      <xsl:when test="$PackagingType='CI'">Teneke kutu</xsl:when>
      <xsl:when test="$PackagingType='CJ'">Tabut</xsl:when>
      <xsl:when test="$PackagingType='CK'">Fıçı</xsl:when>
      <xsl:when test="$PackagingType='CL'">Bobin</xsl:when>
      <xsl:when test="$PackagingType='CM'">Kart</xsl:when>
      <xsl:when test="$PackagingType='CN'">Konteyner</xsl:when>
      <xsl:when test="$PackagingType='CO'">Damacana, korumasız</xsl:when>
      <xsl:when test="$PackagingType='CP'">Damacana, korumalı</xsl:when>
      <xsl:when test="$PackagingType='CQ'">Kartuş</xsl:when>
      <xsl:when test="$PackagingType='CR'">Kasa</xsl:when>
      <xsl:when test="$PackagingType='CS'">Kutu</xsl:when>
      <xsl:when test="$PackagingType='CT'">Karton kutu</xsl:when>
      <xsl:when test="$PackagingType='CU'">Fincan</xsl:when>
      <xsl:when test="$PackagingType='CV'">Kapak</xsl:when>
      <xsl:when test="$PackagingType='CW'">Rulo kafes</xsl:when>
      <xsl:when test="$PackagingType='CX'">Silindirik teneke</xsl:when>
      <xsl:when test="$PackagingType='CY'">Silindir</xsl:when>
      <xsl:when test="$PackagingType='CZ'">Tuval</xsl:when>
      <xsl:when test="$PackagingType='DA'">Kasa, çok tabakalı, plastik</xsl:when>
      <xsl:when test="$PackagingType='DB'">Kasa, çok tabakalı, ahşap</xsl:when>
      <xsl:when test="$PackagingType='DC'">Kasa, çok tabakalı, karton</xsl:when>
      <xsl:when test="$PackagingType='DI'">Demir varil</xsl:when>
      <xsl:when test="$PackagingType='DJ'">Damacana</xsl:when>
      <xsl:when test="$PackagingType='DK'">Karton kasa</xsl:when>
      <xsl:when test="$PackagingType='DL'">Plastik dökme kasa</xsl:when>
      <xsl:when test="$PackagingType='DM'">Ahşap dökme kasa</xsl:when>
      <xsl:when test="$PackagingType='DN'">Sebil/dağıtıcı</xsl:when>
      <xsl:when test="$PackagingType='DP'">Damacana, korumalı</xsl:when>
      <xsl:when test="$PackagingType='DR'">Bidon</xsl:when>
      <xsl:when test="$PackagingType='DS'">Üst kapaksız plastik tepsi, tek tabaka</xsl:when>
      <xsl:when test="$PackagingType='DT'">Üst kapaksız ahşap tepsi, tek tabaka</xsl:when>
      <xsl:when test="$PackagingType='DU'">Üst kapaksız polistiren tepsi, tek
				tabaka</xsl:when>
      <xsl:when test="$PackagingType='DV'">Üst kapaksız karton tepsi, tek tabaka</xsl:when>
      <xsl:when test="$PackagingType='DW'">Üst kapaksız plastik tepsi, çift tabaka</xsl:when>
      <xsl:when test="$PackagingType='DX'" />
      <xsl:when test="$PackagingType='DY'">Üst kapaksız karton tepsi, çift tabaka</xsl:when>
      <xsl:when test="$PackagingType='EC'">Plastik torba</xsl:when>
      <xsl:when test="$PackagingType='ED'">Kasa, palet tabanı ile</xsl:when>
      <xsl:when test="$PackagingType='EE'">Ahşap kasa, palet tabanı ile</xsl:when>
      <xsl:when test="$PackagingType='EF'">Karton kasa, palet tabanı ile</xsl:when>
      <xsl:when test="$PackagingType='EG'">Plastik kasa, palet tabanı ile</xsl:when>
      <xsl:when test="$PackagingType='EH'">Metal kasa, palet tabanı ile</xsl:when>
      <xsl:when test="$PackagingType='EI'">İzotermik kasa</xsl:when>
      <xsl:when test="$PackagingType='EN'">Zarf</xsl:when>
      <xsl:when test="$PackagingType='FB'">Plastik esnek torba</xsl:when>
      <xsl:when test="$PackagingType='FC'">Meyve kasası</xsl:when>
      <xsl:when test="$PackagingType='FD'">Çerçeveli kasa</xsl:when>
      <xsl:when test="$PackagingType='FE'">Plastik esnek depo</xsl:when>
      <xsl:when test="$PackagingType='FI'">Küçük fıçı</xsl:when>
      <xsl:when test="$PackagingType='FL'">Matara</xsl:when>
      <xsl:when test="$PackagingType='FO'">Küçük sandık</xsl:when>
      <xsl:when test="$PackagingType='FR'">Çerçeve</xsl:when>
      <xsl:when test="$PackagingType='FT'">Streçlenmiş yemek kabı</xsl:when>
      <xsl:when test="$PackagingType='FW'">Yanları üstü açık yük arabası</xsl:when>
      <xsl:when test="$PackagingType='FX'">Esnek torba</xsl:when>
      <xsl:when test="$PackagingType='GB'">Gaz şişesi</xsl:when>
      <xsl:when test="$PackagingType='GI'">Kiriş</xsl:when>
      <xsl:when test="$PackagingType='GL'">Konteyner, galon</xsl:when>
      <xsl:when test="$PackagingType='GR'">Cam kap</xsl:when>
      <xsl:when test="$PackagingType='GY'">Çul</xsl:when>
      <xsl:when test="$PackagingType='GZ'">Kiriş, demet/grup</xsl:when>
      <xsl:when test="$PackagingType='HA'">Saplı plastik sepet</xsl:when>
      <xsl:when test="$PackagingType='HB'">Saplı ahşap sepet</xsl:when>
      <xsl:when test="$PackagingType='HC'">Saplı karton sepet</xsl:when>
      <xsl:when test="$PackagingType='HG'">Büyük fıçı</xsl:when>
      <xsl:when test="$PackagingType='HN'">Askı</xsl:when>
      <xsl:when test="$PackagingType='HR'">Kapaklı sepet</xsl:when>
      <xsl:when test="$PackagingType='IA'">Ahşap sergi paketi</xsl:when>
      <xsl:when test="$PackagingType='IB'">Karton sergi paketi</xsl:when>
      <xsl:when test="$PackagingType='IC'">Plastik sergi paketi</xsl:when>
      <xsl:when test="$PackagingType='ID'">Metal sergi paketi</xsl:when>
      <xsl:when test="$PackagingType='IE'">Gösteri paketi</xsl:when>
      <xsl:when test="$PackagingType='IF'">Şeffaf oluklu paket</xsl:when>
      <xsl:when test="$PackagingType='IG'">Kağıt sarılı ambalaj</xsl:when>
      <xsl:when test="$PackagingType='IH'">Plastik bidon</xsl:when>
      <xsl:when test="$PackagingType='IK'">Şişe delikli karton paket</xsl:when>
      <xsl:when test="$PackagingType='IL'">Tepsi, katı, kapaklı istiflenebilir</xsl:when>
      <xsl:when test="$PackagingType='IN'">Külçe</xsl:when>
      <xsl:when test="$PackagingType='IZ'">Paket/grop halde külçe</xsl:when>
      <xsl:when test="$PackagingType='JB'">Jumbo boy torba</xsl:when>
      <xsl:when test="$PackagingType='JC'">Beş galonluk dikdörtgen bidon</xsl:when>
      <xsl:when test="$PackagingType='JG'">Sürahi</xsl:when>
      <xsl:when test="$PackagingType='JR'">Kavanoz</xsl:when>
      <xsl:when test="$PackagingType='JY'">Beş galonluk silindir bidon</xsl:when>
      <xsl:when test="$PackagingType='KI'">Takım</xsl:when>
      <xsl:when test="$PackagingType='LE'">Bagaj</xsl:when>
      <xsl:when test="$PackagingType='LG'">Kütük</xsl:when>
      <xsl:when test="$PackagingType='LT'">Pay</xsl:when>
      <xsl:when test="$PackagingType='LU'">Kulp</xsl:when>
      <xsl:when test="$PackagingType='LV'">Liftvan</xsl:when>
      <xsl:when test="$PackagingType='LZ'">Paket/grup kütükler</xsl:when>
      <xsl:when test="$PackagingType='MA'">Metal kasa</xsl:when>
      <xsl:when test="$PackagingType='MB'">Çoklu çanta</xsl:when>
      <xsl:when test="$PackagingType='MC'">Süt kasasu</xsl:when>
      <xsl:when test="$PackagingType='ME'">Metal konteyner</xsl:when>
      <xsl:when test="$PackagingType='MR'">Metal kap</xsl:when>
      <xsl:when test="$PackagingType='MS'">Çok duvarlı çuval</xsl:when>
      <xsl:when test="$PackagingType='MT'">Mat</xsl:when>
      <xsl:when test="$PackagingType='MW'">Plastik sarılmış kap</xsl:when>
      <xsl:when test="$PackagingType='MX'">Kibrit kutusu</xsl:when>
      <xsl:when test="$PackagingType='NE'">Ambalajsız</xsl:when>
      <xsl:when test="$PackagingType='NF'">Ambalajsız, tek ünite</xsl:when>
      <xsl:when test="$PackagingType='NG'">Ambalajsız, çok ünite</xsl:when>
      <xsl:when test="$PackagingType='NS'">Yuva</xsl:when>
      <xsl:when test="$PackagingType='NT'">Ağ</xsl:when>
      <xsl:when test="$PackagingType='NU'">Plastik ağ tüp</xsl:when>
      <xsl:when test="$PackagingType='NV'">Kumaş ağ tüp</xsl:when>
      <xsl:when test="$PackagingType='OA'">Palet, CHEP 40x60 cm</xsl:when>
      <xsl:when test="$PackagingType='OB'">Palet, CHEP 80x120 cm</xsl:when>
      <xsl:when test="$PackagingType='OC'">Palet, CHEP 100x120 cm</xsl:when>
      <xsl:when test="$PackagingType='OD'">Avustralya standart paleti</xsl:when>
      <xsl:when test="$PackagingType='OE'">Palet, 110x100 cm</xsl:when>
      <xsl:when test="$PackagingType='OF'">Nakliye platformu, belirtilmemiş ağırlık ve
				bıyut</xsl:when>
      <xsl:when test="$PackagingType='OK'">Blok</xsl:when>
      <xsl:when test="$PackagingType='OT'">Sekiz kenar kutu</xsl:when>
      <xsl:when test="$PackagingType='OU'">Dış konteyner</xsl:when>
      <xsl:when test="$PackagingType='P2'">Tava</xsl:when>
      <xsl:when test="$PackagingType='PA'">Küçük paket</xsl:when>
      <xsl:when test="$PackagingType='PB'">Kombine açık uçlu kutu ve palet</xsl:when>
      <xsl:when test="$PackagingType='PC'">Parsel</xsl:when>
      <xsl:when test="$PackagingType='PD'">Palet, modüler 80 x 100 cm</xsl:when>
      <xsl:when test="$PackagingType='PE'">Palet, modüler 80 x 120 cm</xsl:when>
      <xsl:when test="$PackagingType='PF'">Kalem</xsl:when>
      <xsl:when test="$PackagingType='PG'">Plaka</xsl:when>
      <xsl:when test="$PackagingType='PH'">Sürahi</xsl:when>
      <xsl:when test="$PackagingType='PI'">Boru</xsl:when>
      <xsl:when test="$PackagingType='PJ'">Meyve sepeti</xsl:when>
      <xsl:when test="$PackagingType='PK'">Paket</xsl:when>
      <xsl:when test="$PackagingType='PL'">Gerdel</xsl:when>
      <xsl:when test="$PackagingType='PN'">Kalas</xsl:when>
      <xsl:when test="$PackagingType='PO'">Destek</xsl:when>
      <xsl:when test="$PackagingType='PP'">Parça</xsl:when>
      <xsl:when test="$PackagingType='PR'">Plastik kap</xsl:when>
      <xsl:when test="$PackagingType='PT'">Demlik</xsl:when>
      <xsl:when test="$PackagingType='PU'">Tepsi</xsl:when>
      <xsl:when test="$PackagingType='PV'">Paket/grup boru</xsl:when>
      <xsl:when test="$PackagingType='PX'">Palet</xsl:when>
      <xsl:when test="$PackagingType='PY'">Paket/grup tabak</xsl:when>
      <xsl:when test="$PackagingType='PZ'">Paket/grup kalas</xsl:when>
      <xsl:when test="$PackagingType='QA'">Üstü açılmaz çelik bidon</xsl:when>
      <xsl:when test="$PackagingType='QB'">Üstü açılır çelik bidon</xsl:when>
      <xsl:when test="$PackagingType='QC'">Üstü açılmaz alüminyum bidon</xsl:when>
      <xsl:when test="$PackagingType='QD'">Üstü açılır alüminyum bidon</xsl:when>
      <xsl:when test="$PackagingType='QF'">Üstü açılmaz plastik bidon</xsl:when>
      <xsl:when test="$PackagingType='QG'">Üstü açılır plastik bidon</xsl:when>
      <xsl:when test="$PackagingType='QH'">Ahşap tıkaçlı varil</xsl:when>
      <xsl:when test="$PackagingType='QJ'">Üstü açılır ahşap varil</xsl:when>
      <xsl:when test="$PackagingType='QK'">Üstü açılmaz beş galonluk çelik bidon</xsl:when>
      <xsl:when test="$PackagingType='QL'">Üstü açılır beş galonluk çelik bidon</xsl:when>
      <xsl:when test="$PackagingType='QM'">Üstü açılmaz beş galonluk plastik bidon</xsl:when>
      <xsl:when test="$PackagingType='QN'">Üstü açılır beş galonluk plastik bidon</xsl:when>
      <xsl:when test="$PackagingType='QP'">Doğal ahşap kutu</xsl:when>
      <xsl:when test="$PackagingType='QQ'">Emniyet duvarlı doğal ahşap kutu</xsl:when>
      <xsl:when test="$PackagingType='QR'">Genişletilmiş plastik kutu</xsl:when>
      <xsl:when test="$PackagingType='QS'">Yekpare plastik kutu</xsl:when>
      <xsl:when test="$PackagingType='RD'">Çubuk</xsl:when>
      <xsl:when test="$PackagingType='RG'">Halka</xsl:when>
      <xsl:when test="$PackagingType='RJ'">Raf, elbise askısı</xsl:when>
      <xsl:when test="$PackagingType='RK'">Raf</xsl:when>
      <xsl:when test="$PackagingType='RL'">Makara</xsl:when>
      <xsl:when test="$PackagingType='RO'">Rulo</xsl:when>
      <xsl:when test="$PackagingType='RZ'">Paket/grup çubuk</xsl:when>
      <xsl:when test="$PackagingType='SA'">Çuval</xsl:when>
      <xsl:when test="$PackagingType='SB'">Levha</xsl:when>
      <xsl:when test="$PackagingType='SC'">Sığ kasa</xsl:when>
      <xsl:when test="$PackagingType='SD'">İğ</xsl:when>
      <xsl:when test="$PackagingType='SE'">Deniz sandığı</xsl:when>
      <xsl:when test="$PackagingType='SH'">Kesecik</xsl:when>
      <xsl:when test="$PackagingType='SI'">Kızak</xsl:when>
      <xsl:when test="$PackagingType='SK'">İskelet kasa</xsl:when>
      <xsl:when test="$PackagingType='SL'">Taşıma paleti</xsl:when>
      <xsl:when test="$PackagingType='SM'">Sac</xsl:when>
      <xsl:when test="$PackagingType='SO'">Tel/kablo/iplik makarası</xsl:when>
      <xsl:when test="$PackagingType='SP'">Plastik levha</xsl:when>
      <xsl:when test="$PackagingType='SS'">Çelik kasa</xsl:when>
      <xsl:when test="$PackagingType='ST'">Yaprak</xsl:when>
      <xsl:when test="$PackagingType='SU'">Bavul</xsl:when>
      <xsl:when test="$PackagingType='SV'">Çelik zarf</xsl:when>
      <xsl:when test="$PackagingType='SW'">Vakumlu ambalaj</xsl:when>
      <xsl:when test="$PackagingType='SX'">Set</xsl:when>
      <xsl:when test="$PackagingType='SY'">Kılıf</xsl:when>
      <xsl:when test="$PackagingType='SZ'">Paket/grup yaprak</xsl:when>
      <xsl:when test="$PackagingType='T1'">Tablet</xsl:when>
      <xsl:when test="$PackagingType='TB'">Küvet</xsl:when>
      <xsl:when test="$PackagingType='TC'">Çay sandığı</xsl:when>
      <xsl:when test="$PackagingType='TD'">Sıkılabilir tüp</xsl:when>
      <xsl:when test="$PackagingType='TE'">Lastik</xsl:when>
      <xsl:when test="$PackagingType='TG'">Genel tank konteynerı</xsl:when>
      <xsl:when test="$PackagingType='TI'" />
      <xsl:when test="$PackagingType='TK'">Dikdörtgen tank</xsl:when>
      <xsl:when test="$PackagingType='TN'">Teneke</xsl:when>
      <xsl:when test="$PackagingType='TO'">Şarap fıçısı</xsl:when>
      <xsl:when test="$PackagingType='TR'">Gövde</xsl:when>
      <xsl:when test="$PackagingType='TS'">Bağ</xsl:when>
      <xsl:when test="$PackagingType='TU'">Tüp</xsl:when>
      <xsl:when test="$PackagingType='TV'">Enjektörlü tüp</xsl:when>
      <xsl:when test="$PackagingType='TY'">Silindirik tank</xsl:when>
      <xsl:when test="$PackagingType='TZ'">Paket/grup tüpler</xsl:when>
      <xsl:when test="$PackagingType='UN'">Birim</xsl:when>
      <xsl:when test="$PackagingType='VG'">Dökme gaz</xsl:when>
      <xsl:when test="$PackagingType='VI'">Küçük şişe</xsl:when>
      <xsl:when test="$PackagingType='VL'">Dökme sıvı</xsl:when>
      <xsl:when test="$PackagingType='VO'">Dökme katı</xsl:when>
      <xsl:when test="$PackagingType='VP'">Vakumlu</xsl:when>
      <xsl:when test="$PackagingType='VQ'">Dökme sıvılaştırılmış gaz</xsl:when>
      <xsl:when test="$PackagingType='VN'">Araç</xsl:when>
      <xsl:when test="$PackagingType='VR'">Dökme katı granül</xsl:when>
      <xsl:when test="$PackagingType='VS'">Dökme metal hurda</xsl:when>
      <xsl:when test="$PackagingType='VY'">Dökme ince parçacıklar</xsl:when>
      <xsl:when test="$PackagingType='WA'">Ortaboy dolum konteynerı</xsl:when>
      <xsl:when test="$PackagingType='WB'">Hasırlı şişe</xsl:when>
      <xsl:when test="$PackagingType='WC'">Ortaboy çelik dolum konteynerı</xsl:when>
      <xsl:when test="$PackagingType='WD'">Ortaboy alüminyum dolum konteynerı</xsl:when>
      <xsl:when test="$PackagingType='WF'">Ortaboy metal dolum konteynerı</xsl:when>
      <xsl:when test="$PackagingType='WK'">Sıvılar için ortaboy çelik dolum
				konteynerı</xsl:when>
      <xsl:when test="$PackagingType='WL'">Sıvılar için ortaboy alümünyum dolum
				konteynerı</xsl:when>
      <xsl:when test="$PackagingType='WM'">Sıvılar için ortaboy metal dolum
				konteynerı</xsl:when>
      <xsl:when test="$PackagingType='WN'">Ortaboy iç astarsız örme plastik dolum
				konteynerı</xsl:when>
      <xsl:when test="$PackagingType='WR'">Ortaboy iç astarlı örme plastik dolum
				konteynerı</xsl:when>
      <xsl:when test="$PackagingType='WS'">Ortaboy plastik film dolum konteynerı</xsl:when>
      <xsl:when test="$PackagingType='WT'">Ortaboy iç astarsız kumaş plastik dolum
				konteynerı</xsl:when>
      <xsl:when test="$PackagingType='WU'">Ortaboy iç astarlı doğal ahşap dolum
				konteynerı</xsl:when>
      <xsl:when test="$PackagingType='WX'">Ortaboy iç astarlı kumaş dolum
				konteynerı</xsl:when>
      <xsl:when test="$PackagingType='WY'">Ortaboy iç astarlı kontraplak dolum
				konteynerı</xsl:when>
      <xsl:when test="$PackagingType='WZ'">Ortaboy iç astarlı sunta dolum
				konteynerı</xsl:when>
      <xsl:when test="$PackagingType='XA'">İç astarsız örme plastik torba</xsl:when>
      <xsl:when test="$PackagingType='XB'">Sızdırmaz örme plastik torba</xsl:when>
      <xsl:when test="$PackagingType='XC'">Su geçirmez örme plastik torba</xsl:when>
      <xsl:when test="$PackagingType='XD'">Plastik film torba</xsl:when>
      <xsl:when test="$PackagingType='XF'">İç astarsız kumaş torba</xsl:when>
      <xsl:when test="$PackagingType='XG'">Sızdırmaz kumaş torba</xsl:when>
      <xsl:when test="$PackagingType='XH'">Su geçirmez kumaş torba</xsl:when>
      <xsl:when test="$PackagingType='XJ'">Çok duvarlı kağıt torba</xsl:when>
      <xsl:when test="$PackagingType='XK'">Su geçirmez çok duvarlı kağıt torba</xsl:when>
      <xsl:when test="$PackagingType='YA'">Kompozit ambalaj, çelik bidon içindeki plastik
				kap</xsl:when>
      <xsl:when test="$PackagingType='YB'">Kompozit ambalaj, çelik kasa içindeki plastik
				kap</xsl:when>
      <xsl:when test="$PackagingType='YC'">Kompozit ambalaj, alüminyum bidon içindeki plastik
				kap</xsl:when>
      <xsl:when test="$PackagingType='YD'">Kompozit ambalaj, alüminyum kasa içindeki plastik
				kap</xsl:when>
      <xsl:when test="$PackagingType='YF'">Kompozit ambalaj, ahşap kutu içindeki plastik
				kap</xsl:when>
      <xsl:when test="$PackagingType='YG'">Kompozit ambalaj, kontraplak bidon içindeki plastik
				kap</xsl:when>
      <xsl:when test="$PackagingType='YH'">Kompozit ambalaj, kontraplak kasa içindeki plastik
				kap</xsl:when>
      <xsl:when test="$PackagingType='YJ'">Kompozit ambalaj, elyaf bidon içindeki plastik
				kap</xsl:when>
      <xsl:when test="$PackagingType='YK'">Kompozit ambalaj, elyaf levha kasa içindeki plastik
				kap</xsl:when>
      <xsl:when test="$PackagingType='YL'">Kompozit ambalaj, plastik bidon içindeki plastik
				kap</xsl:when>
      <xsl:when test="$PackagingType='YM'">Kompozit ambalaj, yekpare plastik kasa içindeki
				plastik kap</xsl:when>
      <xsl:when test="$PackagingType='YN'">Kompozit ambalaj, çelik bidon içindeki cam
				kap</xsl:when>
      <xsl:when test="$PackagingType='YP'">Kompozit ambalaj, elyaf levha kasa içindeki plastik
				kap</xsl:when>
      <xsl:when test="$PackagingType='YQ'">Kompozit ambalaj, alüminyum bidon içindeki cam
				kap</xsl:when>
      <xsl:when test="$PackagingType='YR'">Kompozit ambalaj, alüminyum kasa içindeki plastik
				kap</xsl:when>
      <xsl:when test="$PackagingType='YS'">Kompozit ambalaj, ahşap kasa içindeki cam
				kap</xsl:when>
      <xsl:when test="$PackagingType='YT'">Kompozit ambalaj, kontraplak bidon içindeki cam
				kap</xsl:when>
      <xsl:when test="$PackagingType='YV'">Kompozit ambalaj, hasır sepet içindeki cam
				kap</xsl:when>
      <xsl:when test="$PackagingType='YW'">Kompozit ambalaj, elyaf bidon içindeki cam
				kap</xsl:when>
      <xsl:when test="$PackagingType='YX'">Kompozit ambalaj, elyaf levha kasa içindeki cam
				kap</xsl:when>
      <xsl:when test="$PackagingType='YY'">Kompozit ambalaj, genişleyebilir plastik paket
				içindeki cam kap</xsl:when>
      <xsl:when test="$PackagingType='YZ'">Kompozit ambalaj, yekpare plastik paket içindeki
				cam kap</xsl:when>
      <xsl:when test="$PackagingType='ZA'">Ortaboy çok duvarlı kağıt dolum
				konteynerı</xsl:when>
      <xsl:when test="$PackagingType='ZB'">Büyük boy torba</xsl:when>
      <xsl:when test="$PackagingType='ZC'">Ortaboy çok duvarlı su geçirmez kağıt dolum
				konteynerı</xsl:when>
      <xsl:when test="$PackagingType='ZL'">Ortaboy kompozit yekpare sert plastik dolum
				konteynerı</xsl:when>
      <xsl:when test="$PackagingType='ZM'">Ortaboy kompozit yekpare esnek plastik dolum
				konteynerı</xsl:when>
      <xsl:when test="$PackagingType='ZN'">Ortaboy kompozit sıkıştırılmış sert plastik dolum
				konteynerı</xsl:when>
      <xsl:when test="$PackagingType='ZP'">Ortaboy kompozit sıkıştırılmış esnek plastik dolum
				konteynerı</xsl:when>
      <xsl:when test="$PackagingType='ZQ'">Sıvılar için ortaboy kompozit sert plastik dolum
				konteynerı</xsl:when>
      <xsl:when test="$PackagingType='ZR'">Sıvılar için ortaboy kompozit esnek plastik dolum
				konteynerı</xsl:when>
      <xsl:when test="$PackagingType='ZS'">Ortaboy kompozit dolum konteynerı</xsl:when>
      <xsl:when test="$PackagingType='ZT'">Ortaboy elyaf levha dolum konteynerı</xsl:when>
      <xsl:when test="$PackagingType='ZU'">Ortaboy esnek dolum konteynerı</xsl:when>
      <xsl:when test="$PackagingType='ZW'">Ortaboy doğal ahşap dolum konteynerı</xsl:when>
      <xsl:when test="$PackagingType='ZX'">Ortaboy kontraplak dolum konteynerı</xsl:when>
      <xsl:when test="$PackagingType='ZY'">Ortaboy sunta dolum konteynerı</xsl:when>
      <xsl:otherwise>
        <xsl:value-of select="$PackagingType" />
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
      <xsl:otherwise>
        <xsl:value-of select="$CountryType" />
      </xsl:otherwise>
    </xsl:choose>
  </xsl:template>
  <xsl:template name="Party_Other">
    <xsl:param name="PartyType" />
    <xsl:for-each select="cbc:WebsiteURI">
      <tr align="left">
        <td>
          <xsl:text>Web Sitesi: </xsl:text>
          <xsl:value-of select="." />
        </td>
      </tr>
    </xsl:for-each>
    <xsl:for-each select="cac:Contact/cbc:ElectronicMail">
      <tr align="left">
        <td>
          <xsl:text>E-Posta: </xsl:text>
          <xsl:value-of select="." />
        </td>
      </tr>
    </xsl:for-each>
    <xsl:for-each select="cac:Contact">
      <xsl:if test="cbc:Telephone or cbc:Telefax">
        <tr align="left">
          <td style="width:469px; " align="left">
            <xsl:for-each select="cbc:Telephone">
              <xsl:text>Tel: </xsl:text>
              <xsl:apply-templates />
            </xsl:for-each>
            <xsl:for-each select="cbc:Telefax">
              <xsl:text> Fax: </xsl:text>
              <xsl:apply-templates />
            </xsl:for-each>
            <xsl:text> </xsl:text>
          </td>
        </tr>
      </xsl:if>
    </xsl:for-each>
    <xsl:if test="$PartyType!='TAXFREE' and not(starts-with($PartyType, 'EXPORT'))">
      <xsl:for-each select="cac:PartyTaxScheme/cac:TaxScheme/cbc:Name">
        <tr align="left">
          <td>
            <xsl:text>Vergi Dairesi: </xsl:text>
            <xsl:apply-templates />
          </td>
        </tr>
      </xsl:for-each>
      <xsl:for-each select="cac:PartyIdentification">
        <tr align="left">
          <td>
            <xsl:value-of select="cbc:ID/@schemeID" />
            <xsl:text>: </xsl:text>
            <xsl:value-of select="cbc:ID" />
          </td>
        </tr>
      </xsl:for-each>
      <xsl:for-each select="cac:AgentParty/cac:PartyIdentification">
        <tr align="left">
          <td>
            <xsl:value-of select="cbc:ID/@schemeID" />
            <xsl:text>: </xsl:text>
            <xsl:value-of select="cbc:ID" />
          </td>
        </tr>
      </xsl:for-each>
    </xsl:if>
  </xsl:template>
  <xsl:template name="Curr_Type">
    <xsl:value-of select="format-number(., '###.##0,00', 'european')" />
    <xsl:if test="@currencyID">
      <xsl:text></xsl:text>
      <xsl:choose>
        <xsl:when test="@currencyID = 'TRL' or @currencyID = 'TRY'">
          <xsl:text>TL</xsl:text>
        </xsl:when>
        <xsl:otherwise>
          <xsl:value-of select="@currencyID" />
        </xsl:otherwise>
      </xsl:choose>
    </xsl:if>
  </xsl:template>
</xsl:stylesheet>