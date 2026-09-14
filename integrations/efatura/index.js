const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const exporter = require('./console-export');
const renderer = require('./renderer');

function atomicJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(tmp, file);
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
        this.settings = { pollSeconds: 30, batchLimit: 5, changeWindowDays: 7, ...(host.manifest.settings || {}) };
        fs.mkdirSync(host.dataDir, { recursive: true });
        this.state = new State(path.join(host.dataDir, 'state.json'));
        this.logFile = path.join(host.dataDir, 'efatura.log');
        this.timer = null;
        this.running = false;
        this.lastRun = null;
        this.lastError = null;
        this.lastResult = null;
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

    claimsWatcherDocument(item) {
        return !!item
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
        if (!contact || !contact.valid || !contact.phone) {
            this.state.setDoc(itemKey, { status: 'skipped', reason: 'gecerli cari cep telefonu yok', cariInd: row.CARIIND });
            return { skipped: 'telefon-yok', belgeNo: row.BELGENO };
        }
        if (contact.pasif) {
            this.state.setDoc(itemKey, { status: 'skipped', reason: 'cari pasif', cariInd: row.CARIIND });
            return { skipped: 'cari-pasif', belgeNo: row.BELGENO };
        }

        const gate = this.host.gate ? this.host.gate('watcher') : { ok: true };
        if (gate && gate.ok === false) return { paused: gate.reason || 'gonderim limiti', belgeNo: row.BELGENO };

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
                designsDir: path.join(this.host.integrationDir, 'designs'),
                documentType: row.DOCUMENT_TYPE,
                invoiceVkn: this.settings.invoiceVkn,
                xml: exported.xml,
                xmlPath: exported.xmlPath,
                htmlPath,
                saxonDir: consoleDir,
                electron: this.host.electron,
            });
            const text = caption(mode === 'update' ? this.settings.updatedCaption : this.settings.caption, row, contact);
            const fileName = `${String(row.BELGENO).replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`;
            const result = await this.host.waSend(contact.phone, text, {
                kind: 'document', buffer: rendered.pdf, mimetype: 'application/pdf', fileName,
            }, { simulateTyping: true, typingMs: 1200, channel: 'watcher' });
            if (!result || result.success === false) throw new Error((result && (result.error || result.message)) || 'WhatsApp gonderimi basarisiz');
            this.state.setDoc(itemKey, {
                status: 'sent', sentAt: new Date().toISOString(), type: row.DOCUMENT_TYPE,
                contextKey: this.key(ctx), ind: Number(row.IND), belgeNo: row.BELGENO,
                phone: contact.phone, cariInd: row.CARIIND, design: rendered.design,
                contactName: contact.name || '', invoiceDate: row.TARIH, amount: row.TUTAR,
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
            this.log('INFO', `${row.BELGENO} ${row.DOCUMENT_TYPE} PDF ${mode === 'update' ? 'guncellenerek ' : ''}gonderildi (${rendered.design}, ${rendered.pdf.length} bayt)`);
            return { sent: true, updated: mode === 'update', recalled, belgeNo: row.BELGENO, type: row.DOCUMENT_TYPE, design: rendered.design };
        } finally {
            try { fs.unlinkSync(htmlPath); } catch { /* gecici dosya yok */ }
            try { fs.unlinkSync(exported.xmlPath); } catch { /* Vega temp temizligi kritik degil */ }
        }
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
        const text = caption(this.settings.cancelledCaption, invoice, { name: doc.contactName || '' });
        const result = await this.host.waSend(doc.phone, text, null, {
            simulateTyping: true, typingMs: 900, channel: 'watcher',
        });
        if (!result || result.success === false) throw new Error((result && (result.error || result.message)) || 'iptal bildirimi gonderilemedi');
        this.state.setDoc(doc.key, {
            status: reason === 'silindi' ? 'deleted' : 'cancelled',
            cancelledAt: new Date().toISOString(), cancelReason: reason, recalled,
            cancelMessageId: result.id || (result.key && result.key.id) || null,
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
                results.push({ belgeNo: doc.belgeNo, error: e.message });
                break;
            }
        }
        return results;
    }

    async tick() {
        if (this.running) return { skipped: 'onceki tarama suruyor' };
        this.running = true;
        this.lastRun = new Date().toISOString();
        try {
            const pool = this.host.getPool && this.host.getPool();
            if (!pool || !pool.connected) return { skipped: 'veritabani bagli degil' };
            const ctx = await this.currentContext(pool);
            if (!ctx) return { skipped: 'firma secilmemis' };
            const ctxKey = this.key(ctx);
            let stateCtx = this.state.context(ctxKey);
            if (!stateCtx) {
                const max = await db.maxInvoiceInd(pool, ctx);
                this.state.init(ctxKey, max);
                this.log('INFO', `${ctxKey} ilk kurulum: mevcut faturalar atlandi, baslangic IND=${max}`);
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
                    this.log('ERROR', `${row.BELGENO} islenemedi: ${e.message}`);
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
        this.log('INFO', `entegrasyon basladi; dizayn klasoru ${path.join(this.host.integrationDir, 'designs')}`);
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
        return {
            running: !!this.timer,
            busy: this.running,
            lastRun: this.lastRun,
            lastError: this.lastError,
            lastResult: this.lastResult,
            task,
            dataDir: this.host.dataDir,
            designsDir: path.join(this.host.integrationDir, 'designs'),
        };
    }
}

module.exports = { create: host => new Integration(host), Integration, State, caption, fingerprint };
