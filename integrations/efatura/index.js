const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const exporter = require('./console-export');
const renderer = require('./renderer');

// Virus tarayici/yedekleme araci dosyayi kisa sure kilitleyince rename EPERM
// verir. Canlida bu tum taramayi dusurdu; birkac kez dene, olmazsa dogrudan yaz.
function sleepSync(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function atomicJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const text = JSON.stringify(value, null, 2);
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, text, 'utf8');
    for (let attempt = 0; attempt < 5; attempt++) {
        try { fs.renameSync(tmp, file); return; }
        catch { sleepSync(80); }
    }
    try { fs.writeFileSync(file, text, 'utf8'); }
    finally { try { fs.unlinkSync(tmp); } catch { /* sonraki yazimda ustune gelir */ } }
}

// TR cep numarasi → 905xxxxxxxxx (bos/gecersizse '').
function normalizeTestPhone(raw) {
    let d = String(raw || '').replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('0')) d = '90' + d.slice(1);
    else if (d.length === 10 && d.startsWith('5')) d = '90' + d;
    return /^905\d{9}$/.test(d) ? d : '';
}

// Program Files'taki integration.json yonetici ister; makineye ozel ayarlar
// ProgramData\...\efatura\settings.json ile ezilir (ornegin test numarasi).
function readLocalSettings(dataDir) {
    try { return JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8')) || {}; }
    catch { return {}; }
}

function formatMoney(value) {
    return (Number(value) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value || '') : d.toLocaleDateString('tr-TR');
}

function caption(template, row, contact) {
    const values = {
        '{unvan}': contact.name || '',
        '{belgeno}': row.BELGENO || '',
        '{tarih}': formatDate(row.TARIH),
        '{tutar}': formatMoney(row.TUTAR),
        '{parabirimi}': row.PARABIRIMI || 'TL',
        '{belgeturu}': row.DOCUMENT_TYPE === 'earsiv' ? 'e-Arsiv fatura' : 'e-Fatura',
        '{ettn}': row.EFATURAUUID || row.ETTN || '',
    };
    return Object.entries(values).reduce((s, [k, v]) => s.split(k).join(v), String(template || ''));
}

function fingerprint(row) {
    const values = [
        row.BELGENO, row.TARIH instanceof Date ? row.TARIH.toISOString() : row.TARIH,
        String(row.TUTAR == null ? '' : row.TUTAR), row.PARABIRIMI, row.CARIIND,
        !!row.EFATURA, row.EFATURAUUID, row.BELGETIPI, !!row.IPTAL, !!row.IADE,
        row.LADATE instanceof Date ? row.LADATE.toISOString() : row.LADATE,
        String(row.LINE_COUNT == null ? 0 : row.LINE_COUNT), row.LINE_CHECKSUM || 0,
    ];
    return crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

class State {
    constructor(file) {
        this.file = file;
        this.data = { version: 2, contexts: {}, documents: {} };
        try { this.data = { ...this.data, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* ilk calisma */ }
        this.data.version = 2;
    }
    context(key) { return this.data.contexts[key] || null; }
    init(key, baselineMax) {
        this.data.contexts[key] = { baselineMax, scanAfter: baselineMax, initializedAt: new Date().toISOString() };
        this.save();
    }
    scanAfter(key, value) { this.data.contexts[key].scanAfter = value; this.save(); }
    doc(key) { return this.data.documents[key] || null; }
    setDoc(key, value) { this.data.documents[key] = { ...(this.data.documents[key] || {}), ...value, updatedAt: new Date().toISOString() }; this.save(); }
    docsForContext(contextKey) {
        return Object.entries(this.data.documents)
            .filter(([key, value]) => value.contextKey === contextKey || key.startsWith(`${contextKey}:`))
            .map(([key, value]) => ({ key, ...value }));
    }
    save() { atomicJson(this.file, this.data); }
}

class Integration {
    constructor(host) {
        this.host = host;
        fs.mkdirSync(host.dataDir, { recursive: true });
        this.settings = {
            pollSeconds: 30, batchLimit: 5, changeWindowDays: 7,
            ...(host.manifest.settings || {}), ...readLocalSettings(host.dataDir),
        };
        // TEST MODU: dolu ise butun PDF/iptal mesajlari cari yerine bu numaraya gider.
        // Ayarlar'dan acilir, varsayilan KAPALI. Acik unutulmasin diye surelidir:
        // testUntil gecince kendiliginden gercek carilere doner.
        this._testPhone = normalizeTestPhone(this.settings.testPhone);
        this._testUntil = Date.parse(this.settings.testUntil) || 0;
        this.state = new State(path.join(host.dataDir, 'state.json'));
        // Guncelleme Program Files'i sildigi icin musteri dosyalari ProgramData'da;
        // Ayarlar > e-Fatura > "Klasoru ac" ile tek tikla ulasilir.
        this.designsDir = path.join(host.dataDir, 'dizaynlar');
        fs.mkdirSync(this.designsDir, { recursive: true });
        this.logFile = path.join(host.dataDir, 'efatura-log.txt');
        this.timer = null;
        this.running = false;
        this.lastRun = null;
        this.lastError = null;
        this.lastResult = null;
    }

    // Suresi dolan test modu ilk okumada kendini kapatir; tick ve status da bu
    // getter'dan gectigi icin program acik kalsa bile gercek cariye geri doner.
    get testPhone() {
        if (!this._testPhone) return '';
        if (this._testUntil && Date.now() > this._testUntil) {
            this._testPhone = '';
            this._testUntil = 0;
            this.settings.testPhone = '';
            this.settings.testUntil = null;
            this.writeLocalSettings({ testPhone: '', testUntil: null });
            this.log('INFO', 'test modu suresi doldu; PDF gonderimi gercek carilere dondu');
        }
        return this._testPhone;
    }

    testModeStatus() {
        const phone = this.testPhone;
        return { testPhone: phone || null, testUntil: phone && this._testUntil ? new Date(this._testUntil).toISOString() : null };
    }

    // Ayarlar > e-Fatura > Test modu. phone bos ise kapatir.
    setTestMode({ phone, minutes } = {}) {
        const target = normalizeTestPhone(phone);
        if (phone && !target) throw new Error('Test numarasi gecersiz. Ornek: 5350786101');
        const mins = Number(minutes);
        const until = target && Number.isFinite(mins) && mins > 0 ? Date.now() + mins * 60000 : 0;
        this._testPhone = target;
        this._testUntil = until;
        this.settings.testPhone = target;
        this.settings.testUntil = until ? new Date(until).toISOString() : null;
        this.writeLocalSettings({ testPhone: target, testUntil: this.settings.testUntil });
        this.log('INFO', target
            ? `test modu acildi → ${target}${until ? ` (${new Date(until).toLocaleString('tr-TR')} kadar)` : ' (sure sinirsiz)'}`
            : 'test modu kapatildi; PDF gonderimi gercek carilere gider');
        return this.testModeStatus();
    }

    // integration.json Program Files'ta (yonetici ister); makineye ozel ayar
    // ProgramData...efaturasettings.json icinde tutulur.
    writeLocalSettings(patch) {
        const file = path.join(this.host.dataDir, 'settings.json');
        atomicJson(file, { ...readLocalSettings(this.host.dataDir), ...patch });
    }

    // Ana ekrandaki "Son gonderilenler" listesine yaz. e-Fatura hatasi
    // ProgramData logunda saklı kalmasin: belge metin olarak da gitmediği icin
    // kullanici ekranda gormezse musteri hic mesaj almamis olur.
    uiLog(entry) {
        try { if (typeof this.host.log === 'function') this.host.log({ ruleName: 'e-Fatura PDF', ...entry }); }
        catch { /* ana log yazilamadi, dosya logu yeterli */ }
    }

    log(level, message) {
        const line = `${new Date().toISOString()} [${level}] ${message}`;
        try { fs.appendFileSync(this.logFile, line + '\n', 'utf8'); } catch { /* console yine calisir */ }
        const fn = level === 'ERROR' ? console.error : (level === 'WARN' ? console.warn : console.log);
        fn(`[e-Fatura] ${message}`);
    }

    async currentContext(pool) {
        const raw = this.host.getContext && this.host.getContext();
        return await db.resolveContext(pool, raw);
    }

    key(ctx) { return `F${ctx.firmaNo}D${ctx.donemNo}`; }
    documentKey(ctx, row) { return `${this.key(ctx)}:${row.IND}`; }

    // Ayarlardaki tus. Varsayilan KAPALI: guncellemeyle herkese dagitildigi icin
    // musteri acmadikca hicbir sey yapilmaz. enabledAt, acildigi an baslangic icin.
    enabledInfo() {
        const e = this.host.getEnabled ? this.host.getEnabled() : null;
        return { enabled: !!(e && e.enabled), enabledAt: (e && e.enabledAt) || null };
    }

    claimsWatcherDocument(item) {
        // Kapaliyken belge mesajlari eskisi gibi metin olarak gitmeye devam eder.
        return this.enabledInfo().enabled
            && !!item
            && item.docType === 'satisFaturasi'
            && String(item.evrak || '').trim().length === 16;
    }

    async recallMessage(doc) {
        if (!doc || !doc.phone || !doc.waMessageId || !this.host.waDelete) return { skipped: true };
        try {
            const result = await this.host.waDelete(doc.phone, doc.waMessageId);
            if (!result || result.success === false) throw new Error((result && (result.error || result.message)) || 'mesaj geri cekilemedi');
            return { success: true };
        } catch (e) {
            this.log('WARN', `${doc.belgeNo || doc.ind} onceki PDF geri cekilemedi: ${e.message}`);
            return { success: false, error: e.message };
        }
    }

    async processOne(ctx, row, mode = 'initial') {
        const itemKey = this.documentKey(ctx, row);
        const old = this.state.doc(itemKey);
        if (mode === 'initial' && old && (old.status === 'sent' || old.status === 'skipped')) return { skipped: old.status, belgeNo: row.BELGENO };

        const contacts = await this.host.resolveCariContacts(ctx.firmaNo, [Number(row.CARIIND)]);
        const contact = contacts.get(Number(row.CARIIND));
        if (!this.testPhone && (!contact || !contact.valid || !contact.phone)) {
            this.state.setDoc(itemKey, { status: 'skipped', reason: 'gecerli cari cep telefonu yok', cariInd: row.CARIIND });
            this.uiLog({ status: 'noPhone', name: (contact && contact.name) || 'e-Fatura', evrak: row.BELGENO, error: 'PDF gonderilemedi: cari cep telefonu yok' });
            return { skipped: 'telefon-yok', belgeNo: row.BELGENO };
        }
        if (contact && contact.pasif && !this.testPhone) {
            this.state.setDoc(itemKey, { status: 'skipped', reason: 'cari pasif', cariInd: row.CARIIND });
            this.uiLog({ status: 'pasif', name: contact.name || 'e-Fatura', evrak: row.BELGENO, error: 'PDF gonderilmedi: cari pasif' });
            return { skipped: 'cari-pasif', belgeNo: row.BELGENO };
        }

        const gate = this.host.gate ? this.host.gate('watcher') : { ok: true };
        if (gate && gate.ok === false) return { paused: gate.reason || 'gonderim limiti', belgeNo: row.BELGENO };

        if (!renderer.hasAnyDesign(this.designsDir, row.DOCUMENT_TYPE)) {
            const base = row.DOCUMENT_TYPE === 'earsiv' ? 'earchive' : 'invoice';
            throw new Error(`dizayn yok, gonderilmedi: ${base}.xslt veya ${base}_<VKN>.xslt dizaynlar klasorune konmali`);
        }

        const consoleDir = exporter.findConsoleDir(this.settings.consoleDir);
        const exported = await exporter.exportInvoice({
            ind: row.IND,
            expectedBelgeNo: row.BELGENO,
            consoleDir,
            taskName: this.settings.taskName,
            dataDir: this.host.dataDir,
        });
        const workDir = path.join(this.host.dataDir, 'work');
        fs.mkdirSync(workDir, { recursive: true });
        const safeName = `${row.IND}-${String(row.BELGENO).replace(/[^A-Za-z0-9._-]/g, '_')}`;
        const htmlPath = path.join(workDir, `${safeName}.html`);
        try {
            const rendered = await renderer.render({
                integrationDir: this.host.integrationDir,
                designsDir: this.designsDir,
                documentType: row.DOCUMENT_TYPE,
                invoiceVkn: this.settings.invoiceVkn,
                xml: exported.xml,
                xmlPath: exported.xmlPath,
                htmlPath,
                saxonDir: consoleDir,
                electron: this.host.electron,
            });
            const who = contact || { name: '' };
            const target = this.testTarget(who);
            const text = target.prefix + caption(mode === 'update' ? this.settings.updatedCaption : this.settings.caption, row, who);
            const fileName = `${String(row.BELGENO).replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`;
            const result = await this.host.waSend(target.phone, text, {
                kind: 'document', buffer: rendered.pdf, mimetype: 'application/pdf', fileName,
            }, { simulateTyping: true, typingMs: 1200, channel: 'watcher' });
            if (!result || result.success === false) throw new Error((result && (result.error || result.message)) || 'WhatsApp gonderimi basarisiz');
            this.state.setDoc(itemKey, {
                status: 'sent', sentAt: new Date().toISOString(), type: row.DOCUMENT_TYPE,
                contextKey: this.key(ctx), ind: Number(row.IND), belgeNo: row.BELGENO,
                phone: target.phone, cariInd: row.CARIIND, design: rendered.design, testMode: !!this.testPhone,
                contactName: who.name || '', invoiceDate: row.TARIH, amount: row.TUTAR,
                currency: row.PARABIRIMI || 'TL', fingerprint: fingerprint(row),
                waMessageId: result.id || (result.key && result.key.id) || null,
                revision: mode === 'update' ? Number((old && old.revision) || 1) + 1 : 1,
                pdfBytes: rendered.pdf.length, exportMode: exported.mode,
            });
            let recalled = null;
            if (mode === 'update' && old && old.waMessageId) {
                recalled = await this.recallMessage(old);
                this.state.setDoc(itemKey, { previousRecall: recalled, previousWaMessageId: old.waMessageId });
            }
            this.uiLog({
                status: mode === 'update' ? 'edited' : 'sent',
                name: (this.testPhone ? '[TEST] ' : '') + (who.name || 'e-Fatura'),
                phone: target.phone, evrak: row.BELGENO, tutar: formatMoney(row.TUTAR),
                error: `PDF ${mode === 'update' ? 'guncellendi' : 'gonderildi'} (${rendered.design})`,
            });
            this.log('INFO', `${row.BELGENO} ${row.DOCUMENT_TYPE} PDF ${mode === 'update' ? 'guncellenerek ' : ''}gonderildi (${rendered.design}, ${rendered.pdf.length} bayt)${this.testPhone ? ` [TEST → ${target.phone}]` : ''}`);
            return { sent: true, updated: mode === 'update', recalled, belgeNo: row.BELGENO, type: row.DOCUMENT_TYPE, design: rendered.design };
        } finally {
            try { fs.unlinkSync(htmlPath); } catch { /* gecici dosya yok */ }
            try { fs.unlinkSync(exported.xmlPath); } catch { /* Vega temp temizligi kritik degil */ }
        }
    }

    // Test modunda alici test numarasi olur; mesajin basina gercek alici yazilir ki
    // testte kimin alacagi gorulsun.
    testTarget(contact) {
        if (!this.testPhone) return { phone: contact.phone, prefix: '' };
        const real = contact && contact.phone ? contact.phone : 'telefon yok';
        return {
            phone: this.testPhone,
            prefix: `🔔 TEST — gercek alici: ${(contact && contact.name) || '(cari adi yok)'} (${real})\n`,
        };
    }

    async cancelOne(ctx, doc, row, reason) {
        if (!doc || doc.status !== 'sent') return { skipped: true };
        const gate = this.host.gate ? this.host.gate('watcher') : { ok: true };
        if (gate && gate.ok === false) return { paused: gate.reason || 'gonderim limiti', belgeNo: doc.belgeNo };

        const recalled = await this.recallMessage(doc);
        const invoice = row || {
            BELGENO: doc.belgeNo, TARIH: doc.invoiceDate, TUTAR: doc.amount,
            PARABIRIMI: doc.currency, DOCUMENT_TYPE: doc.type,
        };
        // Test modunda gonderilen belge doc.phone'da zaten test numarasini tasir.
        const prefix = (this.testPhone || doc.testMode) ? `🔔 TEST — gercek alici: ${doc.contactName || '(cari adi yok)'}\n` : '';
        const text = prefix + caption(this.settings.cancelledCaption, invoice, { name: doc.contactName || '' });
        const result = await this.host.waSend(doc.phone, text, null, {
            simulateTyping: true, typingMs: 900, channel: 'watcher',
        });
        if (!result || result.success === false) throw new Error((result && (result.error || result.message)) || 'iptal bildirimi gonderilemedi');
        this.state.setDoc(doc.key, {
            status: reason === 'silindi' ? 'deleted' : 'cancelled',
            cancelledAt: new Date().toISOString(), cancelReason: reason, recalled,
            cancelMessageId: result.id || (result.key && result.key.id) || null,
        });
        this.uiLog({
            status: 'recalled', name: doc.contactName || 'e-Fatura', phone: doc.phone,
            evrak: doc.belgeNo || String(doc.ind), error: `fatura ${reason}; musteriye iptal bildirimi gonderildi`,
        });
        this.log('INFO', `${doc.belgeNo || doc.ind} ${reason}; musteriye iptal bildirimi gonderildi`);
        return { cancelled: true, reason, belgeNo: doc.belgeNo };
    }

    async reconcileSent(pool, ctx) {
        const contextKey = this.key(ctx);
        const cutoff = Date.now() - Math.max(1, Number(this.settings.changeWindowDays) || 7) * 86400000;
        const watched = this.state.docsForContext(contextKey)
            .filter(d => d.status === 'sent' && Number(d.ind) > 0)
            .filter(d => !d.sentAt || Date.parse(d.sentAt) >= cutoff)
            .slice(0, 1000);
        if (!watched.length) return [];

        const rows = await db.documentStates(pool, ctx, watched.map(d => d.ind));
        const current = new Map(rows.map(r => [Number(r.IND), r]));
        const results = [];
        for (const doc of watched) {
            if (results.length >= Number(this.settings.batchLimit || 5)) break;
            const row = current.get(Number(doc.ind));
            try {
                if (!row) {
                    results.push(await this.cancelOne(ctx, doc, null, 'silindi'));
                    continue;
                }
                if (row.IPTAL || row.IADE) {
                    results.push(await this.cancelOne(ctx, doc, row, 'iptal'));
                    continue;
                }
                if (String(row.BELGENO || '').trim().length !== 16) continue;
                const currentFingerprint = fingerprint(row);
                if (!doc.fingerprint) {
                    this.state.setDoc(doc.key, { fingerprint: currentFingerprint });
                    continue;
                }
                if (doc.fingerprint !== currentFingerprint) results.push(await this.processOne(ctx, row, 'update'));
            } catch (e) {
                this.state.setDoc(doc.key, { lastChangeError: e.message, changeAttempts: Number(doc.changeAttempts || 0) + 1 });
                this.lastError = e.message;
                this.log('ERROR', `${doc.belgeNo || doc.ind} degisiklik/iptal islenemedi: ${e.message}`);
                this.uiLog({ status: 'failed', name: doc.contactName || 'e-Fatura PDF', evrak: doc.belgeNo || String(doc.ind), error: `degisiklik/iptal islenemedi: ${e.message}` });
                results.push({ belgeNo: doc.belgeNo, error: e.message });
                break;
            }
        }
        return results;
    }

    async tick() {
        if (this.running) return { skipped: 'onceki tarama suruyor' };
        const { enabled, enabledAt } = this.enabledInfo();
        if (!enabled) return { skipped: 'ayarlardan kapali' };
        this.running = true;
        this.lastRun = new Date().toISOString();
        try {
            const pool = this.host.getPool && this.host.getPool();
            if (!pool || !pool.connected) return { skipped: 'veritabani bagli degil' };
            const ctx = await this.currentContext(pool);
            if (!ctx) return { skipped: 'firma secilmemis' };
            const ctxKey = this.key(ctx);
            let stateCtx = this.state.context(ctxKey);
            // Baslangic, tusun ACILDIGI an alinir: kapaliyken (ya da eski surumde) kesilen
            // faturalar acildiktan sonra toplu gitmesin.
            const staleBaseline = stateCtx && enabledAt
                && !(Date.parse(stateCtx.initializedAt) >= Date.parse(enabledAt));
            if (!stateCtx || staleBaseline) {
                const max = await db.maxInvoiceInd(pool, ctx);
                this.state.init(ctxKey, max);
                this.log('INFO', `${ctxKey} gonderim acildi: mevcut faturalar atlandi, baslangic IND=${max}`);
                return { initialized: true, context: ctxKey, baselineMax: max };
            }

            const wa = this.host.waStatus && this.host.waStatus();
            if (!wa || !wa.ready) return { skipped: 'WhatsApp hazir degil', context: ctxKey };

            const changed = await this.reconcileSent(pool, ctx);
            if (changed.some(x => x && (x.cancelled || x.updated || x.error || x.paused))) {
                this.lastResult = { context: ctxKey, processed: changed.length, changes: changed };
                return this.lastResult;
            }

            let rows = await db.readyDocuments(pool, ctx, { afterInd: stateCtx.scanAfter, limit: 50 });
            if (!rows.length && stateCtx.scanAfter !== stateCtx.baselineMax) {
                this.state.scanAfter(ctxKey, stateCtx.baselineMax); // gec tamamlanan hareketleri yeniden tara
                stateCtx = this.state.context(ctxKey);
                rows = await db.readyDocuments(pool, ctx, { afterInd: stateCtx.scanAfter, limit: 50 });
            }
            if (!rows.length) return { processed: 0, context: ctxKey };

            // Imlec yalniz gercekten ele alinan satira kadar ilerler. Tur batch
            // sinirinda ya da kota kapisinda kesilirse kalan satirlar bir sonraki
            // turda kaldigi yerden gelir. Hata alan belge imleci gecer; yeniden
            // deneme, satir kalmadiginda yapilan tam tarama turunda olur.
            const results = [];
            this.lastError = null;
            let cursor = Number(stateCtx.scanAfter) || 0;
            for (const row of rows) {
                if (results.filter(x => x.sent).length >= Number(this.settings.batchLimit || 5)) break;
                try {
                    const result = await this.processOne(ctx, row);
                    results.push(result);
                    if (result.paused) break;
                    cursor = Number(row.IND);
                } catch (e) {
                    const itemKey = this.documentKey(ctx, row);
                    const previous = this.state.doc(itemKey) || {};
                    this.state.setDoc(itemKey, { status: 'error', attempts: Number(previous.attempts || 0) + 1, lastError: e.message });
                    this.lastError = e.message;
                    // Ayni hata her taramada tekrarlanir (ornegin dizayn yok); log bir kez yazilsin.
                    if (previous.lastError !== e.message) {
                        this.log('ERROR', `${row.BELGENO} islenemedi: ${e.message}`);
                        this.uiLog({ status: 'failed', name: 'e-Fatura PDF', evrak: row.BELGENO, error: e.message });
                    }
                    results.push({ belgeNo: row.BELGENO, error: e.message });
                    cursor = Number(row.IND);
                    break;
                }
            }
            if (cursor > Number(stateCtx.scanAfter)) this.state.scanAfter(ctxKey, cursor);
            this.lastResult = { context: ctxKey, processed: results.length, results };
            return this.lastResult;
        } catch (e) {
            this.lastError = e.message;
            this.log('ERROR', `tarama hatasi: ${e.message}`);
            throw e;
        } finally {
            this.running = false;
        }
    }

    // Gorev rozeti icin schtasks sorgusu asenkron. Sonucu onbellege alip
    // status() senkron kalabilsin diye baslangicta ve her turda tazelenir.
    refreshTaskState() {
        return exporter.taskExists(this.settings.taskName)
            .then(v => { this.taskReady = v; return v; })
            .catch(() => this.taskReady);
    }

    start() {
        if (this.timer) return;
        this.refreshTaskState();
        const run = () => { this.refreshTaskState(); return this.tick().catch(() => {}); };
        run();
        this.timer = setInterval(run, Math.max(10, Number(this.settings.pollSeconds) || 30) * 1000);
        this.timer.unref && this.timer.unref();
        this.log('INFO', `entegrasyon basladi (${this.enabledInfo().enabled ? 'acik' : 'ayarlardan kapali'}); dizayn klasoru ${this.designsDir}`);
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    status() {
        let task = 'bilinmiyor';
        this.refreshTaskState();
        if (this.taskReady === true) task = 'hazir';
        else if (this.taskReady === false) task = 'kurulum-gerekli';
        let designs = [];
        try { designs = fs.readdirSync(this.designsDir).filter(f => /\.xslt$/i.test(f)); } catch { /* klasor yok */ }
        return {
            ...this.enabledInfo(),
            designs,
            logFile: this.logFile,
            running: !!this.timer,
            busy: this.running,
            lastRun: this.lastRun,
            lastError: this.lastError,
            lastResult: this.lastResult,
            task,
            ...this.testModeStatus(),
            dataDir: this.host.dataDir,
            designsDir: this.designsDir,
        };
    }
}

module.exports = { create: host => new Integration(host), Integration, State, caption, fingerprint };
